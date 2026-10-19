import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { buttonClass, type ButtonVariant } from './buttons'
import { ArrowLeftIcon, CheckIcon, ChevronRightIcon, XIcon } from './icons'

export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`app-shell animate-enter px-4 pb-8 pt-[max(0.5rem,env(safe-area-inset-top))] ${className}`}>
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

/** Material 3 outlined text field. 16px text so iOS doesn't zoom on focus. */
export const inputClass =
  'w-full min-h-[52px] rounded-xl border border-outline bg-transparent px-4 text-lg text-ink placeholder:text-ink-faint transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

export function Field({
  label,
  hint,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-dim">{label}</span>
      <input {...props} className={`${inputClass} ${className}`} />
      {hint && <span className="mt-1.5 block px-1 text-xs text-ink-dim">{hint}</span>}
    </label>
  )
}

/** Page title (Material "headline-small", 22px). */
export function Title({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h1 className={`text-2xl font-semibold tracking-tight ${className}`}>{children}</h1>
}

/** Elevated card on a tonal surface, 16px radius. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line/70 bg-surface-lowest p-4 dark:border-transparent dark:bg-surface-mid ${className}`}>
      {children}
    </div>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="rounded-xl bg-status-alert/10 px-4 py-3 text-base text-status-alert">{children}</p>
}

export function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 rounded-full pr-2" aria-label="Tether">
      <img src="/icons/logo-mark.png" alt="" className="h-8 w-auto" />
      <span className="text-xl font-medium tracking-tight">Tether</span>
    </button>
  )
}

/** Material 3 modal bottom sheet over a scrim. */
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
    <div className="fixed inset-0 z-[1000] flex animate-fade-in items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full max-w-app animate-slide-up overflow-y-auto rounded-t-[28px] bg-surface-low px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-e3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-8 rounded-full bg-outline/50" />
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xl font-medium">{title}</h2>
          <IconButton label="Close" onClick={onClose} className="-mr-2">
            <XIcon width={20} height={20} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Spinner() {
  return (
    <div className="app-shell items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/15 border-t-primary" />
    </div>
  )
}

/** 48px round icon button (Material "standard" icon button). */
export function IconButton({
  label,
  children,
  className = '',
  tone = 'standard',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: 'standard' | 'tonal' | 'filled' }) {
  const tones = {
    standard: 'text-ink-dim hover:bg-ink/5',
    tonal: 'bg-secondary-container text-secondary-on-container',
    filled: 'bg-primary text-primary-on',
  }
  return (
    <button
      aria-label={label}
      title={label}
      {...props}
      className={`flex h-tap w-tap shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-40 ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  )
}

/**
 * Small top app bar: back arrow, left-aligned title, optional trailing
 * actions. `back` is a path, or true for browser back; omit it on root pages.
 */
export function Header({ title, back, actions }: { title: string; back?: string | true; actions?: ReactNode }) {
  const navigate = useNavigate()
  return (
    <div className="-mx-1 mb-3 flex min-h-[56px] items-center gap-1">
      {back && (
        <IconButton label="Back" onClick={() => (back === true ? navigate(-1) : navigate(back))} className="text-ink">
          <ArrowLeftIcon width={22} height={22} strokeWidth={2} />
        </IconButton>
      )}
      <h1 className={`min-w-0 flex-1 truncate text-2xl font-normal ${back ? 'pl-1' : 'pl-1'}`}>{title}</h1>
      {actions}
    </div>
  )
}

/** Small context label above a title ("DESTINATION", "MAYA'S PARTY"). */
export function Eyebrow({ children, tone = 'pink' }: { children: ReactNode; tone?: 'pink' | 'orange' }) {
  return (
    <p className={`text-xs font-medium uppercase tracking-wider ${tone === 'pink' ? 'text-primary-ink' : 'text-secondary-ink'}`}>
      {children}
    </p>
  )
}

/** Tonal card with a small colored heading line. */
export function InfoCard({
  heading,
  headingClass = 'text-secondary-ink',
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
    <div className={`rounded-2xl bg-surface-high/70 p-4 ${className}`}>
      {heading && (
        <p className={`mb-1.5 flex items-center gap-2 text-sm font-medium ${headingClass}`}>
          {icon}
          {heading}
        </p>
      )}
      <div className="text-base text-ink-dim">{children}</div>
    </div>
  )
}

/** Material 3 filter / assist chip. */
export function Chip({
  selected,
  icon,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; icon?: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...props}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors disabled:opacity-40 ${
        selected
          ? 'border-transparent bg-secondary-container text-secondary-on-container'
          : 'border-outline-variant bg-surface-lowest/0 text-ink-dim'
      } ${className}`}
    >
      {selected ? <CheckIcon width={16} height={16} strokeWidth={2.5} /> : icon}
      {children}
    </button>
  )
}

/** A colored status pill ("All together", "1 separated"). */
export function StatusChip({
  tone,
  children,
  className = '',
}: {
  tone: 'calm' | 'checkin' | 'alert' | 'neutral'
  children: ReactNode
  className?: string
}) {
  const tones = {
    calm: 'bg-status-calm/10 text-status-calm',
    checkin: 'bg-status-checkin/15 text-status-checkin',
    alert: 'bg-status-alert/10 text-status-alert',
    neutral: 'bg-surface-highest text-ink-dim',
  }
  const dot = { calm: 'bg-status-calm', checkin: 'bg-status-checkin', alert: 'bg-status-alert', neutral: 'bg-outline' }
  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ${tones[tone]} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot[tone]}`} />
      {children}
    </span>
  )
}

/**
 * Google Contacts-style list row: leading avatar/icon, headline, supporting
 * text, trailing metadata. Clickable when `onClick` is given.
 */
export function ListItem({
  leading,
  headline,
  supporting,
  trailing,
  onClick,
  chevron,
  className = '',
}: {
  leading?: ReactNode
  headline: ReactNode
  supporting?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  chevron?: boolean
  className?: string
}) {
  const body = (
    <>
      {leading && <span className="flex shrink-0 items-center justify-center">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-lg text-ink">{headline}</span>
        {supporting && <span className="mt-0.5 block text-base text-ink-dim">{supporting}</span>}
      </span>
      {trailing && <span className="shrink-0 text-right text-xs text-ink-dim">{trailing}</span>}
      {chevron && <ChevronRightIcon width={18} height={18} className="shrink-0 text-ink-faint" />}
    </>
  )
  const cls = `flex w-full min-h-[56px] items-center gap-4 px-4 py-3 text-left ${className}`
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} transition-colors hover:bg-ink/[0.04]`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/** Google Settings-style group: small colored title, rounded tonal block with dividers. */
export function ListSection({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      {title && <h2 className="px-4 pb-2 pt-5 text-sm font-medium text-primary-ink">{title}</h2>}
      <div className="divide-y divide-line/70 overflow-hidden rounded-2xl bg-surface-lowest dark:bg-surface-mid">{children}</div>
    </section>
  )
}

/** Material 3 segmented button. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T
  options: { value: T; label: string; icon?: ReactNode }[]
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div role="radiogroup" className={`flex h-10 overflow-hidden rounded-full border border-outline ${className}`}>
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 px-3 text-sm font-medium transition-colors ${
              i > 0 ? 'border-l border-outline' : ''
            } ${on ? 'bg-secondary-container text-secondary-on-container' : 'text-ink'}`}
          >
            {on ? <CheckIcon width={16} height={16} strokeWidth={2.5} /> : o.icon}
            <span className="truncate">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Horizontal stepper for multi-step flows: numbered dots joined by lines. */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mb-5 flex items-center gap-2" aria-label={`Step ${current + 1} of ${steps.length}`}>
      {steps.map((s, i) => {
        const done = i < current
        const on = i === current
        return (
          <li key={s} className={`flex items-center gap-2 ${i < steps.length - 1 ? 'flex-1' : ''}`}>
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                done || on ? 'bg-primary text-primary-on' : 'border border-outline text-ink-dim'
              }`}
            >
              {done ? <CheckIcon width={14} height={14} strokeWidth={3} /> : i + 1}
            </span>
            {on && <span className="whitespace-nowrap text-xs font-medium text-ink">{s}</span>}
            {i < steps.length - 1 && <span className={`h-px min-w-3 flex-1 ${done ? 'bg-primary' : 'bg-outline-variant'}`} />}
          </li>
        )
      })}
    </ol>
  )
}
