import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CarIcon, CheckIcon, PhoneIcon, WalkIcon } from '@/components/icons'
import { Header, Screen } from '@/components/ui'
import { buttonClass } from '@/components/buttons'
import { HoldButton } from '@/components/HoldButton'
import { isIOS } from '@/lib/device'
import { distanceM, formatDistance } from '@/lib/geo'
import { getRideApp, rideUrl } from '@/lib/ridePref'
import { errorText } from '@/lib/toast'
import { supabase } from '@/lib/supabase'
import type { LatLng } from '@/lib/types'
import { useSessionCtx } from './context'

// Real SafeRide dispatch line (override with VITE_SAFERIDE_PHONE).
const SAFERIDE_PHONE = (import.meta.env.VITE_SAFERIDE_PHONE ?? '').trim() || '+12173848188'

// Within this distance of the saved home counts as home: "I'm home" asks once
// more when farther, and the arrival prompt appears when closer.
const HOME_CHECK_M = 200
// "Not yet" on the arrival prompt hides it this long.
const ARRIVAL_SNOOZE_MS = 10 * 60_000

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
 * "Going home", what End my night opens. Built for the drunkest moment of the
 * night, so it's two simple stages:
 *  1. How are you getting home? Walking / Get a ride / Call SafeRide. Any
 *     choice marks you heading home.
 *  2. On your way: directions home and a green hold-to-confirm "I'm home".
 * Alerts stay on until you're home; the party closes when everyone is.
 */
export function GetHomeScreen() {
  const { session, members, me, profile, myPos } = useSessionCtx()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const stageKey = `tether.homeStage.${session.id}`
  const snoozeKey = `tether.arrivalSnooze.${session.id}`
  const [chosen, setChosen] = useState(() => store.get(stageKey) === 'onway')
  const [repicking, setRepicking] = useState(false)
  const heading = me?.status === 'heading_home'
  const onTheWay = (chosen || heading) && !repicking

  const homeLL =
    profile?.home_lat != null && profile?.home_lng != null ? { lat: profile.home_lat, lng: profile.home_lng } : null
  const hasHome = Boolean(homeLL || profile?.home_address)
  const awayFromHome = homeLL && myPos ? distanceM(myPos, homeLL) : null

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

  /** Any Stage 1 choice: heading home (same status as before), then Stage 2. */
  function choose(via: string) {
    store.set(stageKey, 'onway')
    setChosen(true)
    setRepicking(false)
    void update({
      status: 'heading_home',
      status_note: `Heading home • ${via}`,
      activity: 'heading_home',
      activity_until: null,
      eta: null,
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

  if (me?.status === 'home') {
    return (
      <Screen>
        <Header title="Going home" back={back} />
        <div className="flex flex-1 flex-col justify-center text-center">
          <p className="text-4xl font-extrabold">You're home.</p>
          <p className="mt-3 text-xl text-ink-dim">The party stays open until everyone is home.</p>
          {others.length > 0 && (
            <p className="mt-3 text-xl">
              {othersHome} of {others.length} {others.length === 1 ? 'friend is' : 'friends are'} home.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-3 pt-6">
          <button onClick={() => navigate('/', { replace: true })} className={`${buttonClass('primary', true)} min-h-[72px]`}>
            Go to home screen
          </button>
          <button onClick={() => navigate(back)} className={`${buttonClass('secondary', true)} min-h-[72px]`}>
            Keep watching the group
          </button>
        </div>
      </Screen>
    )
  }

  const bigChoice = 'flex min-h-[88px] w-full items-center justify-center gap-3 rounded-2xl text-2xl font-extrabold active:scale-[0.98]'

  return (
    <Screen>
      <Header title="Going home" back={back} />

      {!onTheWay ? (
        <>
          <h2 className="text-[2.25rem] font-extrabold leading-tight tracking-tight">How are you getting home?</h2>
          <div className="mt-8 flex flex-col gap-4">
            <button disabled={busy} onClick={() => choose('Walking')} className={`${bigChoice} bg-white text-black disabled:opacity-40`}>
              <WalkIcon width={30} height={30} strokeWidth={2.2} /> Walking
            </button>
            <a
              href={rideUrl(getRideApp(), myPos, homeLL, profile?.home_address ?? null)}
              target="_blank"
              rel="noreferrer"
              onClick={() => choose(getRideApp() === 'lyft' ? 'Lyft' : 'Uber')}
              className={`${bigChoice} bg-white text-black`}
            >
              <CarIcon width={30} height={30} strokeWidth={2.2} /> Get a ride
            </a>
            <a href={`tel:${SAFERIDE_PHONE.replace(/[^\d+]/g, '')}`} onClick={() => choose('SafeRide')} className={`${bigChoice} bg-white text-black`}>
              <PhoneIcon width={30} height={30} strokeWidth={2.2} /> Call SafeRide
            </a>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-[2.5rem] font-extrabold leading-tight tracking-tight">Heading home.</h2>
          <p className="mt-2 text-xl text-ink">Your friends can see you. Alerts stay on until you're home.</p>
          {others.length > 0 && (
            <p className="mt-4 text-xl text-ink-dim">
              {othersHome} of {others.length} {others.length === 1 ? 'friend is' : 'friends are'} home.
            </p>
          )}

          <div className="mt-auto flex flex-col gap-4 pt-8">
            {hasHome && (
              <a
                href={directionsUrl(homeLL, profile?.home_address ?? null)}
                target="_blank"
                rel="noreferrer"
                className={`${bigChoice} bg-white text-black`}
              >
                Directions home
              </a>
            )}

            {farConfirm ? (
              <div className="rounded-2xl border-2 border-white/40 p-4" role="alertdialog" aria-labelledby="far-home">
                <p id="far-home" className="text-xl font-bold">
                  You look {formatDistance(awayFromHome ?? 0)} from home.
                </p>
                <p className="text-lg text-ink-dim">Only say you're home once you're inside.</p>
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
                className="flex min-h-[96px] w-full items-center justify-center rounded-2xl bg-safe text-black disabled:opacity-40"
              >
                {(progress) => (
                  <span className="flex items-center gap-4">
                    <HoldRing progress={progress} />
                    <span className="text-2xl font-extrabold">{busy ? 'Saving…' : "Hold when you're home"}</span>
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
              className="min-h-[52px] text-lg text-ink-dim underline underline-offset-4"
            >
              Changed plans? Pick another way home
            </button>
          </div>
        </>
      )}

      {error && <p className="mt-4 rounded-xl bg-status-alert/15 px-4 py-3 text-lg text-status-alert">{error}</p>}

      {!hasHome && (
        <Link to="/settings?edit=home" className="mt-4 block min-h-[48px] py-2 text-center text-lg text-ink-dim underline underline-offset-4">
          Add home address for directions
        </Link>
      )}

      {arrived && (
        <div className="fixed inset-0 z-[2000] flex justify-center bg-bg" role="alertdialog" aria-labelledby="arrived">
          <div className="flex w-full max-w-app flex-col px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <h1 id="arrived" className="text-5xl font-extrabold">
                You're home?
              </h1>
            </div>
            <button
              disabled={busy}
              onClick={() => void imHome()}
              className="flex min-h-[112px] w-full items-center justify-center gap-3 rounded-3xl bg-safe text-3xl font-extrabold text-black active:scale-[0.98] disabled:opacity-40"
            >
              <CheckIcon width={36} height={36} strokeWidth={2.5} /> Yes, I'm home
            </button>
            <button
              onClick={() => {
                const until = Date.now() + ARRIVAL_SNOOZE_MS
                store.set(snoozeKey, String(until))
                setSnoozedUntil(until)
                setNow(Date.now())
              }}
              className="mt-4 min-h-[56px] text-xl text-ink-dim underline underline-offset-4"
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
