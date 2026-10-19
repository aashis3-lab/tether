import { useState, type ReactNode } from 'react'
import { useSwipe } from '@/hooks/useSwipe'
import { memberStatusLabel } from '@/lib/activities'
import { firstName } from '@/lib/format'
import { hasLocation } from '@/lib/geo'
import { formatClock } from '@/lib/time'
import type { CheckIn, LatLng, Member } from '@/lib/types'
import { Avatar } from './Avatar'
import { FriendList } from './GroupWidget'
import { ChevronRightIcon, PlusIcon } from './icons'

type Badge = { label: string; className: string; glyph: ReactNode }

/** Small status badge for an avatar: with group / heading home / home / needs help / location off. */
function badgeFor(m: Member): Badge {
  if (m.status === 'needs_help') return { label: 'Needs help', className: 'bg-danger text-white', glyph: '!' }
  if (m.status === 'home') return { label: 'Home', className: 'bg-safe text-black', glyph: '✓' }
  if (m.status === 'heading_home') return { label: 'Heading home', className: 'bg-[#1a73e8] text-white', glyph: '→' }
  if (!hasLocation(m)) return { label: 'Location off', className: 'bg-outline text-white', glyph: '–' }
  if (m.status === 'separated' || m.status === 'left_alone')
    return { label: memberStatusLabel(m), className: 'bg-status-checkin text-white', glyph: '•' }
  return { label: 'With group', className: 'bg-safe text-black', glyph: '' }
}

/**
 * The people panel at the top of a party: name and end time, everyone's face
 * with a status badge (plus an invite button), and a tap to expand into the
 * full member list with distance, battery, last update and text / call.
 * Tap or swipe down to open, tap or swipe up to close.
 */
export function PeoplePanel({
  title,
  endTime,
  members,
  me,
  checkIns,
  avatars,
  phones,
  myPos,
  onInvite,
  onMember,
  trailing,
  footer,
}: {
  title: ReactNode
  endTime: string
  members: Member[]
  me: Member | undefined
  checkIns: CheckIn[]
  avatars: Record<string, string | null>
  phones: Record<string, string | null>
  myPos: LatLng | null
  /** Shows the "+" at the end of the faces. Omit in read-only views. */
  onInvite?: () => void
  onMember: (id: string) => void
  /** Extra control at the right of the title row. */
  trailing?: ReactNode
  /** Extra actions at the end of the expanded list. */
  footer?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ordered = [...members].sort((a, b) => Number(b.id === me?.id) - Number(a.id === me?.id))
  // Tap or swipe: down opens the full list, up closes it.
  const swipe = useSwipe({ onTap: () => setOpen((o) => !o), onDown: () => setOpen(true), onUp: () => setOpen(false) })

  return (
    <div className="glass pointer-events-auto relative z-10 overflow-hidden rounded-[24px] shadow-e2">
      {/* Collapsed: the whole panel is one big tap / swipe target. */}
      <div
        {...swipe}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={open ? 'Hide the member list' : 'Show everyone'}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen((o) => !o)}
        className="cursor-pointer select-none"
      >
        <div className="flex items-center gap-2 px-4 pt-2.5">
          <span className="min-w-0 flex-1 truncate">
            <span className="text-lg font-bold">{title}</span>
            <span className="text-sm text-ink-dim"> · Ends {formatClock(endTime)}</span>
          </span>
          <ChevronRightIcon width={18} height={18} className={`shrink-0 text-ink-faint transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
          {trailing}
        </div>

        {!open && (
          <div className="flex gap-3 overflow-hidden px-4 pb-1 pt-2">
            {ordered.slice(0, 6).map((m) => {
              const b = badgeFor(m)
              return (
                <span key={m.id} aria-label={`${m.id === me?.id ? 'You' : m.name}: ${b.label}`} className="flex w-12 shrink-0 flex-col items-center gap-1">
                  <span className="relative">
                    <Avatar name={m.name} url={avatars[m.id]} size={44} />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ring-2 ring-surface-lowest ${b.className}`}
                    >
                      {b.glyph}
                    </span>
                  </span>
                  <span className="w-full truncate text-center text-xs text-ink-dim">{m.id === me?.id ? 'You' : firstName(m.name)}</span>
                </span>
              )
            })}
            {members.length > 6 && (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-high text-xs font-bold text-ink-dim">
                +{members.length - 6}
              </span>
            )}
            {onInvite && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onInvite()
                }}
                aria-label="Invite friends"
                className="flex w-12 shrink-0 flex-col items-center gap-1"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-outline text-ink-dim">
                  <PlusIcon width={20} height={20} />
                </span>
                <span className="text-xs text-ink-dim">Invite</span>
              </button>
            )}
          </div>
        )}
        {/* Grab handle */}
        {!open && <span className="mx-auto mb-1.5 mt-1 block h-1 w-8 rounded-full bg-outline/40" />}
      </div>

      {open && (
        <div className="max-h-[60dvh] overflow-y-auto px-4 pb-1">
          <FriendList members={members} me={me} checkIns={checkIns} avatars={avatars} phones={phones} myPos={myPos} onMemberTap={(m) => onMember(m.id)} />
          <div className="flex gap-2 py-1">
            {onInvite && (
              <button onClick={onInvite} className="flex h-10 items-center gap-2 rounded-full px-1 text-sm font-semibold text-primary-ink">
                <PlusIcon width={18} height={18} /> Invite friends
              </button>
            )}
            {footer}
          </div>
        </div>
      )}
      {open && (
        <button {...swipe} aria-label="Collapse" className="flex h-6 w-full items-center justify-center">
          <span className="h-1 w-8 rounded-full bg-outline/40" />
        </button>
      )}
    </div>
  )
}
