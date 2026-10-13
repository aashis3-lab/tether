import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPhone } from '@/auth/phoneAuth'
import { CarIcon, ChatIcon, PhoneIcon } from '@/components/icons'
import { useNavigate } from 'react-router-dom'
import { AppHeader, ErrorText, Eyebrow, Screen, Title } from '@/components/ui'
import { errorText } from '@/lib/toast'
import { firstName } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { formatClock } from '@/lib/time'
import type { Member } from '@/lib/types'
import { useSessionCtx } from './context'

// Real SafeRide dispatch line (override with VITE_SAFERIDE_PHONE).
const SAFERIDE_PHONE = (import.meta.env.VITE_SAFERIDE_PHONE ?? '').trim() || '+12173848188'

const homeAt = (m: Member) => (m.rule_state?.home_at as string | undefined) ?? null

/**
 * "Let's get you home", what End my night opens. Ending your night means
 * heading home, not turning protection off: alerts stay on until arrival and
 * the group closes when everyone is home.
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
  const uberUrl = homeLL
    ? `https://m.uber.com/ul/?action=setPickup${
        myPos ? `&pickup[latitude]=${myPos.lat}&pickup[longitude]=${myPos.lng}` : '&pickup=my_location'
      }&dropoff[latitude]=${homeLL.lat}&dropoff[longitude]=${homeLL.lng}&dropoff[nickname]=Home&dropoff[formatted_address]=${addr}`
    : null
  const lyftUrl = homeLL
    ? `https://lyft.com/ride?id=lyft${
        myPos ? `&pickup[latitude]=${myPos.lat}&pickup[longitude]=${myPos.lng}` : ''
      }&destination[latitude]=${homeLL.lat}&destination[longitude]=${homeLL.lng}`
    : null

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
      <AppHeader back={`/session/${session.id}`} />
      <Eyebrow tone="orange">Going home</Eyebrow>
      <Title className="mt-1">Let's get you home</Title>

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

      <p className="mt-4 text-ink-dim">
        Ending your night means heading home, not turning protection off. Alerts stay on until you arrive, and the party
        closes when everyone is home.
      </p>

      <div className="mt-3">
        <ErrorText>{error}</ErrorText>
      </div>

      <div className="mt-auto pt-6">
        {me?.status === 'home' ? (
          <>
            <p className="text-center text-lg font-semibold text-status-calm">You're home. Thanks for checking in.</p>
            <p className="mt-1 text-center text-sm text-ink-dim">The party stays open until everyone is home.</p>
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
            <a
              href={`tel:${SAFERIDE_PHONE.replace(/[^\d+]/g, '')}`}
              onClick={() => void markHeading('SafeRide')}
              className="flex min-h-tap w-full items-center justify-center gap-3 rounded-xl2 bg-brand text-lg font-bold text-white active:scale-[0.98]"
            >
              <PhoneIcon width={22} height={22} /> Call SafeRide
            </a>
            <p className="mb-3 mt-1 text-center text-xs text-ink-faint">{formatPhone(SAFERIDE_PHONE)}</p>
            {uberUrl && lyftUrl && (
              <div className="grid grid-cols-2 gap-3">
                <a
                  href={uberUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => void markHeading('Uber')}
                  className="flex min-h-tap items-center justify-center gap-2 rounded-xl2 border border-white/20 bg-black text-lg font-bold text-white active:scale-[0.98]"
                >
                  <CarIcon width={20} height={20} /> Uber
                </a>
                <a
                  href={lyftUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => void markHeading('Lyft')}
                  className="flex min-h-tap items-center justify-center gap-2 rounded-xl2 bg-[#ff00bf] text-lg font-bold text-white active:scale-[0.98]"
                >
                  <CarIcon width={20} height={20} /> Lyft
                </a>
              </div>
            )}
            {uberUrl && (
              <p className="mt-1 text-center text-xs text-ink-faint">Pickup: {myPos ? 'where you are now' : 'your current location'}. Drop-off: home.</p>
            )}
            <button
              disabled={busy || heading}
              onClick={headingHome}
              className="mt-3 min-h-tap w-full rounded-xl2 border border-white/15 bg-bg-card text-lg font-bold active:scale-[0.98] disabled:opacity-60"
            >
              {heading ? 'Heading home: your group can see it' : busy ? 'Saving...' : "I'm heading home"}
            </button>
            <button
              disabled={busy}
              onClick={imHome}
              className="mt-2 min-h-tap w-full rounded-xl2 border border-white/15 font-semibold active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? 'Saving...' : "I'm home"}
            </button>
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
