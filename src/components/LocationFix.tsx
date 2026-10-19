import { useState } from 'react'
import { permissionFixSteps, requestLocation } from '@/lib/device'
import type { GpsStatus } from '@/hooks/useLocationReporter'
import { Button, Sheet } from './ui'

/**
 * Amber banner shown when this device isn't sharing location, with a sheet
 * of device-specific steps and a "Try again" that re-prompts.
 */
export function LocationFix({ status, onRetry }: { status: GpsStatus; onRetry: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [stillBlocked, setStillBlocked] = useState(false)

  if (status === 'ok' || status === 'starting') return null

  if (status === 'searching') {
    return <p className="mt-3 text-xs text-ink-dim">Looking for GPS signal…</p>
  }

  const title =
    status === 'denied'
      ? 'Location is off, your group can’t see you'
      : status === 'insecure'
        ? 'Location needs a secure (https) link'
        : 'Location isn’t available on this device'

  async function tryAgain() {
    setBusy(true)
    const r = await requestLocation()
    setBusy(false)
    if (r.ok || r.reason === 'timeout' || r.reason === 'unavailable') {
      setOpen(false)
      setStillBlocked(false)
      onRetry()
    } else {
      setStillBlocked(true)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-3 flex min-h-tap w-full items-center justify-between gap-3 rounded-xl bg-status-checkin/10 px-4 text-left text-base font-medium text-status-checkin"
      >
        <span>{title}</span>
        {status === 'denied' && <span className="shrink-0 rounded-full bg-status-checkin/15 px-3 py-1 text-sm">Fix</span>}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Turn on location">
        {status === 'insecure' ? (
          <p className="text-base text-ink-dim">
            Browsers only share location over https. Open Tether from its https address
            {import.meta.env.DEV && (
              <>
                {' '}(during development on a phone, run <span className="font-mono">npm run dev:phone</span>)
              </>
            )}
            .
          </p>
        ) : (
          <>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-lg">
              {permissionFixSteps('location').map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            {stillBlocked && <p className="mt-4 text-status-checkin">Still blocked. Check the steps above, then try again.</p>}
            <Button className="mt-5" onClick={tryAgain} disabled={busy}>
              {busy ? 'Checking…' : 'Try again'}
            </Button>
          </>
        )}
      </Sheet>
    </>
  )
}
