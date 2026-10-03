import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Press-and-hold to confirm (default 2s). A fill sweeps across while held;
 * releasing early cancels. Used for "Emergency" so it can't fire by accident.
 */
export function HoldButton({
  onComplete,
  children,
  holdMs = 2000,
  className = '',
  disabled,
}: {
  onComplete: () => void
  children: ReactNode
  holdMs?: number
  className?: string
  disabled?: boolean
}) {
  const [progress, setProgress] = useState(0)
  const start = useRef<number | null>(null)
  const raf = useRef<number | null>(null)

  const stop = () => {
    start.current = null
    if (raf.current) cancelAnimationFrame(raf.current)
    raf.current = null
    setProgress(0)
  }

  const tick = () => {
    if (start.current == null) return
    const p = Math.min(1, (performance.now() - start.current) / holdMs)
    setProgress(p)
    if (p >= 1) {
      stop()
      onComplete()
      return
    }
    raf.current = requestAnimationFrame(tick)
  }

  useEffect(() => stop, [])

  return (
    <button
      disabled={disabled}
      onPointerDown={(e) => {
        if (disabled) return
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = performance.now()
        raf.current = requestAnimationFrame(tick)
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative select-none overflow-hidden ${className}`}
      style={{ touchAction: 'none', WebkitUserSelect: 'none' }}
    >
      <span className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${progress * 100}%` }} />
      <span className="relative">{children}</span>
    </button>
  )
}
