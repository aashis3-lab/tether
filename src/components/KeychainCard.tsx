import { useState } from 'react'
import { BluetoothIcon } from './icons'

const KEYCHAIN_KEY = 'tether.keychainPaired'
const KEYCHAIN_NAME_KEY = 'tether.keychainName'

interface BluetoothNav {
  bluetooth?: { requestDevice: (o: { acceptAllDevices: boolean }) => Promise<{ name?: string }> }
}

const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}

/**
 * Real Web Bluetooth pairing for a safety keychain. Only shown where the
 * browser supports Web Bluetooth (Chrome on Android / desktop); iPhone
 * Safari has none, so the card is hidden there.
 */
export function KeychainCard() {
  const bt = (navigator as Navigator & BluetoothNav).bluetooth
  const [name, setName] = useState<string | null>(read(KEYCHAIN_KEY) === '1' ? read(KEYCHAIN_NAME_KEY) || 'Keychain' : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!bt) return null

  async function pair() {
    setBusy(true)
    setError('')
    try {
      const d = await bt!.requestDevice({ acceptAllDevices: true })
      const n = d.name || 'Keychain'
      localStorage.setItem(KEYCHAIN_KEY, '1')
      localStorage.setItem(KEYCHAIN_NAME_KEY, n)
      setName(n)
    } catch (e) {
      const msg = (e as Error).message ?? ''
      // Closing the chooser is not an error worth showing.
      if (!/cancel/i.test(msg)) setError(msg || 'Pairing failed. Is Bluetooth on?')
    } finally {
      setBusy(false)
    }
  }

  function unpair() {
    try {
      localStorage.removeItem(KEYCHAIN_KEY)
      localStorage.removeItem(KEYCHAIN_NAME_KEY)
    } catch {
      // ignore
    }
    setName(null)
  }

  return (
    <div className="mt-5 rounded-xl2 bg-bg-card p-4">
      <p className="text-sm font-bold uppercase tracking-wide text-accent-orange">Safety keychain</p>
      <p className={`mt-1 flex items-center gap-2 font-semibold ${name ? 'text-status-calm' : 'text-ink-dim'}`}>
        <BluetoothIcon width={16} height={16} />
        {name ? `Paired: ${name}` : 'Not paired'}
      </p>
      {name ? (
        <button onClick={unpair} className="mt-2 min-h-[44px] text-sm text-ink-faint underline">
          Unpair
        </button>
      ) : (
        <button
          onClick={pair}
          disabled={busy}
          className="mt-3 flex min-h-tap w-full items-center justify-center gap-2 rounded-xl2 bg-brand text-lg font-bold text-white disabled:opacity-60"
        >
          <BluetoothIcon width={20} height={20} />
          {busy ? 'Looking for devices...' : 'Pair a keychain'}
        </button>
      )}
      {error && <p className="mt-2 text-sm text-status-alert">{error}</p>}
    </div>
  )
}
