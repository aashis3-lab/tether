import { dismissToast, useToasts } from '@/lib/toast'

/** Renders global toasts above everything, clear of the notch. */
export function Toaster() {
  const toasts = useToasts()
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[5000] flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="flex w-full max-w-app flex-col gap-2">
        {toasts.map((t) => (
          <button
            key={t.id}
            onClick={() => dismissToast(t.id)}
            className={`pointer-events-auto animate-enter rounded-2xl px-4 py-3 text-left font-semibold shadow-lg ${
              t.kind === 'error' ? 'bg-status-alert text-white' : 'bg-status-calm text-black'
            }`}
          >
            {t.text}
          </button>
        ))}
      </div>
    </div>
  )
}
