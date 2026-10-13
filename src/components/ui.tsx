import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { buttonClass, type ButtonVariant } from './buttons'
import { ArrowLeftIcon, XIcon } from './icons'

export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`app-shell animate-enter px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] ${className}`}>
      {children}
    </div>
  )
}

export function Button({
  variant = 'primary',
  big,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; big?: boolean }) {
  return <button {...props} className={`${buttonClass(variant, big)} ${className}`} />
}

export const inputClass =
  'w-full min-h-tap rounded-xl2 border border-white/50 bg-bg-card px-4 text-lg text-ink placeholder:text-ink-faint focus:border-accent-pink focus:outline-none'

export function Field({
  label,
  hint,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-ink">{label}</span>
      <input {...props} className={`${inputClass} ${className}`} />
      {hint && <span className="mt-3 block text-ink-dim">{hint}</span>}
    </label>
  )
}

/** Big bold page title used at the top of each design frame. */
export function Title({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h1 className={`text-[2rem] font-bold leading-tight tracking-tight ${className}`}>{children}</h1>
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl2 bg-bg-card p-5 ${className}`}>{children}</div>
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="rounded-xl bg-status-alert/15 px-4 py-3 text-status-alert">{children}</p>
}

export function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2" aria-label="Tether">
      <img src="/icons/logo-mark.png" alt="" className="h-9 w-auto" />
      <span className="text-xl font-bold tracking-tight">Tether</span>
    </button>
  )
}

/** Bottom sheet over a dimmed backdrop. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/70" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full max-w-app overflow-y-auto rounded-t-3xl bg-bg-raised p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/20" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button
            aria-label="Close"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-ink"
          >
            <XIcon width={16} height={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Spinner() {
  return (
    <div className="app-shell items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-accent-pink" />
    </div>
  )
}

/**
 * The one page header: back arrow on the left, page name centered, nothing
 * on the right. `back` is a path, or true for browser back; omit it on
 * root pages.
 */
export function Header({ title, back }: { title: string; back?: string | true }) {
  const navigate = useNavigate()
  return (
    <div className="mb-4 grid min-h-tap grid-cols-[3.25rem_1fr_3.25rem] items-center">
      <div>
        {back && (
          <button
            aria-label="Back"
            onClick={() => (back === true ? navigate(-1) : navigate(back))}
            className="-ml-2 flex h-[52px] w-[52px] items-center justify-center rounded-full text-ink active:bg-white/10"
          >
            <ArrowLeftIcon width={26} height={26} strokeWidth={2.25} />
          </button>
        )}
      </div>
      <h1 className="truncate text-center text-xl font-bold tracking-tight">{title}</h1>
      <div />
    </div>
  )
}

/** Small all-caps context label above a title ("DESTINATION", "MAYA'S PARTY"). */
export function Eyebrow({ children, tone = 'pink' }: { children: ReactNode; tone?: 'pink' | 'orange' }) {
  return (
    <p className={`text-sm font-bold uppercase tracking-wide ${tone === 'pink' ? 'text-accent-pink' : 'text-accent-orange'}`}>
      {children}
    </p>
  )
}

/** Dark card with a small colored heading line, used for info blocks in the designs. */
export function InfoCard({
  heading,
  headingClass = 'text-accent-orange',
  icon,
  children,
  className = '',
}: {
  heading?: ReactNode
  headingClass?: string
  icon?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-xl2 border border-white/5 bg-bg-card p-4 ${className}`}>
      {heading && (
        <p className={`mb-2 flex items-center gap-2 text-sm font-bold ${headingClass}`}>
          {icon}
          {heading}
        </p>
      )}
      <div className="text-ink-dim">{children}</div>
    </div>
  )
}
