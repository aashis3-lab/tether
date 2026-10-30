import { useCallback, useEffect, useRef } from 'react'
import { evaluateSession } from '@/lib/alerts'

// Never call the rules engine more often than this from one device.
const MIN_GAP_MS = 5_000

/**
 * Runs the server-side rules (evaluate-session) for this session:
 *  - returns `kick()`, called after each location push ("triggered on
 *    location updates" in the spec), throttled to one call per 5 s;
 *  - also ticks on an interval while the screen is visible, so timers
 *    advance even if pg_cron isn't set up yet.
 */
export function useEvaluator(sessionId: string | undefined, active: boolean) {
  const last = useRef(0)

  const kick = useCallback(() => {
    if (!sessionId || !active || Date.now() - last.current < MIN_GAP_MS) return
    last.current = Date.now()
    void evaluateSession(sessionId)
  }, [sessionId, active])

  useEffect(() => {
    if (!sessionId || !active) return
    const t = window.setInterval(() => document.visibilityState === 'visible' && kick(), 15_000)
    return () => window.clearInterval(t)
  }, [sessionId, active, kick])

  return kick
}
