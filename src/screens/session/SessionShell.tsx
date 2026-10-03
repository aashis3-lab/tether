import { useEffect } from 'react'
import { Outlet, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { CheckInOverlay } from '@/components/CheckInOverlay'
import { IncomingAlerts } from '@/components/IncomingAlerts'
import { MorningSummary } from '@/components/MorningSummary'
import { Button, ErrorText, Screen, Spinner } from '@/components/ui'
import { useEvaluator } from '@/hooks/useEvaluator'
import { useLocationReporter } from '@/hooks/useLocationReporter'
import { useMemberProfiles } from '@/hooks/useMemberAvatars'
import { useLiveSession } from '@/hooks/useSession'
import { supabase } from '@/lib/supabase'
import type { SessionCtx } from './context'

/**
 * Parent of every /session/:id/* screen. Owns everything that must keep
 * running no matter which session screen is showing: live data, location
 * reporting, the rules evaluator, and full-screen alerts / check-ins.
 */
export function SessionShell() {
  const { id } = useParams()
  const { userId, profile } = useAuth()
  const navigate = useNavigate()
  const { loading, error, session, members, pins, alerts, checkIns } = useLiveSession(id)

  const me = members.find((m) => m.user_id === userId)
  const active = session?.status === 'active'
  const evaluate = useEvaluator(id, active)
  const { position, status: gpsStatus, retry: retryGps } = useLocationReporter(
    me?.id,
    active && me?.status !== 'home',
    evaluate
  )
  const { avatars, phones } = useMemberProfiles(members)

  // Short-lived Update statuses (Bathroom, Getting drinks, …) expire back to
  // "Accounted for". Clear my own as soon as it expires; evaluate-session
  // does the same server-side for everyone.
  const myUntil = me?.activity_until
  useEffect(() => {
    if (!me || !myUntil) return
    const wait = new Date(myUntil).getTime() - Date.now()
    const clear = () =>
      void supabase
        .from('session_members')
        .update({ activity: null, activity_until: null, status_note: null })
        .eq('id', me.id)
        .lte('activity_until', new Date().toISOString())
    if (wait <= 0) {
      clear()
      return
    }
    const t = window.setTimeout(clear, wait + 500)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, myUntil])

  if (loading) return <Spinner />
  if (error || !session) {
    return (
      <Screen className="justify-center gap-4 text-center">
        <ErrorText>{error}</ErrorText>
        <Button onClick={() => navigate('/')}>Back home</Button>
      </Screen>
    )
  }
  if (session.status === 'ended') return <MorningSummary members={members} avatars={avatars} partyName={session.name ?? session.venue_names?.[0] ?? null} />

  const myPos = position ?? (me?.lat != null && me?.lng != null ? { lat: me.lat, lng: me.lng } : null)
  const myAlert = alerts.find((a) => a.member_id === me?.id && a.type === 'manual')
  const myCheckIn = checkIns.find((c) => c.member_id === me?.id)

  const ctx: SessionCtx = { session, members, pins, alerts, checkIns, me, profile, myPos, gpsStatus, retryGps, avatars, phones }

  return (
    <>
      <Outlet context={ctx} />
      <IncomingAlerts alerts={alerts} members={members} me={me} userId={userId} position={myPos} mode="overlay" />
      {me && myCheckIn && !myAlert && <CheckInOverlay key={myCheckIn.id} checkIn={myCheckIn} me={me} />}
    </>
  )
}
