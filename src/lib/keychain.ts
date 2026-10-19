// Safety keychain pairing state, remembered on this device only.

export const KEYCHAIN_KEY = 'tether.keychainPaired'
export const KEYCHAIN_NAME_KEY = 'tether.keychainName'
export const KEYCHAIN_BATTERY_KEY = 'tether.keychainBattery'
export const KEYCHAIN_SEEN_KEY = 'tether.keychainLastPing'

export interface BtDevice {
  name?: string
  gatt?: {
    connect: () => Promise<{
      getPrimaryService: (s: string) => Promise<{
        getCharacteristic: (c: string) => Promise<{ readValue: () => Promise<DataView> }>
      }>
      disconnect?: () => void
    }>
  }
}
export interface BluetoothNav {
  bluetooth?: {
    requestDevice: (o: { acceptAllDevices: boolean; optionalServices?: string[] }) => Promise<BtDevice>
  }
}

export const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
export const write = (k: string, v: string | null) => {
  try {
    if (v == null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    // Storage blocked: the card just won't remember.
  }
}

/** True where Web Bluetooth exists (Chrome on Android / desktop; never iPhone Safari). */
export function keychainSupported() {
  return Boolean((navigator as Navigator & BluetoothNav).bluetooth)
}

/** Paired keychain name from this device, or null. */
export function pairedKeychain(): string | null {
  return read(KEYCHAIN_KEY) === '1' ? read(KEYCHAIN_NAME_KEY) || 'Keychain' : null
}
