import { useEffect, useState } from 'react'
import { activityTimeLeft, liveActivity, memberStatusLabel } from '@/lib/activities'
import { ruleMs } from '@/lib/alerts'
import { firstName } from '@/lib/format'
import { distanceM, formatDistance, hasLocation, timeAgo } from '@/lib/geo'
import type { GroupState } from '@/lib/status'
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

const BAR: Record<GroupState['tone'], string> = {
  calm: 'bg-safe text-black',
  checkin: 'bg-findme text-black',
  alert: 'bg-danger text-white',
}

/**
 * Summary bar over the map: one large line whose color is the group state
 * (green all together, yellow someone away, red someone needs help). The
 * chevron expands it into the full list with everyone's status.
 */
export function GroupWidget({
  members,
  me,
  checkIns,
  avatars,
  myPos,
  state,
  partyName,
  onMemberTap,
}: {
  members: Member[]
  me: Member | undefined
  checkIns: CheckIn[]
  avatars: Record<string, string | null>
  myPos: LatLng | null
  /** From groupState(): tone + the big line. */
  state: GroupState
  /** Party name, shown small in the expanded list. */
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
    <div className="overflow-hidden rounded-2xl shadow-lg">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${state.line}. ${open ? 'Hide' : 'Show'} everyone`}
        className={`flex min-h-[68px] w-full items-center gap-3 px-4 py-2 text-left ${BAR[state.tone]}`}
      >
        <span className="min-w-0 flex-1" aria-live="polite">
          <span className="block truncate text-2xl font-extrabold leading-tight">{state.line}</span>
          {state.sub && <span className="block truncate text-base font-semibold opacity-80">{state.sub}</span>}
        </span>
        <ChevronRightIcon width={26} height={26} strokeWidth={2.25} className={`shrink-0 transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>

      {open && (
        <div className="border-t border-white/10 bg-bg-card/95 backdrop-blur">
          {partyName && <p className="truncate px-4 pt-3 text-sm font-bold uppercase tracking-wide text-accent-pink">{partyName} · {members.length}</p>}
          <ul className="max-h-[50vh] divide-y divide-white/5 overflow-y-auto px-3 pb-2">
            {rows.map(({ m, label, timer, attention }) => (
              <li key={m.id} onClick={() => onMemberTap?.(m)} className="flex min-h-[60px] cursor-pointer items-center gap-3 py-2.5 active:opacity-70">
                <Avatar name={m.name} url={avatars[m.id]} size={44} ring={attention ? RING[attention] : undefined} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-semibold">{m.id === me?.id ? `${firstName(m.name)} (you)` : m.name}</p>
                  <p className={`truncate text-base ${attention ? TEXT[attention] + ' font-semibold' : 'text-ink-dim'}`}>
                    {label}
                    {timer && <span className="ml-1 rounded-full bg-white/10 px-1.5 text-sm text-ink">{timer}</span>}
                  </p>
                </div>
                <div className="shrink-0 text-right text-sm text-ink-dim">
                  {m.id !== me?.id && myPos && hasLocation(m) && <p>{formatDistance(distanceM(myPos, m))}</p>}
                  <p>{m.status === 'home' ? '' : hasLocation(m) ? timeAgo(m.last_updated) : 'no location'}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function rank(a: Attention) {
  return a === 'red' ? 2 : a === 'yellow' ? 1 : 0
}
