import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { SearchIcon } from '@/components/icons'
import { PartyCard } from '@/components/PartyCard'
import { BottomNav } from '@/components/BottomNav'
import { Header, Screen } from '@/components/ui'
import { loadActiveParty, loadHistory, partyDate, type ActiveParty, type PastParty } from '@/lib/history'
import { formatClock } from '@/lib/time'
import { ChevronRightIcon } from '@/components/icons'

/** Every past party, compact, with search (name, venue, people, date). */
export function PartyHistory() {
  const { userId } = useAuth()
  const navigate = useNavigate()
  const [all, setAll] = useState<PastParty[] | null>(null)
  const [q, setQ] = useState('')
  const [active, setActive] = useState<ActiveParty | null>(null)

  useEffect(() => {
    if (!userId) return
    void loadHistory(userId, 200).then(setAll)
    void loadActiveParty(userId).then(setActive)
  }, [userId])

  const needle = q.trim().toLowerCase()
  const list = (all ?? []).filter(
    (p) =>
      !needle ||
      p.name.toLowerCase().includes(needle) ||
      p.venues.some((v) => v.toLowerCase().includes(needle)) ||
      p.members.some((m) => m.name.toLowerCase().includes(needle)) ||
      partyDate(p.date).toLowerCase().includes(needle)
  )

  return (
    <Screen className="pb-28">
      <Header title="History" />
      <label className="mt-2 flex min-h-[56px] items-center gap-3 rounded-full bg-surface-high px-5 focus-within:ring-2 focus-within:ring-primary">
        <SearchIcon width={18} height={18} className="text-ink-dim" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search parties, places, friends"
          className="w-full bg-transparent text-lg placeholder:text-ink-faint focus:outline-none"
        />
      </label>
      {active && (
        <button
          onClick={() => navigate(`/session/${active.id}`)}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-status-calm/10 px-4 py-3 text-left active:scale-[0.98]"
        >
          <span className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-safe" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium uppercase tracking-wider text-safe">Happening now</span>
            <span className="block truncate text-lg font-medium">{active.name}</span>
            <span className="block text-base text-ink-dim">Ends {formatClock(active.endTime)} · tap to open the map</span>
          </span>
          <ChevronRightIcon width={22} height={22} className="shrink-0 text-ink-dim" />
        </button>
      )}
      <div className="mt-4 flex flex-col gap-2 pb-4">
        {all === null && <div className="h-16 animate-pulse rounded-2xl bg-surface-high/70" />}
        {list.map((p) => (
          <PartyCard key={p.id} party={p} onClick={() => navigate(`/history/${p.id}`)} />
        ))}
        {all !== null && list.length === 0 && (
          <p className="py-8 text-center text-ink-dim">
            {all.length > 0 ? 'Nothing matches that.' : active ? 'Past parties will show up here.' : 'No parties yet.'}
          </p>
        )}
      </div>
      <BottomNav />
    </Screen>
  )
}
