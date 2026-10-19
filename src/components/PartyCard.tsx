import type { PastParty } from '@/lib/history'
import { partyDate } from '@/lib/history'
import { Avatar } from './Avatar'

/** Tiny crown marking who started the party. */
function Crown() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-label="Started the party" className="absolute -right-1 -top-1.5 drop-shadow">
      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z" fill="#f5c518" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

/** Compact past-party card: name, date, small faces (crown on the starter). */
export function PartyCard({ party, onClick }: { party: PastParty; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-surface-lowest px-4 py-3 text-left transition dark:bg-surface-mid active:scale-[0.98]"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{party.name}</span>
        <span className="block text-sm text-ink-dim">{partyDate(party.date)}</span>
      </span>
      <span className="flex -space-x-1.5">
        {party.members.slice(0, 4).map((m) => (
          <span key={m.id} className="relative">
            <Avatar name={m.name} url={m.avatar} size={24} ring="ring-2 ring-surface-lowest" />
            {m.userId && m.userId === party.creatorId && <Crown />}
          </span>
        ))}
        {party.members.length > 4 && (
          <span className="flex h-6 items-center pl-2 text-sm text-ink-dim">+{party.members.length - 4}</span>
        )}
      </span>
    </button>
  )
}
