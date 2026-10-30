import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { useActiveSessionId } from '@/hooks/useSession'
import { GearIcon, HistoryIcon, HomeIcon, PlusIcon, ScanIcon } from './icons'

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
  { to: '/settings', label: 'Settings', icon: <GearIcon width={22} height={22} />, match: (p) => p.startsWith('/settings') },
]

/**
 * Tab bar when you're not in a party: Home · History · Start · Join ·
 * Settings. Lives in the TabScreen layout (not position: fixed inside an
 * animated page, which would break fixed positioning), so it never scrolls away.
 * Hidden while you're in a party; the party screen has its own controls.
 */
export function BottomNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { userId } = useAuth()
  const { sessionId } = useActiveSessionId(userId)
  if (sessionId !== null) return null
  return (
    <nav aria-label="Main" className="shrink-0 border-t border-white/10 bg-bg-raised/95 backdrop-blur">
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
                  <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white shadow-glow">
                    {t.icon}
                  </span>
                ) : (
                  <span className={`flex h-7 items-center justify-center transition-colors ${active ? 'text-accent-pink' : 'text-ink-faint'}`}>{t.icon}</span>
                )}
                <span className={`text-xs ${active ? 'font-bold text-accent-pink' : t.primary ? 'font-bold text-ink' : 'font-medium text-ink-faint'}`}>{t.label}</span>
                <span className={`h-1 w-1 rounded-full ${active && !t.primary ? 'bg-accent-pink' : 'bg-transparent'}`} />
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/**
 * Layout for the tab screens: exactly one screen tall, the content scrolls
 * inside, and the tab bar sits under it. The page itself never scrolls.
 */
export function TabScreen({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex h-screen h-dvh w-full max-w-app flex-col overflow-hidden bg-bg text-ink">
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex min-h-full animate-enter flex-col px-5 pb-6 pt-[max(1.25rem,env(safe-area-inset-top))]">{children}</div>
      </main>
      <BottomNav />
    </div>
  )
}
