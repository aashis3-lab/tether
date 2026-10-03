import { useEffect, useState, type ReactNode } from 'react'
import {
  locationPermission,
  notificationPermission,
  permissionFixSteps,
  requestLocation,
  requestNotifications,
} from '@/lib/device'
import { BellIcon, BluetoothIcon, PinIcon } from './icons'
import { Button } from './ui'

// Shared with Settings → Safety keychain.
const KEYCHAIN_KEY = 'tether.keychainPaired'
const KEYCHAIN_NAME_KEY = 'tether.keychainName'

type Kind = 'location' | 'notifications' | 'bluetooth'

interface BluetoothApi {
  requestDevice: (o: { acceptAllDevices: boolean }) => Promise<{ name?: string }>
}
const BT = (navigator as Navigator & { bluetooth?: BluetoothApi }).bluetooth
// Bluetooth only where the browser really supports it (not iPhone Safari).
const ORDER: Kind[] = BT ? ['location', 'notifications', 'bluetooth'] : ['location', 'notifications']

/**
 * What the current step is showing:
 *  checking, reading the real status (already allowed -> skip immediately)
 *  ask     , Allow / Not now
 *  blocked , device fix steps + Try again
 *  install , iPhone needs Add to Home Screen first (notifications)
 *  insecure, location needs https
 */
type Phase = 'checking' | 'ask' | 'blocked' | 'install' | 'insecure'

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      // ignore
    }
  },
}

const COPY: Record<Kind, { icon: ReactNode; title: string; why: string }> = {
  location: {
    icon: <PinIcon width={44} height={44} />,
    title: 'Share your location',
    why: 'Only shared during a party, and deleted the next morning.',
  },
  notifications: {
    icon: <BellIcon width={44} height={44} />,
    title: 'Turn on alerts',
    why: 'So your friends can reach you the second they need you.',
  },
  bluetooth: {
    icon: <BluetoothIcon width={44} height={44} />,
    title: 'Pair your keychain',
    why: 'Lets your safety keychain send a ping without your phone.',
  },

}

/**
 * Onboarding permissions, one per screen with "N of 4" progress. Each
 * permission is requested only from the Allow tap. Already-allowed steps are
 * skipped; blocked ones show this device's fix steps with Try again.
 */
export function PermissionsFlow({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('checking')
  const [busy, setBusy] = useState(false)
  const [recheck, setRecheck] = useState(0)
  const kind = ORDER[index]
  const bt = BT

  const next = () => {
    if (index + 1 >= ORDER.length) onDone()
    else {
      setPhase('checking')
      setIndex(index + 1)
    }
  }

  // Read the real status when a step opens; skip it if it's already allowed.
  useEffect(() => {
    let cancelled = false
    async function check() {
      let p: Phase | 'skip' = 'ask'
      if (kind === 'location') {
        const s = await locationPermission()
        p = s === 'granted' ? 'skip' : s === 'denied' ? 'blocked' : s === 'unsupported' ? 'insecure' : 'ask'
      } else if (kind === 'notifications') {
        const s = notificationPermission()
        p = s === 'granted' || s === 'unsupported' ? 'skip' : s === 'denied' ? 'blocked' : s === 'needs-install' ? 'install' : 'ask'
      } else {
        p = store.get(KEYCHAIN_KEY) === '1' ? 'skip' : 'ask'
      }
      if (cancelled) return
      if (p === 'skip') next()
      else setPhase(p)
    }
    void check()
    // Coming back from the Settings app -> re-check this step.
    const onVisible = () => document.visibilityState === 'visible' && void check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, recheck])

  async function allow() {
    setBusy(true)
    try {
      if (kind === 'location') {
        const r = await requestLocation()
        if (r.ok || r.reason === 'timeout' || r.reason === 'unavailable') return next()
        setPhase(r.reason === 'denied' ? 'blocked' : 'insecure')
      } else if (kind === 'notifications') {
        const s = await requestNotifications()
        if (s === 'granted' || s === 'unsupported') return next()
        setPhase(s === 'denied' ? 'blocked' : s === 'needs-install' ? 'install' : 'ask')
      } else if (bt) {
        try {
          const d = await bt.requestDevice({ acceptAllDevices: true })
          store.set(KEYCHAIN_KEY, '1')
          store.set(KEYCHAIN_NAME_KEY, d.name || 'Keychain')
          return next()
        } catch {
          // Chooser cancelled or Bluetooth off: stay on this screen.
        }
      }
    } finally {
      setBusy(false)
    }
  }

  const copy = COPY[kind]
  const fixKind = kind === 'location' || kind === 'notifications' ? kind : null

  return (
    <div className="flex flex-1 flex-col">
      {/* Progress: N of 4 */}
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1.5">
          {ORDER.map((k, i) => (
            <span key={k} className={`h-1.5 flex-1 rounded-full ${i <= index ? 'bg-accent-pink' : 'bg-white/15'}`} />
          ))}
        </div>
        <p className="text-sm font-semibold text-ink-dim">
          {index + 1} of {ORDER.length}
        </p>
      </div>

      {phase === 'checking' ? (
        <div className="flex-1" />
      ) : (
        <>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-accent-pink to-accent-orange text-white">
              {copy.icon}
            </div>
            <h1 className="text-[2rem] font-bold leading-tight tracking-tight">{copy.title}</h1>
            <p className="mt-3 max-w-xs text-lg text-ink-dim">{copy.why}</p>

            {(phase === 'blocked' || phase === 'install') && fixKind && (
              <div className="mt-6 w-full text-left">
                <p className="mb-2 font-semibold text-status-checkin">
                  {phase === 'install' ? 'One extra step on iPhone:' : 'It’s blocked right now. To turn it on:'}
                </p>
                <ol className="flex list-decimal flex-col gap-2 rounded-xl2 bg-bg-card py-4 pl-9 pr-4">
                  {permissionFixSteps(fixKind).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </div>
            )}
            {phase === 'insecure' && (
              <p className="mt-6 rounded-xl2 bg-bg-card p-4 text-status-checkin">
                Location only works over a secure (https://) link. On a phone during development, use{' '}
                <span className="font-mono">npm run dev:phone</span>.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 pt-6">
            {phase !== 'install' && phase !== 'insecure' && (
              <Button big onClick={allow} disabled={busy}>
                {busy ? 'Waiting...' : phase === 'blocked' ? 'Try again' : 'Allow'}
              </Button>
            )}
            {phase === 'install' && (
              <Button
                big
                variant="secondary"
                onClick={() => {
                  setPhase('checking')
                  setRecheck((n) => n + 1)
                }}
              >
                I've done this
              </Button>
            )}
            <button onClick={next} className="min-h-[48px] text-ink-dim">
              Not now
            </button>
          </div>
        </>
      )}
    </div>
  )
}
