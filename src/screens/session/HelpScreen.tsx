import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HoldButton } from '@/components/HoldButton'
import { CheckIcon, PhoneIcon } from '@/components/icons'
import { Header, ErrorText, Screen } from '@/components/ui'
import { buttonClass } from '@/components/buttons'
import { claimerName, evaluateSession, helpPressed, raiseAlert, resolveAlert } from '@/lib/alerts'
import { tryOrToast } from '@/lib/toast'
import { formatPhone } from '@/auth/phoneAuth'
import { firstName } from '@/lib/format'
import { useSessionCtx } from './context'

const EMERGENCY_NUMBER = '911'

/** Seconds to cancel before HELP actually alerts anyone. */
const CANCEL_SECONDS = 5

const telHref = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`

/**
 * HELP, two huge call buttons. Opening this screen starts a 3-second "tap to
 * cancel" countdown, then raises the help alert (same ladder as before), so
 * the group knows even if you never tap anything else. Calling the guardian
 * escalates to a guardian alert; the 911 hold escalates to emergency.
 */
export function HelpScreen() {
  const { session, members, alerts, me } = useSessionCtx()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const raised = useRef(false)
  // Skip the countdown if an alert is already open (re-opening this screen).
  const [countdown, setCountdown] = useState<number | null>(() =>
    alerts.some((a) => a.member_id === me?.id && a.type === 'manual') ? null : CANCEL_SECONDS
  )

  const myAlert = alerts.find((a) => a.member_id === me?.id && a.type === 'manual')
  const claimer = myAlert ? claimerName(myAlert, members) : null
  const guardianName = firstName(me?.guardian_name) || 'guardian'
  const guardianPhone = me?.guardian_phone ?? ''

  useEffect(() => {
    if (countdown === null || countdown <= 0) return
    const t = window.setTimeout(() => setCountdown((s) => (s === null ? s : s - 1)), 1000)
    return () => window.clearTimeout(t)
  }, [countdown])

  // Raise (or keep) the help alert once the countdown runs out.
  useEffect(() => {
    if (!me || raised.current || (countdown !== null && countdown > 0)) return
    raised.current = true
    // Raise the alert + queue the guardian text, then send it right away.
    helpPressed(me.id)
      .then(() => evaluateSession(session.id))
      .catch((e: Error) => setError(`Couldn't alert your group: ${e.message}`))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, countdown])

  const escalate = (level: 'alert' | 'emergency') => {
    if (me)
      void tryOrToast("Couldn't alert your guardian", async () => {
        await raiseAlert(me.id, level)
        await evaluateSession(session.id)
      })
  }
  const [cancelling, setCancelling] = useState(false)
  const [canceled, setCanceled] = useState(false)
  const [confirm911, setConfirm911] = useState(false)
  const back = `/session/${session.id}`

  if (countdown !== null && countdown > 0) {
    return <SendingCountdown seconds={countdown} onCancel={() => navigate(back, { replace: true })} />
  }

  // Canceled: the whole screen turns green so it's unmistakable.
  if (canceled) {
    return (
      <div className="fixed inset-0 z-[2000] flex justify-center bg-safe text-black">
        <div className="flex w-full max-w-app flex-col px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">
          <div className="flex flex-1 flex-col items-center justify-center text-center" aria-live="assertive">
            <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-black/15">
              <CheckIcon width={52} height={52} strokeWidth={2.5} />
            </div>
            <h1 className="text-4xl font-extrabold leading-tight">Alert canceled.</h1>
            <p className="mt-3 text-2xl font-semibold">Your group knows you're OK.</p>
          </div>
          <button
            onClick={() => navigate(back, { replace: true })}
            className="min-h-[72px] w-full rounded-2xl bg-black text-2xl font-bold text-white active:scale-[0.98]"
          >
            Back to map
          </button>
        </div>
      </div>
    )
  }

  return (
    <Screen>
      <Header title="Help" back={back} />
      <p className="rounded-xl2 bg-status-alert/10 px-4 py-3 text-lg font-semibold text-status-alert" aria-live="polite">
        {claimer ? `Your group knows, ${firstName(claimer)} is on it.` : 'Your group has been alerted with your location.'}
      </p>

      <div className="mt-5 flex flex-1 flex-col gap-4">
        {/* Call 911 first and biggest: press and hold 2 s (a ring fills), then confirm. */}
        <HoldButton
          ariaLabel="Call 911. Press and hold for 2 seconds."
          onComplete={() => setConfirm911(true)}
          className="flex min-h-[250px] w-full flex-[1.6] flex-col items-center justify-center rounded-3xl bg-danger px-4 text-center text-white active:scale-[0.99]"
        >
          {(progress) => (
            <span className="flex flex-col items-center gap-2">
              <span className="relative flex h-24 w-24 items-center justify-center">
                <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="8" />
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="white"
                    strokeWidth="8"
                    strokeLinecap="round"
                    pathLength={100}
                    strokeDasharray={`${progress * 100} 100`}
                  />
                </svg>
                <PhoneIcon width={44} height={44} strokeWidth={2.2} />
              </span>
              <span className="text-5xl font-black">Call 911</span>
              <span className="text-lg font-semibold">{progress > 0 ? 'Keep holding…' : 'Press and hold 2 seconds'}</span>
            </span>
          )}
        </HoldButton>

        {/* Call guardian: second and smaller, plain tap, real tel: link. */}
        {guardianPhone ? (
          <a
            href={telHref(guardianPhone)}
            onClick={() => escalate('alert')}
            className="flex min-h-[96px] items-center gap-4 rounded-3xl bg-white px-5 text-left text-black active:scale-[0.98]"
          >
            <PhoneIcon width={34} height={34} strokeWidth={2.2} className="shrink-0" />
            <span className="min-w-0">
              <span className="block truncate text-2xl font-extrabold">Call {guardianName}</span>
              <span className="block text-base font-semibold opacity-70">Your guardian · {formatPhone(guardianPhone)}</span>
            </span>
          </a>
        ) : (
          <div className="flex min-h-[96px] items-center justify-center rounded-3xl bg-bg-card p-4 text-center text-ink-dim">
            No guardian phone for tonight. Set one in Settings → Personal guardian.
          </div>
        )}
      </div>

      <div className="mt-3">
        <ErrorText>{error}</ErrorText>
      </div>

      {myAlert && (
        <button
          disabled={cancelling}
          onClick={async () => {
            setCancelling(true)
            const ok = await tryOrToast("Couldn't cancel the alert", () => resolveAlert(myAlert.id).then(() => true))
            setCancelling(false)
            if (ok) setCanceled(true)
          }}
          className={`mt-4 ${buttonClass('safe')}`}
        >
          {cancelling ? 'Canceling…' : "I'm OK now, cancel alert"}
        </button>
      )}

      {/* "Are you sure?" after the hold, so 911 is never one slip away. */}
      {confirm911 && (
        <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/80" onClick={() => setConfirm911(false)}>
          <div
            className="w-full max-w-app rounded-t-3xl bg-bg-raised p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-911"
          >
            <h2 id="confirm-911" className="text-center text-3xl font-extrabold">
              Are you sure?
            </h2>
            <p className="mt-2 text-center text-lg text-ink-dim">This calls emergency services now.</p>
            <a
              href={telHref(EMERGENCY_NUMBER)}
              onClick={() => {
                escalate('emergency')
                setConfirm911(false)
              }}
              className="mt-5 flex min-h-[88px] w-full items-center justify-center gap-3 rounded-2xl bg-danger text-3xl font-extrabold text-white active:scale-[0.98]"
            >
              <PhoneIcon width={30} height={30} strokeWidth={2.2} /> Call 911
            </a>
            <button onClick={() => setConfirm911(false)} className={`mt-3 ${buttonClass('secondary')}`}>
              Don't call
            </button>
          </div>
        </div>
      )}
    </Screen>
  )
}

/** Full-screen "Sending alert… tap to cancel" before HELP alerts anyone. */
function SendingCountdown({ seconds, onCancel }: { seconds: number; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[2000] flex justify-center bg-danger text-white" onClick={onCancel}>
      <div className="flex w-full max-w-app flex-col px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">
        <div className="flex flex-1 flex-col items-center justify-center text-center" aria-live="assertive">
          <p className="text-3xl font-extrabold">Sending alert…</p>
          <p className="mt-6 text-[7rem] font-black leading-none tabular-nums">{seconds}</p>
          <p className="mt-6 text-xl font-semibold">Tap anywhere to cancel</p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onCancel()
          }}
          className="min-h-[80px] w-full rounded-2xl bg-white text-2xl font-extrabold text-black active:scale-[0.98]"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
