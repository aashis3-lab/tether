import { useRef } from 'react'

const SWIPE_PX = 24

/**
 * Tap or vertical swipe on one element: `onDown` / `onUp` fire once a drag
 * passes 24 px, otherwise a release counts as `onTap`. Spread the returned
 * handlers on the element (it gets touch-action: none so the page doesn't
 * scroll instead).
 */
export function useSwipe({ onTap, onUp, onDown }: { onTap: () => void; onUp: () => void; onDown: () => void }) {
  const start = useRef<{ y: number; done: boolean } | null>(null)
  return {
    style: { touchAction: 'none' as const },
    onPointerDown: (e: React.PointerEvent) => {
      start.current = { y: e.clientY, done: false }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current
      if (!s || s.done) return
      const dy = e.clientY - s.y
      if (Math.abs(dy) < SWIPE_PX) return
      s.done = true
      if (dy > 0) onDown()
      else onUp()
    },
    onPointerUp: () => {
      const s = start.current
      start.current = null
      if (s && !s.done) onTap()
    },
    onPointerCancel: () => {
      start.current = null
    },
  }
}
