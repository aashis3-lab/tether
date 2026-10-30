import { useState } from 'react'

/** Round profile picture with an initials fallback (also used if the image fails to load). */
export function Avatar({
  name,
  url,
  size = 40,
  ring,
  className = '',
}: {
  name: string
  url?: string | null
  size?: number
  /** Tailwind ring classes, e.g. "ring-2 ring-status-checkin". */
  ring?: string
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join('') || '?'

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-br font-bold text-white ${ring ?? ''} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {url && !broken ? (
        <img src={url} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : (
        initials
      )}
    </span>
  )
}
