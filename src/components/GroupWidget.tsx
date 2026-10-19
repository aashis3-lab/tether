import { useNow } from '@/hooks/useNow'
import { activityTimeLeft, liveActivity, memberStatusLabel } from '@/lib/activities'
import { ruleMs } from '@/lib/alerts'
import { firstName } from '@/lib/format'
import { compass, distanceM, formatDistance, hasLocation, timeAgo } from '@/lib/geo'
import type { CheckIn, LatLng, Member } from '@/lib/types'
import { Avatar } from './Avatar'
import { BatteryIcon, ChatIcon, PhoneIcon } from './icons'

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
  }
  return { label, timer: activityTimeLeft(m, now), attention }
}

const RING: Record<'red' | 'yellow', string> = {
  red: 'ring-2 ring-status-alert ring-offset-2 ring-offset-surface-low',
  yellow: 'ring-2 ring-status-checkin ring-offset-2 ring-offset-surface-low',
}
const TEXT: Record<'red' | 'yellow', string> = { red: 'text-status-alert', yellow: 'text-status-checkin' }

const digits = (p: string) => p.replace(/[^\d+]/g, '')

/** Overlapping faces, Google Photos-style ("+2" when there are more). */
export function AvatarStack({
  members,
  avatars,
  max = 4,
  size = 32,
}: {
  members: Member[]
  avatars: Record<string, string | null>
  max?: number
  size?: number
}) {
  const shown = members.slice(0, max)
  const extra = members.length - shown.length
  return (
    <span className="flex shrink-0 items-center">
      {shown.map((m, i) => (
        <Avatar
          key={m.id}
          name={m.name}
          url={avatars[m.id]}
          size={size}
          className={`ring-2 ring-surface-low ${i > 0 ? '-ml-2.5' : ''}`}
        />
      ))}
      {extra > 0 && (
        <span
          className="-ml-2.5 inline-flex items-center justify-center rounded-full bg-surface-highest text-xs font-medium text-ink-dim ring-2 ring-surface-low"
          style={{ width: size, height: size }}
        >
          +{extra}
        </span>
      )}
    </span>
  )
}

/**
 * The friend list in the session sheet: avatar, name, status, distance and
 * direction, battery, last update, plus call / navigate actions.
 */
export function FriendList({
  members,
  me,
  checkIns,
  avatars,
  phones,
  myPos,
  activeId,
  onMemberTap,
}: {
  members: Member[]
  me: Member | undefined
  checkIns: CheckIn[]
  avatars: Record<string, string | null>
  phones: Record<string, string | null>
  myPos: LatLng | null
  /** Member whose detail sheet is open (its avatar carries the shared-element name). */
  activeId?: string | null
  onMemberTap?: (m: Member) => void
}) {
  const now = useNow()
  const rows = members
    .map((m) => ({ m, ...describe(m, checkIns, now) }))
    .sort(
      (a, b) =>
        Number(b.m.id === me?.id) - Number(a.m.id === me?.id) || rank(b.attention) - rank(a.attention)
    )

  return (
    <ul className="-mx-4">
      {rows.map(({ m, label, timer, attention }) => {
        const isMe = m.id === me?.id
        const located = hasLocation(m)
        const phone = phones[m.id]
        const where =
          !isMe && myPos && located ? `${formatDistance(distanceM(myPos, m))} ${compass(myPos, m)}` : null
        // "Location off" already says it when the label does.
        const seen = m.status === 'home' ? null : located ? timeAgo(m.last_updated) : label === 'Location off' ? null : 'no location'
        return (
          <li key={m.id} className="flex items-center gap-1 pr-2 transition-colors hover:bg-ink/[0.03]">
            <button
              type="button"
              onClick={() => onMemberTap?.(m)}
              className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3.5 py-2 pl-4 text-left"
            >
              <span style={activeId == null ? { viewTransitionName: `member-${m.id}` } : undefined} className="rounded-full">
                <Avatar name={m.name} url={avatars[m.id]} size={40} ring={attention ? RING[attention] : undefined} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-lg font-medium text-ink">{isMe ? `${firstName(m.name)} (you)` : m.name}</span>
                </span>
                <span className={`block truncate text-base ${attention ? `${TEXT[attention]} font-medium` : 'text-ink-dim'}`}>
                  {label}
                  {timer && <span className="ml-1.5 rounded-full bg-ink/10 px-1.5 text-xs text-ink">{timer}</span>}
                </span>
                <span className="mt-0.5 flex items-center gap-2 text-xs text-ink-faint">
                  {where && <span>{where}</span>}
                  {m.battery_level != null && (
                    <span className={`inline-flex items-center gap-0.5 ${m.battery_level <= 20 ? 'text-status-alert' : ''}`}>
                      <BatteryIcon width={13} height={13} />
                      {m.battery_level}%
                    </span>
                  )}
                  {seen && <span>{seen}</span>}
                </span>
              </span>
            </button>
            {!isMe && (
              <span className="flex shrink-0 items-center">
                {phone && (
                  <a
                    href={`sms:${digits(phone)}`}
                    aria-label={`Text ${firstName(m.name)}`}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-primary-ink hover:bg-primary/10"
                  >
                    <ChatIcon width={18} height={18} />
                  </a>
                )}
                {phone ? (
                  <a
                    href={`tel:${digits(phone)}`}
                    aria-label={`Call ${firstName(m.name)}`}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-primary-ink hover:bg-primary/10"
                  >
                    <PhoneIcon width={19} height={19} />
                  </a>
                ) : null}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function rank(a: Attention) {
  return a === 'red' ? 2 : a === 'yellow' ? 1 : 0
}
