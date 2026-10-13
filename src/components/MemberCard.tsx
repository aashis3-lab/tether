import type { ReactNode } from 'react'
import { memberStatusLabel } from '@/lib/activities'
import { distanceM, formatDistance, hasLocation, timeAgo } from '@/lib/geo'
import type { LatLng, Member } from '@/lib/types'
import { Avatar } from './Avatar'
import { ChatIcon, PhoneIcon, SendIcon } from './icons'
import { Sheet } from './ui'

const digits = (p: string) => p.replace(/[^\d+]/g, '')

/**
 * A friend's card from the top widget: Call, Message (their real number) and
 * Directions to their live spot in Google Maps, with the distance.
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
  const directions = located
    ? `https://www.google.com/maps/dir/?api=1&destination=${member.lat},${member.lng}&travelmode=walking`
    : null

  return (
    <Sheet open onClose={onClose} title={isMe ? 'You' : member.name}>
      <div className="flex items-center gap-4">
        <Avatar name={member.name} url={avatar} size={64} />
        <div className="min-w-0">
          <p className="text-lg font-bold">{memberStatusLabel(member)}</p>
          <p className="text-base text-ink-dim">
            {located ? `Updated ${timeAgo(member.last_updated)}` : 'No location yet'}
            {member.battery_level != null && ` · ${member.battery_level}% battery`}
          </p>
        </div>
      </div>

      {!isMe && (
        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          <IconAction href={phone ? `tel:${digits(phone)}` : null} label="Call" icon={<PhoneIcon width={26} height={26} />} />
          <IconAction href={phone ? `sms:${digits(phone)}` : null} label="Message" icon={<ChatIcon width={26} height={26} />} />
          <IconAction href={directions} label="Directions" icon={<SendIcon width={26} height={26} />} caption={dist ?? undefined} external />
        </div>
      )}
      {!isMe && !phone && <p className="mt-3 text-center text-base text-ink-faint">No phone number on their profile.</p>}
    </Sheet>
  )
}

function IconAction({
  href,
  label,
  icon,
  caption,
  external,
}: {
  href: string | null
  label: string
  icon: ReactNode
  caption?: string
  external?: boolean
}) {
  const body = (
    <>
      <span
        className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
          href ? 'bg-accent-pink text-white' : 'bg-white/5 text-ink-faint'
        }`}
      >
        {icon}
      </span>
      <span className="mt-1 block text-sm text-ink-dim">{caption ?? ' '}</span>
    </>
  )
  return href ? (
    <a href={href} aria-label={label} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} className="active:scale-95">
      {body}
    </a>
  ) : (
    <span aria-label={`${label} unavailable`} className="opacity-60">
      {body}
    </span>
  )
}
