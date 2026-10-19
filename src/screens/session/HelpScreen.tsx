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

/**
 * DEMO_SAFE_911 (VITE_DEMO_SAFE_911): ON unless set to "false". When ON, the
 * 911 button dials VITE_DEMO_911_NUMBER (e.g. a teammate) and says "Demo
 * mode". When OFF it dials real 911. A production build with no test number
 * set always dials real 911; only dev builds show the setup hint instead.
 */
const SAFE_911 = import.meta.env.VITE_DEMO_SAFE_911 !== 'false'
const DEMO_NUMBER = (import.meta.env.VITE_DEMO_911_NUMBER ?? '').trim()
const DIALS_DEMO = SAFE_911 && Boolean(DEMO_NUMBER)
const EMERGENCY_NUMBER = DIALS_DEMO ? DEMO_NUMBER : SAFE_911 && import.meta.env.DEV ? '' : '911'

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
            <h1 className="text-4xl font-semibold leading-tight">Alert canceled.</h1>
            <p className="mt-3 text-xl">Your group knows you're OK.</p>
          </div>
          <button
            onClick={() => navigate(back, { replace: true })}
            className="min-h-[56px] w-full rounded-full bg-black text-lg font-medium text-white active:scale-[0.98]"
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
      <p className="flex items-center gap-2 rounded-xl bg-status-alert/10 px-4 py-3 text-base font-medium text-status-alert" aria-live="polite">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-status-alert" />
        {claimer ? `Your group knows, ${firstName(claimer)} is on it.` : 'Your group has been alerted with your location.'}
      </p>

      <div className="mt-5 flex flex-1 flex-col gap-4">
        {/* Call 911 first and biggest: press and hold 2 s (a ring fills), then confirm. */}
        {EMERGENCY_NUMBER ? (
          <HoldButton
            ariaLabel="Call 911. Press and hold for 2 seconds."
            onComplete={() => setConfirm911(true)}
            className="flex min-h-[220px] w-full flex-[1.6] flex-col items-center justify-center rounded-[28px] bg-danger px-4 text-center text-white shadow-e2 active:scale-[0.99]"
          >
            {(progress) => (
              <span className="flex flex-col items-center gap-2">
                <span className="relative flex h-20 w-20 items-center justify-center">
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
                  <PhoneIcon width={36} height={36} strokeWidth={2} />
                </span>
                <span className="text-4xl font-semibold tracking-tight">Call 911</span>
                <span className="text-base text-white/90">{progress > 0 ? 'Keep holding…' : 'Press and hold 2 seconds'}</span>
                {DIALS_DEMO && (
                  <span className="mt-1 rounded-full bg-black/30 px-3 py-1 text-xs font-medium uppercase tracking-wider">
                    Demo mode · dials {DEMO_NUMBER}
                  </span>
                )}
              </span>
            )}
          </HoldButton>
        ) : (
          // Only reachable in dev builds (production always has a number to dial).
          import.meta.env.DEV && (
            <div className="flex min-h-[250px] flex-[1.6] flex-col items-center justify-center rounded-[28px] border-2 border-dashed border-status-alert/60 p-4 text-center">
              <p className="text-2xl font-semibold text-status-alert">Call 911</p>
              <p className="mt-2 text-ink-dim">
                Demo mode is on but no test number is set. Add <span className="font-mono">VITE_DEMO_911_NUMBER</span> to
                .env (or set <span className="font-mono">VITE_DEMO_SAFE_911=false</span> to dial real 911).
              </p>
            </div>
          )
        )}

        {/* Call guardian: second and smaller, plain tap, real tel: link. */}
        {guardianPhone ? (
          <a
            href={telHref(guardianPhone)}
            onClick={() => escalate('alert')}
            className="flex min-h-[80px] items-center gap-4 rounded-[28px] bg-surface-lowest px-4 text-left shadow-e1 active:scale-[0.98] dark:bg-surface-mid"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-container text-primary-on-container">
              <PhoneIcon width={22} height={22} strokeWidth={2} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xl font-medium">Call {guardianName}</span>
              <span className="block text-xs text-ink-dim">Your guardian · {formatPhone(guardianPhone)}</span>
            </span>
          </a>
        ) : (
          <div className="flex min-h-[80px] items-center justify-center rounded-[28px] bg-surface-high/70 p-4 text-center text-base text-ink-dim">
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
      {confirm911 && EMERGENCY_NUMBER && (
        <div className="fixed inset-0 z-[2000] flex animate-fade-in items-end justify-center bg-black/50" onClick={() => setConfirm911(false)}>
          <div
            className="w-full max-w-app animate-slide-up rounded-t-[28px] bg-surface-low p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-e3"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-911"
          >
            <h2 id="confirm-911" className="text-center text-2xl font-medium">
              Are you sure?
            </h2>
            <p className="mt-1 text-center text-base text-ink-dim">This calls emergency services now.</p>
            <a
              href={telHref(EMERGENCY_NUMBER)}
              onClick={() => {
                escalate('emergency')
                setConfirm911(false)
              }}
              className="mt-5 flex min-h-[64px] w-full items-center justify-center gap-3 rounded-full bg-danger text-2xl font-medium text-white active:scale-[0.98]"
            >
              <PhoneIcon width={24} height={24} strokeWidth={2} /> Call 911
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
          <p className="text-2xl font-medium">Sending alert…</p>
          <p className="mt-6 text-[7rem] font-semibold leading-none tabular-nums">{seconds}</p>
          <p className="mt-6 text-lg">Tap anywhere to cancel</p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onCancel()
          }}
          className="min-h-[64px] w-full rounded-full bg-white text-xl font-medium text-black active:scale-[0.98]"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
