import { useEffect, useState } from 'react'
import {
  locationPermission,
  notificationPermission,
  permissionFixSteps,
  requestLocation,
  requestNotifications,
  type PermState,
} from '@/lib/device'
import { Sheet } from './ui'

type Kind = 'location' | 'notifications'
type State = PermState | 'needs-install'

const LABEL: Record<State, string> = {
  granted: 'On',
  denied: 'Blocked',
  prompt: 'Not set',
  unsupported: 'Not available',
  'needs-install': 'Needs Home Screen',
}

/** Settings → Permissions: live status + one-tap fix for each permission. */
export function PermissionsCard() {
  const [loc, setLoc] = useState<State>('prompt')
  const [notif, setNotif] = useState<State>('prompt')
  const [help, setHelp] = useState<Kind | null>(null)

  const refresh = async () => {
    setLoc(await locationPermission())
    setNotif(notificationPermission())
  }

  useEffect(() => {
    void refresh()
    const onVisible = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  async function fix(kind: Kind, state: State) {
    if (state === 'prompt') {
      if (kind === 'location') await requestLocation()
      else await requestNotifications()
      await refresh()
    } else if (state === 'denied' || state === 'needs-install') {
      setHelp(kind)
    }
  }

  const rows: { kind: Kind; title: string; state: State }[] = [
    { kind: 'location', title: 'Location', state: loc },
    { kind: 'notifications', title: 'Notifications', state: notif },
  ]

  return (
    <div className="mb-2">
      <div className="divide-y divide-line/70 overflow-hidden rounded-2xl bg-surface-lowest dark:bg-surface-mid">
        {rows.map(({ kind, title, state }) => (
          <button
            key={kind}
            type="button"
            onClick={() => fix(kind, state)}
            disabled={state === 'granted' || state === 'unsupported'}
            className="flex min-h-tap w-full items-center justify-between px-4 text-left"
          >
            <span className="text-lg">{title}</span>
            <span
              className={
                state === 'granted' ? 'text-status-calm' : state === 'unsupported' ? 'text-ink-faint' : 'font-semibold text-status-checkin'
              }
            >
              {LABEL[state]}
              {state === 'prompt' && ' · Turn on'}
              {(state === 'denied' || state === 'needs-install') && ' · How to fix'}
            </span>
          </button>
        ))}
      </div>

      <Sheet open={help !== null} onClose={() => setHelp(null)} title={help === 'location' ? 'Turn on location' : 'Turn on notifications'}>
        {help && (
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-lg">
            {permissionFixSteps(help).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        )}
      </Sheet>
    </div>
  )
}
