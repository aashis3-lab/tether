import { useRef, useState, type ReactNode } from 'react'
import type { Member, Pin } from '@/lib/types'
import { useElementHeight } from '@/hooks/useElementHeight'
import { MapView } from './MapView'
import { MemberCard } from './MemberCard'
import { PeoplePanel } from './PeoplePanel'
import { XIcon } from './icons'

/**
 * Observing mode: a read-only view of a party for guardians and for members
 * who are home. Map, everyone's face and status, live; tap a person to call
 * them. No Find me / Status / HELP: nothing that implies you're in the party.
 */
export function PartyWatch({
  partyName,
  endTime,
  members,
  pins,
  avatars,
  phones,
  meId,
  onExit,
  exitLabel = 'Leave party view',
  bottom,
}: {
  partyName: string
  endTime: string
  members: Member[]
  pins: Pin[]
  avatars: Record<string, string | null>
  phones: Record<string, string | null>
  meId?: string
  onExit: () => void
  exitLabel?: string
  /** Bottom card: a note, the guardian instruction, the exit button. */
  bottom: ReactNode
}) {
  const [cardId, setCardId] = useState<string | null>(null)
  const cardMember = members.find((m) => m.id === cardId) ?? null
  const topRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const topH = useElementHeight(topRef)
  const bottomH = useElementHeight(bottomRef)
  const me = members.find((m) => m.id === meId)

  return (
    <>
      <div className="fixed inset-0 z-0 flex justify-center bg-surface">
        <div className="relative isolate h-full w-full max-w-app">
          <MapView members={members} pins={pins} myMemberId={meId} fitMode="auto" topPad={topH} bottomPad={bottomH} onMemberClick={setCardId} avatars={avatars} />
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-0 top-0 z-[800] flex justify-center">
        <div ref={topRef} className="w-full max-w-app px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <PeoplePanel
            title={<>Watching {partyName}</>}
            endTime={endTime}
            members={members}
            me={me}
            checkIns={[]}
            avatars={avatars}
            phones={phones}
            myPos={null}
            onMember={setCardId}
            trailing={
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onExit()
                }}
                aria-label={exitLabel}
                className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-dim"
              >
                <XIcon width={18} height={18} />
              </button>
            }
          />
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[900] flex justify-center">
        <div
          ref={bottomRef}
          className="pointer-events-auto w-full max-w-app rounded-t-[28px] bg-surface-low px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-2px_12px_rgb(0_0_0/0.12)]"
        >
          {bottom}
        </div>
      </div>

      {cardMember && (
        <MemberCard
          member={cardMember}
          avatar={avatars[cardMember.id] ?? null}
          phone={phones[cardMember.id] ?? null}
          myPos={null}
          isMe={cardMember.id === meId}
          onClose={() => setCardId(null)}
        />
      )}
    </>
  )
}
