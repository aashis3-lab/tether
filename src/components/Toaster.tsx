import { dismissToast, useToasts } from '@/lib/toast'

/** Global toasts as Material snackbars, above everything and clear of the notch. */
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
            className="pointer-events-auto flex animate-enter items-center gap-3 rounded-xl bg-inverse px-4 py-3 text-left text-base text-inverse-on shadow-e3"
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${t.kind === 'error' ? 'bg-danger' : 'bg-safe'}`} />
            <span className="min-w-0 flex-1">{t.text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
