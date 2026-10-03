import { useEffect, useRef, useState } from 'react'
import { HoldButton } from '@/components/HoldButton'
import { PhoneIcon } from '@/components/icons'
import { AppHeader, ErrorText, Eyebrow, Screen } from '@/components/ui'
import { claimerName, evaluateSession, helpPressed, raiseAlert, resolveAlert } from '@/lib/alerts'
import { tryOrToast } from '@/lib/toast'
import { formatPhone } from '@/auth/phoneAuth'
import { firstName } from '@/lib/format'
import { useSessionCtx } from './context'

/**
 * DEMO_SAFE_911 (VITE_DEMO_SAFE_911): ON unless set to "false". When ON, the
 * 911 button dials VITE_DEMO_911_NUMBER (e.g. a teammate) and says "Demo
 * mode". When OFF it dials real 911.
 */
const SAFE_911 = import.meta.env.VITE_DEMO_SAFE_911 !== 'false'
const DEMO_NUMBER = (import.meta.env.VITE_DEMO_911_NUMBER ?? '').trim()
const EMERGENCY_NUMBER = SAFE_911 ? DEMO_NUMBER : '911'

const telHref = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`

/**
 * HELP, two huge call buttons. Opening this screen raises the help alert in
 * the background (same ladder as before), so the group knows even if you
 * never tap anything. Calling the guardian escalates to a guardian alert;
 * the 911 hold escalates to emergency.
 */
export function HelpScreen() {
  const { session, members, alerts, me } = useSessionCtx()
  const [error, setError] = useState('')
  const raised = useRef(false)

  const myAlert = alerts.find((a) => a.member_id === me?.id && a.type === 'manual')
  const claimer = myAlert ? claimerName(myAlert, members) : null
  const guardianName = firstName(me?.guardian_name) || 'guardian'
  const guardianPhone = me?.guardian_phone ?? ''

  // Raise (or keep) the help alert as soon as this screen opens.
  useEffect(() => {
    if (!me || raised.current) return
    raised.current = true
    // Raise the alert + queue the guardian text, then send it right away.
    helpPressed(me.id)
      .then(() => evaluateSession(session.id))
      .catch((e: Error) => setError(`Couldn't alert your group: ${e.message}`))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me])

  const escalate = (level: 'alert' | 'emergency') => {
    if (me)
      void tryOrToast("Couldn't alert your guardian", async () => {
        await raiseAlert(me.id, level)
        await evaluateSession(session.id)
      })
  }
  const [cancelling, setCancelling] = useState(false)

  return (
    <Screen>
      <AppHeader back={`/session/${session.id}`} />
      <Eyebrow>Help</Eyebrow>
      <p className="mt-2 rounded-xl2 bg-status-alert/10 px-4 py-3 font-semibold text-status-alert">
        {claimer ? `Your group knows, ${firstName(claimer)} is on it.` : 'Your group has been alerted with your location.'}
      </p>

      <div className="mt-5 flex flex-1 flex-col gap-4">
        {/* Call guardian: plain tap, real tel: link. */}
        {guardianPhone ? (
          <a
            href={telHref(guardianPhone)}
            onClick={() => escalate('alert')}
            className="flex min-h-[150px] flex-1 flex-col items-center justify-center gap-2 rounded-3xl bg-[#f5c518] px-4 text-center text-black active:scale-[0.98]"
          >
            <PhoneIcon width={44} height={44} strokeWidth={2.2} />
            <span className="text-3xl font-extrabold">Call {guardianName}</span>
            <span className="text-base font-semibold opacity-70">{formatPhone(guardianPhone)}</span>
          </a>
        ) : (
          <div className="flex min-h-[150px] flex-1 items-center justify-center rounded-3xl bg-bg-card p-4 text-center text-ink-dim">
            No guardian phone for tonight. Set one in Settings → Personal guardian.
          </div>
        )}

        {/* Call 911: press and hold 2 s so it can't fire by accident. */}
        {EMERGENCY_NUMBER ? (
          <HoldButton
            onComplete={() => {
              escalate('emergency')
              window.location.href = telHref(EMERGENCY_NUMBER)
            }}
            className="flex min-h-[170px] w-full flex-1 flex-col items-center justify-center rounded-3xl bg-[#e01414] px-4 text-center text-white"
          >
            <span className="flex flex-col items-center gap-2">
              <PhoneIcon width={48} height={48} strokeWidth={2.2} />
              <span className="text-4xl font-black">Call 911</span>
              <span className="text-base font-semibold opacity-90">Press and hold 2 seconds</span>
              {SAFE_911 && (
                <span className="mt-1 rounded-full bg-black/30 px-3 py-1 text-xs font-bold uppercase tracking-wide">
                  Demo mode · dials {DEMO_NUMBER}
                </span>
              )}
            </span>
          </HoldButton>
        ) : (
          <div className="flex min-h-[170px] flex-1 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-status-alert/60 p-4 text-center">
            <p className="text-2xl font-black text-status-alert">Call 911</p>
            <p className="mt-2 text-ink-dim">
              Demo mode is on but no test number is set. Add <span className="font-mono">VITE_DEMO_911_NUMBER</span> to
              .env (or set <span className="font-mono">VITE_DEMO_SAFE_911=false</span> to dial real 911).
            </p>
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
            await tryOrToast("Couldn't cancel the alert", () => resolveAlert(myAlert.id))
            setCancelling(false)
          }}
          className="mt-4 min-h-tap w-full rounded-xl2 border border-white/20 text-lg font-semibold disabled:opacity-60"
        >
          {cancelling ? 'Cancelling...' : "I'm OK now, cancel alert"}
        </button>
      )}
    </Screen>
  )
}
