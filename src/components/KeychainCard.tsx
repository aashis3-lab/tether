import { useState } from 'react'
import { playAlertLoop } from '@/lib/sound'
import { toast } from '@/lib/toast'
import { timeAgo } from '@/lib/geo'
import { BatteryIcon, BellIcon, BluetoothIcon, ClockIcon } from './icons'
import { buttonClass } from './buttons'
import {
  KEYCHAIN_BATTERY_KEY,
  KEYCHAIN_KEY,
  KEYCHAIN_NAME_KEY,
  KEYCHAIN_SEEN_KEY,
  pairedKeychain,
  read,
  write,
  type BluetoothNav,
  type BtDevice,
} from '@/lib/keychain'

/** Reads the standard GATT battery level if the keychain offers it. */
async function readBattery(d: BtDevice): Promise<number | null> {
  try {
    const server = await d.gatt?.connect()
    if (!server) return null
    const svc = await server.getPrimaryService('battery_service')
    const ch = await svc.getCharacteristic('battery_level')
    const v = await ch.readValue()
    server.disconnect?.()
    return v.getUint8(0)
  } catch {
    return null
  }
}

/**
 * Safety keychain device card: real Web Bluetooth pairing, connection status,
 * battery (when the keychain reports it), last contact and a local test
 * alert. Hidden where the browser has no Web Bluetooth.
 */
export function KeychainCard({ compact = false }: { compact?: boolean }) {
  const bt = (navigator as Navigator & BluetoothNav).bluetooth
  const [name, setName] = useState<string | null>(pairedKeychain)
  const [battery, setBattery] = useState<string | null>(read(KEYCHAIN_BATTERY_KEY))
  const [seen, setSeen] = useState<string | null>(read(KEYCHAIN_SEEN_KEY))
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')

  if (!bt) return null

  async function pair() {
    setBusy(true)
    setError('')
    try {
      const d = await bt!.requestDevice({ acceptAllDevices: true, optionalServices: ['battery_service'] })
      const n = d.name || 'Keychain'
      const now = new Date().toISOString()
      write(KEYCHAIN_KEY, '1')
      write(KEYCHAIN_NAME_KEY, n)
      write(KEYCHAIN_SEEN_KEY, now)
      setName(n)
      setSeen(now)
      const level = await readBattery(d)
      write(KEYCHAIN_BATTERY_KEY, level == null ? null : String(level))
      setBattery(level == null ? null : String(level))
    } catch (e) {
      const msg = (e as Error).message ?? ''
      // Closing the chooser is not an error worth showing.
      if (!/cancel/i.test(msg)) setError(msg || 'Pairing failed. Is Bluetooth on?')
    } finally {
      setBusy(false)
    }
  }

  function unpair() {
    ;[KEYCHAIN_KEY, KEYCHAIN_NAME_KEY, KEYCHAIN_BATTERY_KEY, KEYCHAIN_SEEN_KEY].forEach((k) => write(k, null))
    setName(null)
    setBattery(null)
    setSeen(null)
  }

  /** Plays the alert sound on this phone for a moment; nothing is sent. */
  function testAlert() {
    if (testing) return
    setTesting(true)
    const stop = playAlertLoop()
    window.setTimeout(() => {
      stop()
      setTesting(false)
      toast('Test alert played on this phone. Nothing was sent.', 'success')
    }, 2500)
  }

  return (
    <div className={`rounded-2xl bg-surface-lowest p-4 dark:bg-surface-mid ${compact ? '' : 'mt-1'}`}>
      <div className="flex items-center gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            name ? 'bg-primary-container text-primary-on-container' : 'bg-surface-highest text-ink-dim'
          }`}
        >
          <BluetoothIcon width={22} height={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-ink-dim">Safety keychain</p>
          <p className="truncate text-lg font-medium">{name ?? 'Not paired'}</p>
        </div>
        <span
          className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ${
            name ? 'bg-status-calm/10 text-status-calm' : 'bg-surface-highest text-ink-dim'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${name ? 'bg-status-calm' : 'bg-outline'}`} />
          {name ? 'Paired' : 'Off'}
        </span>
      </div>

      {name && (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-surface-high/60 px-3 py-2">
            <dt className="flex items-center gap-1 text-ink-dim">
              <BatteryIcon width={13} height={13} /> Battery
            </dt>
            <dd className="mt-0.5 text-base font-medium">{battery != null ? `${battery}%` : 'Not reported'}</dd>
          </div>
          <div className="rounded-xl bg-surface-high/60 px-3 py-2">
            <dt className="flex items-center gap-1 text-ink-dim">
              <ClockIcon width={13} height={13} /> Last contact
            </dt>
            <dd className="mt-0.5 text-base font-medium">{seen ? timeAgo(seen) : 'Never'}</dd>
          </div>
        </dl>
      )}

      {name ? (
        <div className="mt-3 flex gap-2">
          <button onClick={testAlert} disabled={testing} className={`${buttonClass('tonal')} flex-1`}>
            <BellIcon width={18} height={18} />
            {testing ? 'Playing…' : 'Test alert'}
          </button>
          {!compact && (
            <button onClick={unpair} className={`${buttonClass('text')} !w-auto`}>
              Unpair
            </button>
          )}
        </div>
      ) : (
        <button onClick={pair} disabled={busy} className={`mt-3 ${buttonClass('primary')}`}>
          <BluetoothIcon width={18} height={18} />
          {busy ? 'Looking for devices…' : 'Pair a keychain'}
        </button>
      )}
      {error && <p className="mt-2 text-xs text-status-alert">{error}</p>}
    </div>
  )
}
