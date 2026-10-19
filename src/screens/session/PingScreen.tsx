import { useEffect, useState, type ReactNode } from 'react'
import { CheckIcon, SendIcon, ShieldAlertIcon } from '@/components/icons'
import { Header, ErrorText, Screen, Title } from '@/components/ui'
import { buttonClass } from '@/components/buttons'
import { claimerName, guardianToken, raiseAlert, resolveAlert } from '@/lib/alerts'
import { firstName } from '@/lib/format'
import { tryOrToast } from '@/lib/toast'
import { distanceM, hasLocation } from '@/lib/geo'
import type { AlertLevel } from '@/lib/types'
import { useSessionCtx } from './context'

const RANK: Record<AlertLevel, number> = { ping: 1, alert: 2, emergency: 3 }

/**
 * PING, "What do you need?": Find me (friends) / Alert guardian, plus the
 * live status of the request and "I'm OK now". Emergency calling lives on HELP.
 */
export function PingScreen() {
  const { session, members, alerts, me, myPos } = useSessionCtx()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [token, setToken] = useState<string | null>(null)

  const myAlert = alerts.find((a) => a.member_id === me?.id && a.type === 'manual')
  const level = myAlert ? RANK[myAlert.level] : 0
  const claimer = myAlert ? claimerName(myAlert, members) : null
  const guardian = firstName(me?.guardian_name) || 'your guardian'
  const guardianFull = me?.guardian_name?.trim() || 'Your guardian'

  const nearest = members
    .filter((m) => m.id !== me?.id && m.user_id && m.status !== 'home')
    .filter(hasLocation)
    .sort((a, b) => (myPos ? distanceM(myPos, a) - distanceM(myPos, b) : 0))[0]
  const findMeSub = nearest
    ? members.length > 5
      ? `${firstName(nearest.name)} first, then group.`
      : `${firstName(nearest.name)} and the rest of your group.`
    : 'Your whole group.'

  useEffect(() => {
    if (myAlert && myAlert.level !== 'ping' && !token) void guardianToken(myAlert.id).then(setToken).catch(() => undefined)
  }, [myAlert, token])

  async function raise(l: AlertLevel) {
    if (!me) return
    setBusy(true)
    setError('')
    try {
      const r = await raiseAlert(me.id, l)
      if (r.guardian_token) setToken(r.guardian_token)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <Header title="Get help from friends" back={`/session/${session.id}`} />
      <Title>What do you need?</Title>
      <p className="mt-1 text-base text-ink-dim">Tap one option.</p>

      {myAlert && (
        <div className="mt-4 rounded-xl border border-status-alert/50 bg-status-alert/10 p-4">
          <p className="text-lg font-medium">
            {claimer ? `${firstName(claimer)} is on it` : 'Request sent, waiting for a friend to answer'}
          </p>
          <p className="mt-1 text-ink-dim">
            {myAlert.level === 'ping' ? 'Your group has your location.' : `${guardian} has been texted.`}
          </p>
          {token && (
            <a href={`/guardian/${token}`} target="_blank" rel="noreferrer" className="mt-1 inline-block min-h-[44px] leading-[44px] text-primary-ink underline">
              Open guardian view (demo) ↗
            </a>
          )}
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await tryOrToast("Couldn't cancel the alert", () => resolveAlert(myAlert.id))
              setBusy(false)
            }}
            className={`mt-3 ${buttonClass('safe')}`}
          >
            {busy ? 'Saving...' : "I'm OK now"}
          </button>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3">
        <Choice
          tone="yellow"
          icon={<SendIcon width={26} height={26} />}
          title="Find me"
          sub={findMeSub}
          done={level >= 1}
          disabled={busy || level >= 1}
          onClick={() => raise('ping')}
        />
        <Choice
          tone="red"
          icon={<ShieldAlertIcon width={30} height={30} strokeWidth={2} />}
          title="Alert Guardian"
          sub={`${guardianFull} gets your location and status.`}
          done={level >= 2}
          disabled={busy || level >= 2}
          onClick={() => raise('alert')}
        />
      </div>

      <div className="mt-3">
        <ErrorText>{error}</ErrorText>
      </div>
      <p className="mt-auto pt-6 text-center text-xs text-ink-dim">In danger? Use the red HELP button to call.</p>
    </Screen>
  )
}

const TONE = {
  yellow: 'bg-findme text-black',
  red: 'border border-danger/50 bg-danger/10 text-ink [&_svg]:text-status-alert',
}

function Choice({
  tone,
  icon,
  title,
  sub,
  done,
  disabled,
  onClick,
}: {
  tone: keyof typeof TONE
  icon: ReactNode
  title: string
  sub: string
  done?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-[80px] w-full items-center gap-4 rounded-[20px] px-4 text-left active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 ${TONE[tone]}`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xl font-medium">{title}</span>
        <span className="mt-0.5 block text-xs opacity-80">{sub}</span>
      </span>
      {done && <CheckIcon width={24} height={24} className="shrink-0" />}
    </button>
  )
}
