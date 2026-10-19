import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { useActiveSessionId } from '@/hooks/useSession'
import { GearIcon, HistoryIcon, PlusIcon, ScanIcon, UserIcon } from './icons'

interface Tab {
  to: string
  label: string
  icon: ReactNode
  /** Extra paths that light this tab up. */
  match?: (path: string) => boolean
  primary?: boolean
}

const TABS: Tab[] = [
  { to: '/start/where', label: 'Start', icon: <PlusIcon width={22} height={22} strokeWidth={2.25} />, primary: true, match: (p) => p.startsWith('/start') },
  { to: '/join', label: 'Join', icon: <ScanIcon width={22} height={22} />, match: (p) => p.startsWith('/join') },
  { to: '/history', label: 'History', icon: <HistoryIcon width={22} height={22} />, match: (p) => p.startsWith('/history') },
  { to: '/', label: 'Profile', icon: <UserIcon width={22} height={22} />, match: (p) => p === '/' },
  { to: '/settings', label: 'Settings', icon: <GearIcon width={22} height={22} />, match: (p) => p.startsWith('/settings') },
]

/**
 * Persistent tab bar when you're not in a party: Start a party (filled),
 * Join, History, Profile, Settings. The active tab is pink. Hidden while
 * you're in a party (the party screen has its own bar).
 */
export function BottomNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { userId } = useAuth()
  const { sessionId } = useActiveSessionId(userId)
  // In a party, the party screen has its own bar.
  if (sessionId !== null) return null
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-[700] flex justify-center border-t border-line/70 bg-surface-low/95 backdrop-blur"
    >
      <ul className="grid w-full max-w-app grid-cols-5 px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1.5">
        {TABS.map((t) => {
          const active = t.match ? t.match(pathname) : pathname === t.to
          return (
            <li key={t.to} className="flex justify-center">
              <button
                onClick={() => navigate(t.to)}
                aria-current={active ? 'page' : undefined}
                aria-label={t.primary ? 'Start a party' : t.label}
                className="flex min-h-[52px] w-full flex-col items-center justify-center gap-0.5 rounded-xl"
              >
                {t.primary ? (
                  <span className="flex h-9 w-12 items-center justify-center rounded-full bg-primary text-primary-on shadow-e1">
                    {t.icon}
                  </span>
                ) : (
                  <span
                    className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
                      active ? 'bg-primary-container text-primary-ink' : 'text-ink-dim'
                    }`}
                  >
                    {t.icon}
                  </span>
                )}
                <span className={`text-xs font-medium ${active || t.primary ? 'text-primary-ink' : 'text-ink-dim'}`}>{t.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
