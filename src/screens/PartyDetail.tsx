import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { Avatar } from '@/components/Avatar'
import { PinIcon, ShieldIcon } from '@/components/icons'
import { Header, Eyebrow, Screen, Spinner, Title } from '@/components/ui'
import { loadHistory, partyDate, type PastParty } from '@/lib/history'
import { formatClock } from '@/lib/time'

/** One past party: who came (with home times), where, and your guardian. */
export function PartyDetail() {
  const { id } = useParams()
  const { userId } = useAuth()
  const [party, setParty] = useState<PastParty | null | undefined>(undefined)

  useEffect(() => {
    if (userId) void loadHistory(userId, 100).then((h) => setParty(h.find((p) => p.id === id) ?? null))
  }, [userId, id])

  if (party === undefined) return <Spinner />

  return (
    <Screen>
      <Header title="Party" back="/history" />
      {!party ? (
        <p className="text-ink-dim">This party isn't available.</p>
      ) : (
        <>
          <Eyebrow tone="orange">{partyDate(party.date)}</Eyebrow>
          <Title className="mt-1">{party.name}</Title>
          <p className={`mt-2 font-semibold ${party.allHomeBy ? 'text-status-calm' : 'text-ink-dim'}`}>
            {party.allHomeBy
              ? `Everyone home by ${formatClock(party.allHomeBy)}`
              : `${party.homeCount} of ${party.members.length} checked in home`}
          </p>

          <h2 className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-ink-faint">Who came</h2>
          <ul className="divide-y divide-white/5 rounded-2xl bg-bg-card px-4">
            {party.members.map((m) => (
              <li key={m.id} className="flex min-h-[60px] items-center gap-3 py-2">
                <Avatar name={m.name} url={m.avatar} size={40} />
                <span className="flex-1 truncate font-semibold">
                  {m.name}
                  {m.userId === userId && <span className="font-normal text-ink-faint"> (you)</span>}
                </span>
                <span className={`text-sm font-semibold ${m.home ? 'text-status-calm' : 'text-ink-faint'}`}>
                  {m.home ? `Home${m.homeAt ? ` ${formatClock(m.homeAt)}` : ''}` : 'No check-in'}
                </span>
              </li>
            ))}
          </ul>

          {party.venues.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-ink-faint">Where</h2>
              <ul className="divide-y divide-white/5 rounded-2xl bg-bg-card px-4">
                {party.venues.map((v, i) => (
                  <li key={i} className="flex min-h-[52px] items-center gap-3">
                    <PinIcon width={18} height={18} className="text-accent-orange" />
                    <span className="font-semibold">{v}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2 className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-ink-faint">Your guardian</h2>
          <div className="flex min-h-[52px] items-center gap-3 rounded-2xl bg-bg-card px-4">
            <ShieldIcon width={18} height={18} className="text-accent-pink" />
            <span className="font-semibold">{party.myGuardian ?? 'Not set'}</span>
          </div>

          <p className="mt-6 pb-4 text-center text-base text-ink-faint">Locations from this party were deleted when it ended.</p>
        </>
      )}
    </Screen>
  )
}
