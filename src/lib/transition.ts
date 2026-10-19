import { flushSync } from 'react-dom'

type VTDocument = Document & { startViewTransition?: (cb: () => void) => unknown }

/**
 * Runs a state update inside a View Transition when the browser supports it,
 * so elements sharing a `view-transition-name` morph between the two states
 * (e.g. a list avatar growing into the detail sheet). Falls back to a plain
 * update elsewhere.
 */
export function withViewTransition(update: () => void) {
  const d = document as VTDocument
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (!d.startViewTransition || reduce) {
    update()
    return
  }
  d.startViewTransition(() => flushSync(update))
}
