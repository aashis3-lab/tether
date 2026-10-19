import type { ReactNode } from 'react'
import { memberStatusLabel } from '@/lib/activities'
import { compass, distanceM, formatDistance, hasLocation, timeAgo } from '@/lib/geo'
import type { LatLng, Member } from '@/lib/types'
import { Avatar } from './Avatar'
import { BatteryIcon, ChatIcon, ClockIcon, NavigateIcon, PhoneIcon, PinIcon } from './icons'
import { Sheet } from './ui'

const digits = (p: string) => p.replace(/[^\d+]/g, '')

/**
 * A friend's detail sheet: Call, Message (their real number) and Directions
 * to their live spot in Google Maps, plus distance, battery and last update.
 */
export function MemberCard({
  member,
  avatar,
  phone,
  myPos,
  isMe,
  onClose,
}: {
  member: Member
  avatar: string | null
  phone: string | null
  myPos: LatLng | null
  isMe: boolean
  onClose: () => void
}) {
  const located = hasLocation(member)
  const dist = located && myPos ? formatDistance(distanceM(myPos, member)) : null
  const dir = located && myPos ? compass(myPos, member) : null
  const directions = located
    ? `https://www.google.com/maps/dir/?api=1&destination=${member.lat},${member.lng}&travelmode=walking`
    : null

  return (
    <Sheet open onClose={onClose} title={isMe ? 'You' : member.name}>
      <div className="flex items-center gap-4">
        <span style={{ viewTransitionName: `member-${member.id}` }} className="rounded-full">
          <Avatar name={member.name} url={avatar} size={64} />
        </span>
        <div className="min-w-0">
          <p className="text-lg font-medium">{memberStatusLabel(member)}</p>
          <p className="text-xs text-ink-dim">{located ? `Updated ${timeAgo(member.last_updated)}` : 'No location yet'}</p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 divide-x divide-line rounded-2xl bg-surface-lowest py-3 text-center dark:bg-surface-mid">
        <Stat icon={<PinIcon width={14} height={14} />} label="Distance" value={isMe ? '—' : dist ? `${dist}` : '—'} sub={isMe ? undefined : dir ?? undefined} />
        <Stat
          icon={<BatteryIcon width={14} height={14} />}
          label="Battery"
          value={member.battery_level != null ? `${member.battery_level}%` : '—'}
          warn={member.battery_level != null && member.battery_level <= 20}
        />
        <Stat icon={<ClockIcon width={14} height={14} />} label="Last seen" value={located ? timeAgo(member.last_updated).replace(' ago', '') : '—'} />
      </dl>

      {!isMe && (
        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          <IconAction href={phone ? `tel:${digits(phone)}` : null} label="Call" icon={<PhoneIcon width={22} height={22} />} />
          <IconAction href={phone ? `sms:${digits(phone)}` : null} label="Message" icon={<ChatIcon width={22} height={22} />} />
          <IconAction href={directions} label="Directions" icon={<NavigateIcon width={20} height={20} />} external />
        </div>
      )}
      {!isMe && !phone && <p className="mt-3 text-center text-xs text-ink-faint">No phone number on their profile.</p>}
    </Sheet>
  )
}

function Stat({ icon, label, value, sub, warn }: { icon: ReactNode; label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="px-2">
      <dt className="flex items-center justify-center gap-1 text-xs text-ink-dim">
        {icon}
        {label}
      </dt>
      <dd className={`mt-1 text-xl font-medium ${warn ? 'text-status-alert' : ''}`}>
        {value}
        {sub && <span className="ml-1 text-xs font-medium text-ink-dim">{sub}</span>}
      </dd>
    </div>
  )
}

function IconAction({
  href,
  label,
  icon,
  external,
}: {
  href: string | null
  label: string
  icon: ReactNode
  external?: boolean
}) {
  const body = (
    <>
      <span
        className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${
          href ? 'bg-primary-container text-primary-on-container' : 'bg-ink/5 text-ink-faint'
        }`}
      >
        {icon}
      </span>
      <span className="mt-1.5 block text-xs font-medium text-ink-dim">{label}</span>
    </>
  )
  return href ? (
    <a href={href} aria-label={label} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} className="rounded-2xl py-1 active:scale-95">
      {body}
    </a>
  ) : (
    <span aria-label={`${label} unavailable`} className="py-1 opacity-60">
      {body}
    </span>
  )
}
