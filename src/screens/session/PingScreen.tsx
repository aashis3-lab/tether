import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SendIcon, ShieldAlertIcon, UsersIcon } from '@/components/icons'
import { Header, ErrorText, Screen, Title } from '@/components/ui'
import { buttonClass } from '@/components/buttons'
import { claimerName, guardianToken, raiseAlert, resolveAlert } from '@/lib/alerts'
import { firstName } from '@/lib/format'
import { LOCATION_OFF } from '@/lib/status'
import { tryOrToast } from '@/lib/toast'
import { useSessionCtx } from './context'

/**
 * Find me status. The Find me button on the map sends the request directly;
 * this page shows who's on it, the location truth, "I'm OK now", and the
 * secondary "Alert my guardian". Emergency calling lives on HELP.
 */
export function PingScreen() {
  const { session, members, alerts, me, myPos } = useSessionCtx()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [token, setToken] = useState<string | null>(null)

  const myAlert = alerts.find((a) => a.member_id === me?.id && a.type === 'manual')
  const claimer = myAlert ? claimerName(myAlert, members) : null
  const guardian = firstName(me?.guardian_name) || 'your guardian'
  const alone = members.length <= 1
  const base = `/session/${session.id}`

  useEffect(() => {
    if (myAlert && myAlert.level !== 'ping' && !token) void guardianToken(myAlert.id).then(setToken).catch(() => undefined)
  }, [myAlert, token])

  async function raise(level: 'ping' | 'alert') {
    if (!me) return
    setBusy(true)
    setError('')
    try {
      const r = await raiseAlert(me.id, level)
      if (r.guardian_token) setToken(r.guardian_token)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <Header title="Find me" back={base} />

      {myAlert ? (
        <>
          <Title>{claimer ? `${firstName(claimer)} is on it` : 'Request sent'}</Title>
          <p className="mt-1 text-base text-ink-dim">
            {claimer
              ? 'Stay where you are if you can.'
              : myAlert.level === 'ping'
                ? 'Waiting for a friend to answer.'
                : `${guardian} has been texted.`}
          </p>
          <p
            className={`mt-4 rounded-xl px-4 py-3 text-base font-medium ${
              myPos ? 'bg-status-calm/10 text-status-calm' : 'bg-status-checkin/10 text-status-checkin'
            }`}
          >
            {myPos ? 'Your group can see your location.' : LOCATION_OFF}
          </p>
          {token && (
            <a href={`/guardian/${token}`} target="_blank" rel="noreferrer" className="mt-2 inline-block min-h-[44px] leading-[44px] text-sm font-medium text-primary-ink">
              Open guardian view ↗
            </a>
          )}
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await tryOrToast("Couldn't cancel the request", () => resolveAlert(myAlert.id))
              setBusy(false)
            }}
            className={`mt-4 ${buttonClass('safe')}`}
          >
            {busy ? 'Saving…' : "I'm OK now"}
          </button>
        </>
      ) : alone ? (
        <>
          <Title>No one else is in your party yet</Title>
          <p className="mt-1 text-base text-ink-dim">A Find me request needs friends to send it to.</p>
          <button onClick={() => navigate(`${base}/invite`)} className={`mt-5 ${buttonClass('primary')}`}>
            <UsersIcon width={18} height={18} /> Invite friends
          </button>
        </>
      ) : (
        <>
          <Title>Ask your group to find you</Title>
          <p className="mt-1 text-base text-ink-dim">Everyone in the party gets your request{myPos ? ' and location' : ''}.</p>
          {!myPos && <p className="mt-4 rounded-xl bg-status-checkin/10 px-4 py-3 text-base font-medium text-status-checkin">{LOCATION_OFF}</p>}
          <button disabled={busy} onClick={() => void raise('ping')} className={`mt-5 ${buttonClass('findMe')}`}>
            <SendIcon width={18} height={18} /> {busy ? 'Sending…' : 'Find me'}
          </button>
        </>
      )}

      {/* Secondary: bring in the guardian. */}
      {(!myAlert || myAlert.level === 'ping') && (
        <button
          disabled={busy || !me}
          onClick={() => void raise('alert')}
          className={`mt-3 ${buttonClass('secondary')}`}
        >
          <ShieldAlertIcon width={18} height={18} /> {alone ? 'Alert my guardian instead' : `Alert ${guardian}`}
        </button>
      )}

      <div className="mt-3">
        <ErrorText>{error}</ErrorText>
      </div>
      <p className="mt-auto pt-6 text-center text-xs text-ink-dim">In danger? Press HELP.</p>
    </Screen>
  )
}
