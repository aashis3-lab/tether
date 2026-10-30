import { useEffect, useRef, useState } from 'react'

const ITEM_H = 44
const VISIBLE = 5 // rows shown in each wheel; the middle one is selected
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1) // 1..12
const MINUTES = [0, 15, 30, 45]
const MERIDIEM = ['AM', 'PM'] as const

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** Now, rounded up to the next 15 minutes. */
function roundedNow() {
  const d = new Date()
  d.setSeconds(0, 0)
  d.setMinutes(Math.ceil((d.getMinutes() + 1) / 15) * 15)
  return d
}

function compose(day: Date, hour12: number, minute: number, pm: boolean) {
  const d = new Date(day)
  d.setHours((hour12 % 12) + (pm ? 12 : 0), minute, 0, 0)
  return d
}

/**
 * "When does the night end?" picker. Opens on today at the current time
 * (today highlighted, with a small "Now: ..." label). Pick a day chip, then
 * spin the wheels, or tap a quick choice. One or two taps.
 */
export function NightEndsCalendar({ value, onChange }: { value?: Date; onChange: (d: Date, valid: boolean) => void }) {
  const initial = value && value.getTime() > Date.now() ? value : roundedNow()
  const [day, setDay] = useState(startOfDay(initial))
  const [hour, setHour] = useState(((initial.getHours() + 11) % 12) + 1)
  const [minute, setMinute] = useState(MINUTES.reduce((a, m) => (Math.abs(m - initial.getMinutes()) < Math.abs(a - initial.getMinutes()) ? m : a), 0))
  const [pm, setPm] = useState(initial.getHours() >= 12)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(t)
  }, [])

  const chosen = compose(day, hour, minute, pm)
  useEffect(() => {
    onChange(chosen, chosen.getTime() > Date.now())
    // Report whenever the pick changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.getTime(), hour, minute, pm])

  const today = startOfDay(now)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    return d
  })

  function setFrom(d: Date) {
    setDay(startOfDay(d))
    setHour(((d.getHours() + 11) % 12) + 1)
    setMinute(MINUTES.reduce((a, m) => (Math.abs(m - d.getMinutes()) < Math.abs(a - d.getMinutes()) ? m : a), 0))
    setPm(d.getHours() >= 12)
  }

  // Quick choices, always the next upcoming time (never past, never 24 h+):
  // "Tonight 2 AM" / "Tonight 4 AM" (only while that night is ahead of you),
  // "9 AM" (or "9 AM tomorrow" before midnight), and three hours from now.
  const nextAt = (h: number) => {
    const d = new Date(now)
    d.setHours(h, 0, 0, 0)
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1)
    return d
  }
  const hoursAway = (d: Date) => (d.getTime() - now.getTime()) / 3600_000
  const tonight = (h: number): [string, Date] | null => {
    const d = nextAt(h)
    // At 5 AM the next 2 AM is a whole day off: not "tonight", so don't offer it.
    return hoursAway(d) <= 14 ? [`Tonight ${h} AM`, d] : null
  }
  const nine = nextAt(9)
  const plus3 = new Date(now.getTime() + 3 * 3600_000)
  plus3.setMinutes(Math.ceil(plus3.getMinutes() / 15) * 15, 0, 0)
  const quick = [
    tonight(2),
    tonight(4),
    [nine.getDate() === now.getDate() ? '9 AM' : '9 AM tomorrow', nine] as [string, Date],
    ['In 3 hours', plus3] as [string, Date],
  ].filter((q): q is [string, Date] => q !== null && hoursAway(q[1]) > 0 && hoursAway(q[1]) < 24)

  return (
    <div className="rounded-2xl bg-bg-card p-4">
      <p className="mb-3 inline-block rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-ink-dim">
        Now: {now.toLocaleDateString([], { weekday: 'short' })} {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
      </p>

      {/* Days */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {days.map((d, i) => {
          const selected = d.getTime() === day.getTime()
          return (
            <button
              key={d.toISOString()}
              onClick={() => setDay(d)}
              className={`flex min-w-[64px] shrink-0 flex-col items-center rounded-2xl border px-2 py-2 transition active:scale-95 ${
                selected
                  ? 'border-accent-pink bg-accent-pink text-white'
                  : i === 0
                    ? 'border-accent-pink/60 bg-accent-pink/10'
                    : 'border-white/10 bg-bg'
              }`}
            >
              <span className="text-xs font-bold uppercase">{i === 0 ? 'Today' : i === 1 ? 'Tmrw' : d.toLocaleDateString([], { weekday: 'short' })}</span>
              <span className="text-lg font-bold">{d.getDate()}</span>
            </button>
          )
        })}
      </div>

      {/* Time wheels */}
      <div className="relative mt-4 flex justify-center gap-2">
        <div
          className="pointer-events-none absolute inset-x-0 rounded-xl bg-white/10"
          style={{ top: ITEM_H * Math.floor(VISIBLE / 2), height: ITEM_H }}
        />
        <Wheel items={HOURS.map(String)} index={HOURS.indexOf(hour)} onIndex={(i) => setHour(HOURS[i])} />
        <Wheel items={MINUTES.map((m) => String(m).padStart(2, '0'))} index={MINUTES.indexOf(minute)} onIndex={(i) => setMinute(MINUTES[i])} />
        <Wheel items={[...MERIDIEM]} index={pm ? 1 : 0} onIndex={(i) => setPm(i === 1)} />
      </div>

      {/* One-tap choices */}
      <div className="mt-4 flex flex-wrap gap-2">
        {quick.map(([label, d]) => (
          <button
            key={label}
            onClick={() => setFrom(d)}
            className={`min-h-[40px] rounded-full border px-4 text-sm font-semibold transition active:scale-95 ${
              d.getTime() === chosen.getTime() ? 'border-accent-pink bg-accent-pink/15 text-accent-pink' : 'border-white/15'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** One scroll-snapping wheel column. */
function Wheel({ items, index, onIndex }: { items: string[]; index: number; onIndex: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const settle = useRef<number | undefined>(undefined)
  const pad = ITEM_H * Math.floor(VISIBLE / 2)

  // Keep the wheel on the selected item when it changes from outside.
  useEffect(() => {
    const el = ref.current
    if (el && Math.round(el.scrollTop / ITEM_H) !== index) el.scrollTo({ top: index * ITEM_H, behavior: 'smooth' })
  }, [index])

  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget
        window.clearTimeout(settle.current)
        settle.current = window.setTimeout(() => {
          const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)))
          if (i !== index) onIndex(i)
        }, 90)
      }}
      className="relative w-20 snap-y snap-mandatory overflow-y-auto [scrollbar-width:none]"
      style={{ height: ITEM_H * VISIBLE, paddingTop: pad, paddingBottom: pad }}
    >
      {items.map((it, i) => (
        <button
          key={it}
          onClick={() => onIndex(i)}
          className={`flex w-full snap-center items-center justify-center text-2xl tabular-nums transition ${
            i === index ? 'font-bold text-ink' : 'text-ink-faint'
          }`}
          style={{ height: ITEM_H }}
        >
          {it}
        </button>
      ))}
    </div>
  )
}
