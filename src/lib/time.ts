/** Default party end: 9:00 AM the next morning (per spec). */
export function defaultEndTime(): Date {
  const d = new Date()
  // Before 5 AM you're still in "tonight": end at 9 AM today.
  if (d.getHours() >= 5) d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return d
}

export function formatClock(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
