/**
 * Tether buttons: soft rounded rectangles, bold labels. One color meaning:
 *   primary    pink-to-orange gradient, the normal next step
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
  primary: 'bg-brand text-white shadow-[0_6px_16px_-6px_rgb(var(--c-primary)/0.55)]',
  tonal: 'bg-primary/10 text-primary-ink',
  secondary: 'border-[1.5px] border-ink/15 bg-surface-lowest text-ink dark:bg-surface-mid',
  danger: 'bg-danger text-white',
  safe: 'bg-safe text-black',
  findMe: 'bg-findme text-black',
  text: 'bg-transparent text-primary-ink',
}

/** Class string for a button-styled element (also for <a> / <Link>). */
export function buttonClass(variant: ButtonVariant = 'primary', big = false) {
  return `inline-flex w-full items-center justify-center gap-2 rounded-2xl px-6 text-center font-bold transition-[transform,box-shadow,opacity] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40 ${
    big ? 'min-h-[56px] text-lg' : 'min-h-tap text-base'
  } ${variants[variant]}`
}
