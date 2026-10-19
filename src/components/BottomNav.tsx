import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { useActiveSessionId } from '@/hooks/useSession'
import { HistoryIcon, HomeIcon, PlusIcon, ScanIcon, UserIcon } from './icons'

interface Tab {
  to: string
  label: string
  icon: ReactNode
  match: (path: string) => boolean
  primary?: boolean
}

const TABS: Tab[] = [
  { to: '/', label: 'Home', icon: <HomeIcon width={22} height={22} />, match: (p) => p === '/' },
  { to: '/history', label: 'History', icon: <HistoryIcon width={22} height={22} />, match: (p) => p.startsWith('/history') },
  { to: '/start/where', label: 'Start', icon: <PlusIcon width={24} height={24} strokeWidth={2.25} />, primary: true, match: (p) => p.startsWith('/start') },
  { to: '/join', label: 'Join', icon: <ScanIcon width={22} height={22} />, match: (p) => p.startsWith('/join') },
  { to: '/profile', label: 'Profile', icon: <UserIcon width={22} height={22} />, match: (p) => p.startsWith('/profile') || p.startsWith('/settings') },
]

/**
 * Tab bar when you're not in a party: Home · History · Start · Join ·
 * Profile. Lives in the TabScreen layout (not position: fixed inside a
 * scrolling page), so it can never scroll away. Hidden while you're in a
 * party; the party screen has its own bar.
 */
export function BottomNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { userId } = useAuth()
  const { sessionId } = useActiveSessionId(userId)
  if (sessionId !== null) return null
  return (
    <nav
      aria-label="Main"
      className="shrink-0 bg-surface-lowest/95 shadow-[0_-6px_24px_-12px_rgb(var(--c-primary)/0.25)] backdrop-blur dark:bg-surface-mid/95"
    >
      <ul className="grid w-full grid-cols-5 px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1.5">
        {TABS.map((t) => {
          const active = t.match(pathname)
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

/**
 * Layout for the tab screens: exactly one screen tall (dynamic viewport
 * height), the content scrolls inside, and the tab bar sits under it.
 * The page itself never scrolls, so the bar never moves.
 */
export function TabScreen({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex h-screen h-dvh w-full max-w-app flex-col overflow-hidden bg-surface text-ink">
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex min-h-full animate-enter flex-col px-4 pb-6 pt-[max(0.5rem,env(safe-area-inset-top))]">{children}</div>
      </main>
      <BottomNav />
    </div>
  )
}
