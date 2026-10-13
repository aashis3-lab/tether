import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { Avatar } from '@/components/Avatar'
import { ChevronRightIcon, GearIcon, HomeIcon, PhoneIcon, ScanIcon, ShieldIcon, UsersIcon } from '@/components/icons'
import { Screen, Spinner, headerButton } from '@/components/ui'
import { WalletSheet } from '@/components/WalletSheet'
import { useActiveSessionId } from '@/hooks/useSession'
import { PartyCard } from '@/components/PartyCard'
import { loadHistory, type PastParty } from '@/lib/history'
import { supabase } from '@/lib/supabase'

/** Home with no party running: you, start/join, party history, quick info. */
export function Home() {
  const { userId, profile } = useAuth()
  const { sessionId } = useActiveSessionId(userId)
  const navigate = useNavigate()
  const [history, setHistory] = useState<PastParty[] | null>(null)
  const [wallet, setWallet] = useState(false)

  // A party you've checked in home from but that's still running.
  const [openParty, setOpenParty] = useState<{ id: string; name: string | null } | null>(null)

  useEffect(() => {
    if (!userId) return
    void loadHistory(userId).then(setHistory)
    void supabase
      .from('session_members')
      .select('session_id, sessions!inner(id, name, status)')
      .eq('user_id', userId)
      .eq('status', 'home')
      .eq('sessions.status', 'active')
      .limit(1)
      .then(({ data }) => {
        const row = (data as unknown as { session_id: string; sessions: { name: string | null } }[] | null)?.[0]
        setOpenParty(row ? { id: row.session_id, name: row.sessions.name } : null)
      })
  }, [userId])

  if (sessionId === undefined) return <Spinner />
  if (sessionId) return <Navigate to={`/session/${sessionId}`} replace />

  return (
    <Screen className="pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div className="flex justify-end">
        <Link to="/settings" aria-label="Settings" className={headerButton}>
          <GearIcon width={20} height={20} />
        </Link>
      </div>

      {/* You */}
      <div className="-mt-4 flex flex-col items-center text-center">
        <button onClick={() => navigate('/settings')} aria-label="Edit profile picture" className="rounded-full">
          <Avatar name={profile?.name ?? '?'} url={profile?.avatar_url} size={112} ring="ring-4 ring-bg" />
        </button>
        <h1 className="mt-3 text-[1.75rem] font-bold tracking-tight">{profile?.name}</h1>
        <p className="text-ink-dim">Ready when you are.</p>
      </div>

      {/* Start / Join */}
      <div className="mt-6 grid grid-cols-[1.4fr_1fr] gap-3">
        <button
          onClick={() => navigate('/start/where')}
          className="flex min-h-[72px] items-center justify-center gap-2 rounded-2xl bg-brand px-3 text-lg font-bold text-white shadow-glow transition active:scale-[0.97]"
        >
          <UsersIcon width={22} height={22} />
          Start a party
        </button>
        <button
          onClick={() => navigate('/join')}
          className="flex min-h-[72px] items-center justify-center gap-2 rounded-2xl border border-white/15 bg-bg-card px-3 text-lg font-bold transition active:scale-[0.97]"
        >
          <ScanIcon width={20} height={20} className="text-ink-dim" />
          Join code
        </button>
      </div>

      {openParty && (
        <button
          onClick={() => navigate(`/session/${openParty.id}`)}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-status-calm/40 bg-status-calm/10 px-4 py-3 text-left"
        >
          <span className="flex-1">
            <span className="block font-bold">{openParty.name ?? 'Your party'} is still going</span>
            <span className="block text-sm text-ink-dim">You're home. Tap to keep an eye on the group.</span>
          </span>
          <ChevronRightIcon width={20} height={20} className="text-ink-dim" />
        </button>
      )}

      {/* Last 3 parties */}
      <div className="mb-2 mt-8 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint">Your parties</h2>
        {history && history.length > 0 && (
          <button
            onClick={() => navigate('/history')}
            aria-label="All parties"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-card text-ink-dim active:scale-95"
          >
            <ChevronRightIcon width={18} height={18} />
          </button>
        )}
      </div>
      {history === null ? (
        <div className="h-16 animate-pulse rounded-2xl bg-bg-card" />
      ) : history.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 p-5 text-center">
          <p className="font-semibold">No parties yet</p>
          <p className="mt-1 text-sm text-ink-dim">Start one and it will show up here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {history.slice(0, 3).map((p) => (
            <PartyCard key={p.id} party={p} onClick={() => navigate(`/history/${p.id}`)} />
          ))}
        </div>
      )}

      {/* Quick info: icon tiles */}
      <div className="mt-8 grid grid-cols-3 gap-3 pb-4">
        <Tile icon={<HomeIcon width={26} height={26} />} label="Home" onClick={() => navigate('/settings?edit=home')} />
        <Tile icon={<PhoneIcon width={26} height={26} />} label="Contact" onClick={() => navigate('/settings?edit=contacts')} />
        <Tile icon={<ShieldIcon width={26} height={26} />} label="Safety card" onClick={() => setWallet(true)} />
      </div>

      <WalletSheet open={wallet} onClose={() => setWallet(false)} profile={profile} me={undefined} />
    </Screen>
  )
}

function Tile({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl bg-bg-card text-sm font-semibold transition active:scale-95"
    >
      <span className="text-accent-orange">{icon}</span>
      {label}
    </button>
  )
}
