import { useRef } from 'react'

/**
 * Six pink-bordered digit boxes (per the phone verification design). A single
 * transparent input sits on top so paste, SMS autofill (one-time-code), and
 * backspace all just work.
 */
export function CodeBoxes({
  value,
  onChange,
  length = 6,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  length?: number
  autoFocus?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const digits = value.padEnd(length).slice(0, length).split('')
  const active = Math.min(value.length, length - 1)

  return (
    <div className="relative" onClick={() => input.current?.focus()}>
      <div className="flex justify-between gap-2">
        {digits.map((d, i) => (
          <div
            key={i}
            className={`flex aspect-[5/6] w-full max-w-[3.5rem] items-center justify-center rounded-xl2 border-[1.5px] bg-bg-card text-3xl font-medium ${
              i === active && document.activeElement === input.current ? 'border-accent-pink ring-2 ring-accent-pink/30' : 'border-accent-pink'
            }`}
          >
            {d.trim()}
          </div>
        ))}
      </div>
      <input
        ref={input}
        aria-label="SMS code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={length}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
      />
    </div>
  )
}
