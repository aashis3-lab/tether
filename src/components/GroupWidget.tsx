import { useEffect, useState } from 'react'
import { activityTimeLeft, liveActivity, memberStatusLabel } from '@/lib/activities'
import { ruleMs } from '@/lib/alerts'
import { firstName } from '@/lib/format'
import { distanceM, formatDistance, hasLocation, timeAgo } from '@/lib/geo'
import type { CheckIn, LatLng, Member } from '@/lib/types'
import { Avatar } from './Avatar'
import { ChevronRightIcon } from './icons'

type Attention = 'red' | 'yellow' | null

/** What to say about someone, and whether they need attention. */
function describe(m: Member, checkIns: CheckIn[], now: number): { label: string; timer: string | null; attention: Attention } {
  const ci = checkIns.find((c) => c.member_id === m.id)
  const overdue = ci && now - new Date(ci.created_at).getTime() > ruleMs(3)
  const battery = m.battery_level
  const act = liveActivity(m, now)
  let attention: Attention = null
  let label = memberStatusLabel(m, now)

  if (m.status === 'needs_help') attention = 'red'
  else if (overdue) {
    attention = 'red'
    label = 'Not answering'
  } else if (ci || m.status === 'left_alone' || m.status === 'separated') {
    attention = 'yellow'
    if (ci) label = 'Checking in…'
  } else if (act?.key === 'phone_dying' || act?.key === 'minute') attention = 'yellow'

  if (battery != null && battery <= 20 && m.status !== 'home') {
    if (battery <= 10) attention = 'red'
    else attention ??= 'yellow'
    label = `${label} · ${battery}%`
  }
  return { label, timer: activityTimeLeft(m, now), attention }
}

const RING: Record<'red' | 'yellow', string> = {
  red: 'ring-[3px] ring-status-alert',
  yellow: 'ring-[3px] ring-status-checkin',
}
const TEXT: Record<'red' | 'yellow', string> = { red: 'text-status-alert', yellow: 'text-status-checkin' }

/**
 * The only place group statuses live during a party: a floating strip over
 * the map with everyone's avatar, name and current status (with a countdown
 * for short-lived ones). You're pinned first, then whoever needs attention.
 * The chevron expands it into a short list, never full screen.
 */
export function GroupWidget({
  members,
  me,
  checkIns,
  avatars,
  myPos,
  headline,
  partyName,
  onMemberTap,
}: {
  members: Member[]
  me: Member | undefined
  checkIns: CheckIn[]
  avatars: Record<string, string | null>
  myPos: LatLng | null
  /** e.g. "4/4 accounted for", shown in the expanded header. */
  headline: string
  /** Party name, shown small at the top. */
  partyName?: string | null
  /** Tap a member to open their card. */
  onMemberTap?: (m: Member) => void
}) {
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // Tick so countdowns and expiries update on their own.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(t)
  }, [])

  const rows = members
    .map((m) => ({ m, ...describe(m, checkIns, now) }))
    .sort(
      (a, b) =>
        Number(b.m.id === me?.id) - Number(a.m.id === me?.id) || rank(b.attention) - rank(a.attention)
    )

  return (
    <div className="rounded-2xl border border-white/10 bg-bg-card/90 shadow-lg backdrop-blur">
      {partyName && !open && (
        <p className="truncate px-3 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-accent-pink">{partyName}</p>
      )}
      <div className="flex items-stretch">
        {open ? (
          <div className="flex-1 px-4 py-3">
            <p className="truncate text-xs font-bold uppercase tracking-wide text-accent-pink">{partyName ?? 'Your group'} · {members.length}</p>
            <p className="font-bold">{headline}</p>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:none]">
            {rows.map(({ m, label, timer, attention }) => (
              <button
                key={m.id}
                onClick={() => onMemberTap?.(m)}
                className="flex w-[4.75rem] shrink-0 flex-col items-center text-center active:scale-95"
              >
                <Avatar name={m.name} url={avatars[m.id]} size={38} ring={attention ? RING[attention] : m.id === me?.id ? 'ring-2 ring-accent-pink' : undefined} />
                <p className="mt-1 w-full truncate text-xs font-semibold">{m.id === me?.id ? 'You' : firstName(m.name)}</p>
                <p className={`w-full truncate text-[11px] leading-tight ${attention ? TEXT[attention] + ' font-semibold' : 'text-ink-dim'}`}>
                  {label}
                  {timer && ` · ${timer}`}
                </p>
              </button>
            ))}
          </div>
        )}
        <button
          aria-label={open ? 'Collapse group' : 'Expand group'}
          onClick={() => setOpen((o) => !o)}
          className="flex w-11 shrink-0 items-center justify-center border-l border-white/10 text-ink-dim"
        >
          <ChevronRightIcon width={20} height={20} className={`transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
        </button>
      </div>

      {open && (
        <ul className="max-h-[50vh] divide-y divide-white/5 overflow-y-auto px-3 pb-2">
          {rows.map(({ m, label, timer, attention }) => (
            <li key={m.id} onClick={() => onMemberTap?.(m)} className="flex cursor-pointer items-center gap-3 py-2.5 active:opacity-70">
              <Avatar name={m.name} url={avatars[m.id]} size={42} ring={attention ? RING[attention] : undefined} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{m.id === me?.id ? `${firstName(m.name)} (you)` : m.name}</p>
                <p className={`truncate text-sm ${attention ? TEXT[attention] + ' font-semibold' : 'text-ink-dim'}`}>
                  {label}
                  {timer && <span className="ml-1 rounded-full bg-white/10 px-1.5 text-xs text-ink">{timer}</span>}
                </p>
              </div>
              <div className="shrink-0 text-right text-xs text-ink-dim">
                {m.id !== me?.id && myPos && hasLocation(m) && <p>{formatDistance(distanceM(myPos, m))}</p>}
                <p>{m.status === 'home' ? '' : hasLocation(m) ? timeAgo(m.last_updated) : 'no location'}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function rank(a: Attention) {
  return a === 'red' ? 2 : a === 'yellow' ? 1 : 0
}
