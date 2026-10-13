import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { SearchIcon } from '@/components/icons'
import { PartyCard } from '@/components/PartyCard'
import { Header, Screen } from '@/components/ui'
import { loadHistory, partyDate, type PastParty } from '@/lib/history'

/** Every past party, compact, with search (name, venue, people, date). */
export function PartyHistory() {
  const { userId } = useAuth()
  const navigate = useNavigate()
  const [all, setAll] = useState<PastParty[] | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    if (userId) void loadHistory(userId, 200).then(setAll)
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
    <Screen>
      <Header title="Your parties" back="/" />
      <label className="mt-4 flex min-h-[52px] items-center gap-3 rounded-2xl border border-white/10 bg-bg-card px-4">
        <SearchIcon width={18} height={18} className="text-ink-dim" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search parties, places, friends"
          className="w-full bg-transparent placeholder:text-ink-faint focus:outline-none"
        />
      </label>
      <div className="mt-4 flex flex-col gap-2 pb-4">
        {all === null && <div className="h-16 animate-pulse rounded-2xl bg-bg-card" />}
        {list.map((p) => (
          <PartyCard key={p.id} party={p} onClick={() => navigate(`/history/${p.id}`)} />
        ))}
        {all !== null && list.length === 0 && (
          <p className="py-8 text-center text-ink-dim">{all.length === 0 ? 'No parties yet.' : 'Nothing matches that.'}</p>
        )}
      </div>
    </Screen>
  )
}
