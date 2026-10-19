import { useEffect, useState } from 'react'

/** Re-render every 15 s so "2 min ago" and countdowns stay current. */
export function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(t)
  }, [ms])
  return now
}
