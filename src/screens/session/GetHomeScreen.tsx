import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { CarIcon, CheckIcon, HomeIcon, WalkIcon } from '@/components/icons'
import { Header, Screen, inputClass } from '@/components/ui'
import { buttonClass } from '@/components/buttons'
import { HoldButton } from '@/components/HoldButton'
import { isIOS } from '@/lib/device'
import { distanceM, formatDistance } from '@/lib/geo'
import { searchPlaces } from '@/lib/places'
import { getRideApp, rideUrl } from '@/lib/ridePref'
import { errorText } from '@/lib/toast'
import { supabase } from '@/lib/supabase'
import { formatClock } from '@/lib/time'
import type { LatLng } from '@/lib/types'
import { useSessionCtx } from './context'

// Real SafeRide dispatch line (override with VITE_SAFERIDE_PHONE).
const SAFERIDE_PHONE = (import.meta.env.VITE_SAFERIDE_PHONE ?? '').trim() || '+12173848188'

// Within this distance of the saved home counts as home: "I'm home" asks once
// more when farther, and the arrival prompt appears when closer.
const HOME_CHECK_M = 200
// "Not yet" on the arrival prompt hides it this long.
const ARRIVAL_SNOOZE_MS = 10 * 60_000

// Rough door-to-door speeds for the ETA (straight-line distance × detour).
const DETOUR = 1.3
const MODE_SPEED: Record<string, number> = { Walking: 1.3, Ride: 8 }
// A SafeRide / ride-share pickup takes a while before you're moving.
const PICKUP_MIN: Record<string, number> = { Walking: 0, Ride: 8 }

/** Minutes home by this mode, or null without both locations. */
function etaMinutes(mode: 'Walking' | 'Ride', from: LatLng | null, home: LatLng | null): number | null {
  if (!from || !home) return null
  const sec = (distanceM(from, home) * DETOUR) / MODE_SPEED[mode]
  return Math.max(1, Math.round(sec / 60 + PICKUP_MIN[mode]))
}

const store = {
  get(k: string) {
    try {
      return sessionStorage.getItem(k)
    } catch {
      return null
    }
  },
  set(k: string, v: string | null) {
    try {
      if (v == null) sessionStorage.removeItem(k)
      else sessionStorage.setItem(k, v)
    } catch {
      // ignore
    }
  },
}

/** Opens the phone's maps app with directions to home. */
function directionsUrl(home: LatLng | null, address: string | null) {
  const dest = home ? `${home.lat},${home.lng}` : encodeURIComponent(address ?? '')
  return isIOS ? `https://maps.apple.com/?daddr=${dest}` : `https://www.google.com/maps/dir/?api=1&destination=${dest}`
}

/**
 * End my night. One simple screen:
 *  1. "End your night?": where you're going (saved home, or Change for
 *     tonight), how (Walking / Ride / Already home), one confirm button.
 *     Walking and Ride set an ETA, which starts arrival tracking.
 *  2. On your way: directions and a green hold-to-confirm "I'm home".
 * Once you're home you watch the party read-only.
 */
export function GetHomeScreen() {
  const { session, members, me, profile, myPos } = useSessionCtx()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const stageKey = `tether.homeStage.${session.id}`
  const snoozeKey = `tether.arrivalSnooze.${session.id}`
  const [chosen, setChosen] = useState(() => store.get(stageKey) === 'onway')
  const [repicking, setRepicking] = useState(false)
  const heading = me?.status === 'heading_home'
  const onTheWay = (chosen || heading) && !repicking

  const savedLL =
    profile?.home_lat != null && profile?.home_lng != null ? { lat: profile.home_lat, lng: profile.home_lng } : null
  // Tonight's destination: the saved home unless changed for tonight (not saved to the profile).
  const [dest, setDest] = useState<{ address: string; ll: LatLng | null } | null>(null)
  const homeLL = dest ? dest.ll : savedLL
  const destAddress = dest ? dest.address : profile?.home_address ?? null
  const hasHome = Boolean(homeLL || destAddress)
  const awayFromHome = homeLL && myPos ? distanceM(myPos, homeLL) : null
  const [mode, setMode] = useState<'walk' | 'ride' | 'home' | null>(null)
  const [changing, setChanging] = useState(false)
  const [query, setQuery] = useState('')
  const [finding, setFinding] = useState(false)

  async function applyDestination() {
    if (!query.trim()) return
    setFinding(true)
    const [hit] = await searchPlaces(query.trim(), myPos ?? savedLL)
    setFinding(false)
    if (!hit) {
      setError("Couldn't find that place. Try adding the city.")
      return
    }
    setError('')
    setDest({ address: hit.address ? `${hit.name}, ${hit.address}` : hit.name, ll: { lat: hit.lat, lng: hit.lng } })
    setChanging(false)
  }

  async function update(patch: Record<string, unknown>): Promise<boolean> {
    if (!me || busy) return false
    setBusy(true)
    setError('')
    const { error: err } = await supabase.from('session_members').update(patch).eq('id', me.id)
    setBusy(false)
    if (err) {
      setError(errorText(err))
      return false
    }
    return true
  }

  /**
   * Any Stage 1 choice: heading home with an ETA, then Stage 2. The ETA
   * starts arrival tracking (not home by ETA + 15 min -> check-in).
   */
  function choose(via: string) {
    store.set(stageKey, 'onway')
    setChosen(true)
    setRepicking(false)
    const mins = etaMinutes(via === 'Walking' ? 'Walking' : 'Ride', myPos, homeLL)
    void update({
      status: 'heading_home',
      status_note: `Heading home • ${via}`,
      activity: 'heading_home',
      activity_until: null,
      eta: mins != null ? new Date(Date.now() + mins * 60_000).toISOString() : null,
      leaving_with: ['solo'],
    })
  }

  async function imHome() {
    const ok = await update({
      status: 'home',
      status_note: 'Home',
      activity: null,
      activity_until: null,
      eta: null,
      lat: null,
      lng: null,
      rule_state: { home_at: new Date().toISOString() },
    })
    if (!ok) return
    store.set(stageKey, null)
    // Last one home closes the party for everyone (the server also checks
    // every 10 s, so two people tapping at once still ends it).
    const stillOut = members.filter((m) => m.id !== me?.id && m.status !== 'home')
    if (stillOut.length === 0) {
      setBusy(true)
      const { error: err } = await supabase.rpc('end_session', { p_session_id: session.id })
      setBusy(false)
      if (err) setError(errorText(err))
    }
  }

  // "I'm home" hold: asks once more when you look far from the saved home.
  const [farConfirm, setFarConfirm] = useState(false)
  const confirmHome = () => {
    if (awayFromHome != null && awayFromHome > HOME_CHECK_M) setFarConfirm(true)
    else void imHome()
  }

  // Arrival: heading home, home saved, and now within range -> ask "You're home?".
  const [snoozedUntil, setSnoozedUntil] = useState(() => Number(store.get(snoozeKey) ?? 0))
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (snoozedUntil <= now) return
    const t = window.setTimeout(() => setNow(Date.now()), snoozedUntil - now + 50)
    return () => window.clearTimeout(t)
  }, [snoozedUntil, now])
  const arrived = heading && awayFromHome != null && awayFromHome <= HOME_CHECK_M && snoozedUntil <= now

  const others = members.filter((m) => m.id !== me?.id)
  const othersHome = others.filter((m) => m.status === 'home').length
  const back = `/session/${session.id}`

  // Home: watch the party read-only from the party screen.
  if (me?.status === 'home') return <Navigate to={back} replace />

  const bigChoice =
    'flex min-h-[72px] w-full items-center gap-4 rounded-[20px] bg-surface-lowest px-5 text-left text-xl font-medium shadow-e1 active:scale-[0.98] dark:bg-surface-mid [&>svg]:text-primary-ink'

  return (
    <Screen>
      <Header title="End my night" back={back} />

      {!onTheWay ? (
        <>
          <h2 className="text-3xl font-semibold tracking-tight">End your night?</h2>

          {/* Where you're going */}
          {changing ? (
            <div className="mt-4 flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void applyDestination()}
                placeholder="Where to tonight?"
                className={inputClass}
                autoFocus
              />
              <button onClick={() => void applyDestination()} disabled={finding} className={`${buttonClass('tonal')} !w-auto`}>
                {finding ? '…' : 'Use'}
              </button>
            </div>
          ) : hasHome ? (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-surface-lowest px-4 py-3 shadow-e1 dark:bg-surface-mid">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container text-primary-on-container">
                <HomeIcon width={20} height={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-medium">{destAddress ?? 'Saved home'}</span>
                {awayFromHome != null && <span className="block text-xs text-ink-dim">{formatDistance(awayFromHome)} away</span>}
              </span>
              <button onClick={() => setChanging(true)} className="shrink-0 rounded-full px-2 py-1 text-sm font-medium text-primary-ink">
                Change
              </button>
            </div>
          ) : (
            <Link
              to="/settings?edit=home"
              className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-outline px-4 py-3 text-lg font-medium text-primary-ink"
            >
              <HomeIcon width={20} height={20} /> Add home address
            </Link>
          )}

          {/* How */}
          <p className="mt-6 text-sm font-medium text-ink-dim">How are you getting home?</p>
          <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="How are you getting home?">
            <ModeTile on={mode === 'walk'} onClick={() => setMode('walk')} icon={<WalkIcon width={26} height={26} strokeWidth={2} />} label="Walking" eta={etaMinutes('Walking', myPos, homeLL)} />
            <ModeTile on={mode === 'ride'} onClick={() => setMode('ride')} icon={<CarIcon width={26} height={26} strokeWidth={2} />} label="Ride" eta={etaMinutes('Ride', myPos, homeLL)} />
            <ModeTile on={mode === 'home'} onClick={() => setMode('home')} icon={<CheckIcon width={26} height={26} strokeWidth={2.5} />} label="Already home" />
          </div>
          {mode !== 'home' && (!myPos || !homeLL) && (
            <p className="mt-2 px-1 text-xs text-ink-dim">{!myPos ? 'Turn on location for an ETA.' : 'Add a destination for an ETA.'}</p>
          )}
          {mode === 'ride' && (
            <a href={`tel:${SAFERIDE_PHONE.replace(/[^\d+]/g, '')}`} onClick={() => choose('SafeRide')} className="mt-2 block px-1 text-sm font-medium text-primary-ink">
              Or call SafeRide
            </a>
          )}

          <div className="mt-auto pt-8">
            <button
              disabled={!mode || busy}
              onClick={() => {
                if (mode === 'walk') choose('Walking')
                else if (mode === 'ride') {
                  window.open(rideUrl(getRideApp(), myPos, homeLL, destAddress), '_blank', 'noreferrer')
                  choose(getRideApp() === 'lyft' ? 'Lyft' : 'Uber')
                } else if (mode === 'home') confirmHome()
              }}
              className={buttonClass(mode === 'home' ? 'safe' : 'primary', true)}
            >
              {mode === 'walk'
                ? 'Start walking home'
                : mode === 'ride'
                  ? `Open ${getRideApp() === 'lyft' ? 'Lyft' : 'Uber'} and go`
                  : mode === 'home'
                    ? "I'm home, end my night"
                    : 'Pick how you\'re getting home'}
            </button>
            {farConfirm && (
              <div className="mt-3 rounded-2xl border border-outline p-4" role="alertdialog" aria-labelledby="far-home-1">
                <p id="far-home-1" className="text-lg font-medium">You look {formatDistance(awayFromHome ?? 0)} from home.</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={() => setFarConfirm(false)} className={buttonClass('secondary')}>
                    Not yet
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      setFarConfirm(false)
                      void imHome()
                    }}
                    className={buttonClass('safe')}
                  >
                    I'm home
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <h2 className="text-2xl font-medium tracking-tight">Heading home</h2>
          {me?.eta && (
            <p className="mt-2 inline-flex w-fit items-center gap-2 rounded-full bg-secondary-container px-3 py-1 text-sm font-medium text-secondary-on-container">
              ETA {formatClock(me.eta)}
              {destAddress ? ` · ${destAddress}` : ''}
            </p>
          )}
          <p className="mt-1 text-base text-ink-dim">Alerts stay on until you're home.</p>
          {others.length > 0 && (
            <p className="mt-3 text-base">
              {othersHome} of {others.length} {others.length === 1 ? 'friend is' : 'friends are'} home.
            </p>
          )}

          <div className="mt-auto flex flex-col gap-3 pt-8">
            {hasHome && (
              <a
                href={directionsUrl(homeLL, destAddress)}
                target="_blank"
                rel="noreferrer"
                className={`${bigChoice}`}
              >
                Directions home
              </a>
            )}

            {farConfirm ? (
              <div className="rounded-2xl border border-outline p-4" role="alertdialog" aria-labelledby="far-home">
                <p id="far-home" className="text-xl font-medium">
                  You look {formatDistance(awayFromHome ?? 0)} from home.
                </p>
                <p className="text-base text-ink-dim">Only say you're home once you're inside.</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button onClick={() => setFarConfirm(false)} className={buttonClass('secondary', true)}>
                    Not yet
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      setFarConfirm(false)
                      void imHome()
                    }}
                    className={buttonClass('safe', true)}
                  >
                    I'm home
                  </button>
                </div>
              </div>
            ) : (
              <HoldButton
                disabled={busy}
                onComplete={confirmHome}
                ariaLabel="I'm home. Press and hold to confirm."
                className="flex min-h-[80px] w-full items-center justify-center rounded-[20px] bg-safe text-black shadow-e1 disabled:opacity-40"
              >
                {(progress) => (
                  <span className="flex items-center gap-4">
                    <HoldRing progress={progress} />
                    <span className="text-xl font-medium">{busy ? 'Saving…' : "Hold when you're home"}</span>
                  </span>
                )}
              </HoldButton>
            )}

            <button
              onClick={() => {
                store.set(stageKey, null)
                setChosen(false)
                setRepicking(true)
                setFarConfirm(false)
              }}
              className="min-h-tap rounded-full text-sm font-medium text-primary-ink"
            >
              Changed plans? Pick another way home
            </button>
          </div>
        </>
      )}

      {error && <p className="mt-4 rounded-xl bg-status-alert/10 px-4 py-3 text-base text-status-alert">{error}</p>}


      {arrived && (
        <div className="fixed inset-0 z-[2000] flex animate-fade-in justify-center bg-surface" role="alertdialog" aria-labelledby="arrived">
          <div className="flex w-full max-w-app flex-col px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <h1 id="arrived" className="text-4xl font-normal tracking-tight">
                You're home?
              </h1>
            </div>
            <button
              disabled={busy}
              onClick={() => void imHome()}
              className="flex min-h-[72px] w-full items-center justify-center gap-3 rounded-full bg-safe text-2xl font-medium text-black shadow-e1 active:scale-[0.98] disabled:opacity-40"
            >
              <CheckIcon width={28} height={28} strokeWidth={2.5} /> Yes, I'm home
            </button>
            <button
              onClick={() => {
                const until = Date.now() + ARRIVAL_SNOOZE_MS
                store.set(snoozeKey, String(until))
                setSnoozedUntil(until)
                setNow(Date.now())
              }}
              className="mt-3 min-h-[52px] rounded-full text-lg font-medium text-primary-ink"
            >
              Not yet
            </button>
          </div>
        </div>
      )}
    </Screen>
  )
}

/** Small ring that fills while the button is held. */
function HoldRing({ progress }: { progress: number }) {
  return (
    <svg viewBox="0 0 100 100" className="h-12 w-12 -rotate-90" aria-hidden="true">
      <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="12" />
      <circle
        cx="50"
        cy="50"
        r="42"
        fill="none"
        stroke="black"
        strokeWidth="12"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${progress * 100} 100`}
      />
    </svg>
  )
}

/** One of Walking / Ride / Already home: big icon tile, obvious when picked. */
function ModeTile({ on, onClick, icon, label, eta }: { on: boolean; onClick: () => void; icon: ReactNode; label: string; eta?: number | null }) {
  return (
    <button
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`flex min-h-[96px] flex-col items-center justify-center gap-1 rounded-[20px] border-2 px-1 text-center transition-colors active:scale-[0.98] ${
        on ? 'border-primary bg-primary-container text-primary-on-container' : 'border-transparent bg-surface-lowest shadow-e1 dark:bg-surface-mid'
      }`}
    >
      {icon}
      <span className="text-base font-semibold leading-tight">{label}</span>
      {eta != null && <span className="text-xs opacity-75">~{eta} min</span>}
    </button>
  )
}
