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
      className="fixed inset-x-0 bottom-0 z-[700] flex justify-center bg-surface-lowest/95 shadow-[0_-6px_24px_-12px_rgb(var(--c-primary)/0.25)] backdrop-blur dark:bg-surface-mid/95"
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
                  <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white shadow-[0_8px_18px_-6px_rgb(var(--c-primary)/0.7)]">
                    {t.icon}
                  </span>
                ) : (
                  <span className={`flex h-7 items-center justify-center transition-colors ${active ? 'text-primary-ink' : 'text-ink-faint'}`}>{t.icon}</span>
                )}
                <span className={`text-xs ${active ? 'font-bold text-primary-ink' : t.primary ? 'font-bold text-ink' : 'font-medium text-ink-faint'}`}>{t.label}</span>
                <span className={`h-1 w-1 rounded-full ${active && !t.primary ? 'bg-primary' : 'bg-transparent'}`} />
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
