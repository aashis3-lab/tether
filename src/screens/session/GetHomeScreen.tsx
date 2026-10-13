import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPhone } from '@/auth/phoneAuth'
import { CarIcon, ChatIcon, PhoneIcon } from '@/components/icons'
import { useNavigate } from 'react-router-dom'
import { Header, ErrorText, Screen, Title } from '@/components/ui'
import { buttonClass } from '@/components/buttons'
import { HoldButton } from '@/components/HoldButton'
import { distanceM, formatDistance } from '@/lib/geo'
import { errorText } from '@/lib/toast'
import { firstName } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { formatClock } from '@/lib/time'
import type { Member } from '@/lib/types'
import { useSessionCtx } from './context'

// Real SafeRide dispatch line (override with VITE_SAFERIDE_PHONE).
const SAFERIDE_PHONE = (import.meta.env.VITE_SAFERIDE_PHONE ?? '').trim() || '+12173848188'

// Farther than this from the saved home, "I'm home" asks once more.
const HOME_CHECK_M = 200

const homeAt = (m: Member) => (m.rule_state?.home_at as string | undefined) ?? null

/**
 * "Let's get you home", what End my night opens. Ending your night means
 * heading home, not turning protection off: alerts stay on until arrival and
 * the group closes when everyone is home. "I'm home" is press-and-hold, and
 * double-checks against the saved home address when we know where you are.
 */
export function GetHomeScreen() {
  const { session, members, me, profile, myPos } = useSessionCtx()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const real = members
  const homeCount = real.filter((m) => m.status === 'home').length
  const heading = me?.status === 'heading_home'
  const lastHome = real
    .filter((m) => m.status === 'home' && homeAt(m))
    .sort((a, b) => homeAt(b)!.localeCompare(homeAt(a)!))[0]

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

  const homeLL =
    profile?.home_lat != null && profile?.home_lng != null ? { lat: profile.home_lat, lng: profile.home_lng } : null
  const addr = encodeURIComponent(profile?.home_address ?? 'Home')
  // Deep links open the Uber / Lyft app if installed, else their mobile site.
  const uberUrl = `https://m.uber.com/ul/?action=setPickup${
    myPos ? `&pickup[latitude]=${myPos.lat}&pickup[longitude]=${myPos.lng}` : '&pickup=my_location'
  }${
    homeLL
      ? `&dropoff[latitude]=${homeLL.lat}&dropoff[longitude]=${homeLL.lng}&dropoff[nickname]=Home&dropoff[formatted_address]=${addr}`
      : ''
  }`
  const lyftUrl = `https://lyft.com/ride?id=lyft${
    myPos ? `&pickup[latitude]=${myPos.lat}&pickup[longitude]=${myPos.lng}` : ''
  }${homeLL ? `&destination[latitude]=${homeLL.lat}&destination[longitude]=${homeLL.lng}` : ''}`

  // "I'm home" sanity check against the saved home (GPS slack included).
  const awayFromHome = homeLL && myPos ? distanceM(myPos, homeLL) : null
  const [farConfirm, setFarConfirm] = useState(false)
  const confirmHome = () => {
    if (awayFromHome != null && awayFromHome > HOME_CHECK_M) setFarConfirm(true)
    else void imHome()
  }

  const markHeading = (via: string) =>
    update({ status: 'heading_home', status_note: `Heading home • ${via}`, eta: null, leaving_with: ['solo'] })

  const headingHome = () =>
    update({ status: 'heading_home', status_note: 'Heading home', activity: 'heading_home', activity_until: null, eta: null, leaving_with: ['solo'] })

  const imHome = async () => {
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
    // Last one home closes the party for everyone (the server also checks
    // every 10 s, so two people tapping at once still ends it).
    const stillOut = real.filter((m) => m.id !== me?.id && m.status !== 'home')
    if (stillOut.length === 0) {
      setBusy(true)
      const { error: err } = await supabase.rpc('end_session', { p_session_id: session.id })
      setBusy(false)
      if (err) setError(errorText(err))
    }
  }

  return (
    <Screen>
      <Header title="Going home" back={`/session/${session.id}`} />
      <Title>Let's get you home</Title>

      <p className="mb-2 mt-5 text-sm font-semibold text-accent-orange">Destination</p>
      {profile?.home_address ? (
        <div className="flex min-h-tap items-center rounded-xl2 border border-white/10 bg-bg-card px-4 text-lg font-semibold">
          Home • {profile.home_address}
        </div>
      ) : (
        <Link to="/settings" className="flex min-h-tap items-center rounded-xl2 border border-white/10 bg-bg-card px-4 text-lg font-semibold text-accent-pink">
          Add your home address →
        </Link>
      )}

      <div className="mt-4 rounded-xl2 bg-bg-card p-4">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-orange">
          {homeCount} of {real.length} home • night still open
        </p>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4">
          {real.map((m) => (
            <div key={m.id}>
              <p className="text-lg font-semibold">{m.id === me?.id ? 'You' : firstName(m.name)}</p>
              <p className={`text-sm font-semibold ${m.status === 'home' ? 'text-status-calm' : 'text-[#f5c518]'}`}>
                {memberLine(m, m.id === me?.id)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {lastHome && (
        <div className="mt-4 rounded-xl2 bg-bg-card p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-accent-orange">
            <ChatIcon width={18} height={18} />
            HOME SMS to {firstName(lastHome.guardian_name) || 'guardian'}
          </p>
          <p className="mt-2 text-ink">
            “{firstName(lastHome.name)} arrived home at {formatClock(homeAt(lastHome)!)}.”
          </p>
        </div>
      )}

      <p className="mt-4 text-lg font-semibold text-ink">Alerts stay on until you're home.</p>

      <div className="mt-3">
        <ErrorText>{error}</ErrorText>
      </div>

      <div className="mt-auto pt-6">
        {me?.status === 'home' ? (
          <>
            <p className="text-center text-lg font-semibold text-status-calm">You're home. Thanks for checking in.</p>
            <p className="mt-1 text-center text-base text-ink-dim">The party stays open until everyone is home.</p>
            <button
              onClick={() => navigate('/', { replace: true })}
              className="mt-4 min-h-tap w-full rounded-xl2 bg-white text-lg font-bold text-black active:scale-[0.98]"
            >
              Go to home screen
            </button>
            <button
              onClick={() => navigate(`/session/${session.id}`)}
              className="mt-2 min-h-tap w-full rounded-xl2 border border-white/15 font-semibold active:scale-[0.98]"
            >
              Keep watching the group
            </button>
          </>
        ) : (
          <>
            <button
              disabled={busy || heading}
              onClick={headingHome}
              className={buttonClass('primary', true)}
            >
              {heading ? 'Heading home: your group can see it' : busy ? 'Saving...' : "I'm heading home"}
            </button>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <a
                href={`tel:${SAFERIDE_PHONE.replace(/[^\d+]/g, '')}`}
                onClick={() => void markHeading('SafeRide')}
                className={`${buttonClass('secondary')} whitespace-nowrap px-2 !text-base`}
              >
                <PhoneIcon width={20} height={20} /> Call SafeRide
              </a>
              <a
                href={uberUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => void markHeading('Uber')}
                className={`${buttonClass('secondary')} whitespace-nowrap px-2 !text-base`}
              >
                <CarIcon width={20} height={20} /> Get a ride
              </a>
            </div>
            <p className="mt-1 text-center text-base text-ink-faint">
              SafeRide {formatPhone(SAFERIDE_PHONE)} ·{' '}
              <a href={lyftUrl} target="_blank" rel="noreferrer" onClick={() => void markHeading('Lyft')} className="underline">
                Lyft instead
              </a>
            </p>

            {farConfirm ? (
              <div className="mt-4 rounded-2xl border-2 border-status-checkin/70 bg-status-checkin/10 p-4" role="alertdialog" aria-labelledby="far-home">
                <p id="far-home" className="text-lg font-bold">
                  You look {formatDistance(awayFromHome ?? 0)} from home.
                </p>
                <p className="text-base text-ink-dim">Only say you're home once you're inside.</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
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
            ) : (
              <HoldButton
                disabled={busy}
                onComplete={confirmHome}
                ariaLabel="I'm home. Press and hold to confirm."
                className="mt-4 flex min-h-tap w-full items-center justify-center rounded-xl2 border-2 border-white/40 text-lg font-bold disabled:opacity-40"
              >
                {busy ? 'Saving...' : "I'm home (hold)"}
              </HoldButton>
            )}
            <button onClick={() => navigate(`/session/${session.id}`)} className="mt-1 min-h-[48px] w-full text-ink-dim">
              Back to the map
            </button>
          </>
        )}
      </div>
    </Screen>
  )
}

function memberLine(m: Member, isMe: boolean) {
  if (m.status === 'home') {
    const at = homeAt(m)
    return `✓ Home${at ? ` • ${formatClock(at)}` : ''}`
  }
  if (m.status === 'heading_home') return m.eta ? `On the way • ETA ${formatClock(m.eta)}` : 'On the way'
  return isMe ? 'Getting ready to leave' : 'Still out'
}
