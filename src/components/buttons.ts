/**
 * One color meaning everywhere:
 *   danger  red, danger only (HELP, 911, active alerts)
 *   safe    green, OK / safe (back with group, alert canceled, home)
 *   findMe  yellow, "come find me"
 *   primary white with black text, the normal next step
 *   secondary outline, everything else
 *   text    a plain link-style button
 * Pink / orange are brand accents only, never a primary button.
 * Disabled buttons keep their own color, dimmed.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'safe' | 'findMe' | 'text'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-white text-black',
  secondary: 'border-2 border-white/40 bg-transparent text-ink',
  danger: 'bg-danger text-white',
  safe: 'bg-safe text-black',
  findMe: 'bg-findme text-black',
  text: 'bg-transparent text-ink-dim underline underline-offset-4',
}

/** Class string for a button-styled element (also for <a> / <Link>). */
export function buttonClass(variant: ButtonVariant = 'primary', big = false) {
  return `inline-flex w-full min-h-tap items-center justify-center gap-2 rounded-xl2 px-5 text-center font-bold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40 ${
    big ? 'py-4 text-xl' : 'text-lg'
  } ${variants[variant]}`
}
