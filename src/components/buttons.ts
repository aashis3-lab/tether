/**
 * Material 3 buttons. One color meaning everywhere:
 *   primary    filled pink, the normal next step
 *   tonal      secondary container, a lighter alternative
 *   secondary  outlined, everything else
 *   danger     red, danger only (HELP, 911, active alerts)
 *   safe       green, OK / safe (back with group, alert canceled, home)
 *   findMe     yellow, "come find me"
 *   text       a plain text button
 * Disabled buttons keep their own color, dimmed.
 */
export type ButtonVariant = 'primary' | 'tonal' | 'secondary' | 'danger' | 'safe' | 'findMe' | 'text'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-on hover:shadow-e1',
  tonal: 'bg-secondary-container text-secondary-on-container',
  secondary: 'border border-outline bg-transparent text-primary-ink',
  danger: 'bg-danger text-white hover:shadow-e1',
  safe: 'bg-safe text-black',
  findMe: 'bg-findme text-black',
  text: 'bg-transparent text-primary-ink',
}

/** Class string for a button-styled element (also for <a> / <Link>). */
export function buttonClass(variant: ButtonVariant = 'primary', big = false) {
  return `inline-flex w-full items-center justify-center gap-2 rounded-full px-6 text-center font-medium tracking-[0.01em] transition-[transform,box-shadow,opacity] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40 ${
    big ? 'min-h-[56px] text-lg' : 'min-h-tap text-base'
  } ${variants[variant]}`
}
