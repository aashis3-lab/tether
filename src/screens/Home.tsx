import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { Avatar } from '@/components/Avatar'
import { ChevronRightIcon, HomeIcon, ShieldIcon, UsersIcon } from '@/components/icons'
import { BottomNav } from '@/components/BottomNav'
import { KeychainCard } from '@/components/KeychainCard'
import { ListItem, ListSection, Screen, Spinner, StatusChip } from '@/components/ui'
import { buttonClass } from '@/components/buttons'
import { WalletSheet } from '@/components/WalletSheet'
import { useActiveSessionId } from '@/hooks/useSession'
import { firstName } from '@/lib/format'
import { loadHistory, partyDate, type PastParty } from '@/lib/history'
import { keychainSupported } from '@/lib/keychain'
import { supabase } from '@/lib/supabase'

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

/** Dashboard with no party running: tonight, guardian, keychain, recent activity. */
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

  const guardian = profile?.emergency_contact_name
  const extra = profile?.additional_emergency_contacts?.length ?? 0

  return (
    <Screen className="pb-28">
      {/* Top app bar: brand + profile */}
      <div className="-mx-1 flex min-h-[56px] items-center justify-between">
        <div className="flex items-center gap-2 pl-1">
          <img src="/icons/logo-mark.png" alt="" className="h-7 w-auto" />
          <span className="text-xl font-medium tracking-tight">Tether</span>
        </div>
        <button onClick={() => navigate('/settings')} aria-label="Profile and settings" className="rounded-full p-1.5">
          <Avatar name={profile?.name ?? '?'} url={profile?.avatar_url} size={34} />
        </button>
      </div>

      <div className="mb-4 mt-2">
        <p className="label">{greeting()}</p>
        <h1 className="text-3xl font-normal tracking-tight">{firstName(profile?.name) || 'Hi'}</h1>
      </div>

      {/* Tonight */}
      {openParty ? (
        <button
          onClick={() => navigate(`/session/${openParty.id}`)}
          className="flex w-full items-center gap-3 rounded-2xl bg-brand-tonal p-4 text-left shadow-e1"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-lowest/70 text-primary-ink">
            <UsersIcon width={22} height={22} />
          </span>
          <span className="min-w-0 flex-1">
            <StatusChip tone="calm" className="mb-1">Live now</StatusChip>
            <span className="block truncate text-lg font-medium text-primary-on-container">{openParty.name ?? 'Your party'} is still going</span>
            <span className="block text-xs text-primary-on-container/80">You're home. Tap to watch the party until everyone is.</span>
          </span>
          <ChevronRightIcon width={20} height={20} className="text-primary-on-container/70" />
        </button>
      ) : (
        <div className="rounded-[20px] bg-brand-tonal p-4 shadow-e1">
          <p className="text-xs font-medium text-primary-on-container/80">Tonight</p>
          <p className="mt-0.5 text-xl font-medium text-primary-on-container">No night out running</p>
          <p className="mt-1 text-base text-primary-on-container/80">
            Start one and Tether watches the group for you until everyone's home.
          </p>
          <button onClick={() => navigate('/start/where')} className={`mt-4 ${buttonClass('primary')}`}>
            <UsersIcon width={18} height={18} />
            Start a party
          </button>
        </div>
      )}

      {/* Guardian and safety info */}
      <ListSection title="Your safety net">
        <ListItem
          leading={<Avatar name={guardian ?? '?'} size={40} />}
          headline={guardian ?? 'Add a guardian'}
          supporting={
            guardian
              ? `Guardian · gets escalations by SMS${extra ? ` · +${extra} more contact${extra > 1 ? 's' : ''}` : ''}`
              : 'The sober person at home who gets alerts'
          }
          trailing={guardian ? <StatusChip tone="calm">Ready</StatusChip> : undefined}
          onClick={() => navigate('/settings?edit=contacts')}
          chevron
        />
        <ListItem
          leading={<RowIcon><HomeIcon width={20} height={20} /></RowIcon>}
          headline="Home address"
          supporting={profile?.home_address ?? 'Used for "Get me home" and arrival checks'}
          onClick={() => navigate('/settings?edit=home')}
          chevron
        />
        <ListItem
          leading={<RowIcon><ShieldIcon width={20} height={20} /></RowIcon>}
          headline="Safety card"
          supporting="Emergency contact, guardian and medical info"
          onClick={() => setWallet(true)}
          chevron
        />
      </ListSection>

      {keychainSupported() && (
        <section>
          <h2 className="section-title">Keychain</h2>
          <KeychainCard compact />
        </section>
      )}

      {/* Recent activity timeline */}
      <div className="flex items-center justify-between px-4 pb-2 pt-5">
        <h2 className="text-sm font-medium text-primary-ink">Recent activity</h2>
        {history && history.length > 0 && (
          <button onClick={() => navigate('/history')} className="-mr-3 flex h-8 items-center gap-0.5 rounded-full px-3 text-sm font-medium text-primary-ink">
            See all <ChevronRightIcon width={16} height={16} />
          </button>
        )}
      </div>
      {history === null ? (
        <div className="h-20 animate-pulse rounded-2xl bg-surface-high" />
      ) : history.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant p-5 text-center">
          <p className="text-lg font-medium">No nights out yet</p>
          <p className="mt-1 text-base text-ink-dim">Your past parties will show up here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line/70 overflow-hidden rounded-2xl bg-surface-lowest dark:bg-surface-mid">
          {history.slice(0, 3).map((p) => (
            <li key={p.id}>
              <button
                onClick={() => navigate(`/history/${p.id}`)}
                className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-ink/[0.04]"
              >
                <span className="min-w-0 flex-1 truncate text-lg">{p.name}</span>
                <span className="shrink-0 text-xs text-ink-dim">{partyDate(p.date)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <WalletSheet open={wallet} onClose={() => setWallet(false)} profile={profile} me={undefined} />
      <BottomNav />
    </Screen>
  )
}

function RowIcon({ children }: { children: ReactNode }) {
  return <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-container/70 text-secondary-on-container">{children}</span>
}
