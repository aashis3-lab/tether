import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { isAndroid, isIOS, isStandalone } from '@/lib/device'
import { XIcon } from './icons'

const DISMISS_KEY = 'tether.installDismissed'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * First visit in a browser (not installed): a small, dismissible "Add Tether
 * to your Home Screen" banner. Android / desktop Chrome get the real install
 * prompt; iPhone gets the Share -> Add to Home Screen steps. Hidden during a
 * party and on the guardian page so it never covers anything important.
 */
export function InstallBanner() {
  const { pathname } = useLocation()
  const { profile } = useAuth()
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPromptEvent(e as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  // Not during onboarding (or before it), a party, or on the guardian page.
  const hiddenHere =
    pathname.startsWith('/signup') ||
    pathname.startsWith('/session') ||
    pathname.startsWith('/guardian') ||
    pathname.startsWith('/g/')
  if (dismissed || isStandalone() || hiddenHere || !profile) return null
  // Nothing useful to say on browsers that can't install and aren't iOS.
  if (!promptEvent && !isIOS) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // ignore
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[3000] flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-app animate-enter items-start gap-3 rounded-2xl border border-white/10 bg-bg-raised/95 p-3 pl-4 shadow-[0_-8px_30px_rgba(0,0,0,0.5)] backdrop-blur">
        <img src="/icons/icon-96.png" alt="" className="mt-0.5 h-10 w-10 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">Add Tether to your Home Screen</p>
          {promptEvent ? (
            <button
              onClick={async () => {
                await promptEvent.prompt()
                const r = await promptEvent.userChoice
                if (r.outcome === 'accepted') dismiss()
                setPromptEvent(null)
              }}
              className="mt-2 min-h-[44px] rounded-xl bg-white px-5 font-bold text-black"
            >
              Install
            </button>
          ) : (
            <p className="mt-0.5 text-base text-ink-dim">
              {isIOS
                ? 'Tap the Share button, then “Add to Home Screen”. Alerts on iPhone only work from the Home Screen app.'
                : isAndroid
                  ? 'Open the browser menu, then “Install app”.'
                  : 'Use your browser menu to install it.'}
            </p>
          )}
        </div>
        <button aria-label="Dismiss" onClick={dismiss} className="flex h-9 w-9 shrink-0 items-center justify-center text-ink-dim">
          <XIcon width={18} height={18} />
        </button>
      </div>
    </div>
  )
}
