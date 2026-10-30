import { useEffect, type ReactNode } from 'react'
import { playAlertLoop } from '@/lib/sound'

/**
 * Full-screen incoming alert with sound. Used for the sign-up practice alert
 * now and real pings/alerts from Phase 3 on.
 */
export function AlertOverlay({
  tone = 'alert',
  title,
  body,
  actionLabel = "I'm on it",
  onAction,
  footer,
  sound = true,
}: {
  /** alert = red (help / guardian alert), findMe = yellow (come find me), checkin = amber. */
  tone?: 'alert' | 'findMe' | 'checkin'
  title: string
  body?: ReactNode
  actionLabel?: string
  onAction: () => void
  footer?: ReactNode
  sound?: boolean
}) {
  useEffect(() => {
    if (!sound) return
    return playAlertLoop()
  }, [sound])

  const bg = tone === 'alert' ? 'bg-status-alert' : tone === 'findMe' ? 'bg-findme' : 'bg-status-checkin'
  return (
    <div className={`fixed inset-0 z-[2000] flex justify-center ${bg}`}>
      <div className="flex w-full max-w-app flex-col px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))] text-black">
        <div className="flex-1">
          <div className="mb-6 h-16 w-16 animate-pulse rounded-full bg-black/20" />
          <h1 className="text-4xl font-extrabold leading-tight">{title}</h1>
          {body && <div className="mt-4 text-xl font-medium">{body}</div>}
        </div>
        {footer}
        <button
          onClick={onAction}
          className="mt-4 min-h-[88px] w-full rounded-3xl bg-black text-2xl font-bold text-white active:scale-[0.98]"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  )
}
