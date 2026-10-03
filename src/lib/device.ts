// Device + permission helpers. Browsers differ a lot here (iOS Safari vs
// Android Chrome vs installed PWA), so everything permission-related goes
// through this module instead of touching the raw APIs in screens.

export type PermState = 'granted' | 'denied' | 'prompt' | 'unsupported'

const ua = navigator.userAgent

export const isIOS =
  /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isAndroid = /Android/.test(ua)

/** Running as an installed home-screen app (PWA). */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** Location (and most permission APIs) only work on HTTPS or localhost. */
export const isSecure = window.isSecureContext

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

export async function locationPermission(): Promise<PermState> {
  if (!('geolocation' in navigator) || !isSecure) return 'unsupported'
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return status.state
  } catch {
    // Older Safari: no Permissions API for geolocation. Unknown -> treat as prompt.
    return 'prompt'
  }
}

/** Calls back whenever the user flips location permission in browser settings. */
export function watchLocationPermission(cb: (s: PermState) => void): () => void {
  let status: PermissionStatus | null = null
  const onChange = () => status && cb(status.state)
  navigator.permissions
    ?.query({ name: 'geolocation' })
    .then((s) => {
      status = s
      s.addEventListener('change', onChange)
    })
    .catch(() => undefined)
  return () => status?.removeEventListener('change', onChange)
}

export type LocationResult =
  | { ok: true; lat: number; lng: number; accuracy: number }
  | { ok: false; reason: 'denied' | 'unavailable' | 'timeout' | 'insecure' | 'unsupported' }

/** Triggers the browser prompt (when needed) and reports what happened. */
export function requestLocation(timeout = 20_000): Promise<LocationResult> {
  if (!isSecure) return Promise.resolve({ ok: false, reason: 'insecure' })
  if (!('geolocation' in navigator)) return Promise.resolve({ ok: false, reason: 'unsupported' })
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ ok: true, lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) =>
        resolve({
          ok: false,
          reason: e.code === e.PERMISSION_DENIED ? 'denied' : e.code === e.TIMEOUT ? 'timeout' : 'unavailable',
        }),
      { enableHighAccuracy: true, timeout, maximumAge: 0 }
    )
  })
}

/** Step-by-step instructions for re-enabling a blocked permission on this device. */
export function permissionFixSteps(kind: 'location' | 'notifications'): string[] {
  if (kind === 'location') {
    if (isIOS)
      return [
        'Open the Settings app → Privacy & Security → Location Services.',
        'Make sure Location Services is on.',
        'Scroll to “Safari Websites” and choose “While Using the App”.',
        isStandalone()
          ? 'Come back to Tether and tap “Try again”.'
          : 'In Safari, tap “aA” in the address bar → Website Settings → Location → Allow, then “Try again”.',
      ]
    if (isAndroid)
      return [
        'Make sure Location is on (swipe down → Location).',
        'Tap the icon left of the address bar → Permissions → Location → Allow.',
        'Come back and tap “Try again”.',
      ]
    return ['Click the icon left of the address bar → Site settings → Location → Allow.', 'Then click “Try again”.']
  }
  if (isIOS)
    return isStandalone()
      ? ['Open Settings → Notifications → Tether.', 'Turn on Allow Notifications, then come back.']
      : [
          'iPhone only allows web alerts from apps on your Home Screen.',
          'Tap the Share button → “Add to Home Screen”.',
          'Open Tether from your Home Screen and allow notifications there.',
        ]
  if (isAndroid)
    return [
      'Tap the icon left of the address bar → Permissions → Notifications → Allow.',
      'Also check Android Settings → Apps → Chrome → Notifications is on.',
    ]
  return ['Click the icon left of the address bar → Site settings → Notifications → Allow.']
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * 'needs-install' = iOS Safari tab: notifications only exist once the app is
 * added to the Home Screen (iOS 16.4+).
 */
export function notificationPermission(): PermState | 'needs-install' {
  if (!('Notification' in window)) return isIOS && !isStandalone() ? 'needs-install' : 'unsupported'
  const p = Notification.permission
  return p === 'default' ? 'prompt' : p
}

export async function requestNotifications(): Promise<PermState | 'needs-install'> {
  const current = notificationPermission()
  if (current !== 'prompt') return current
  try {
    const result = await Notification.requestPermission()
    return result === 'default' ? 'prompt' : result
  } catch {
    return 'unsupported'
  }
}

/**
 * Shows a system notification. Android Chrome forbids `new Notification()`
 * (it throws "Illegal constructor"), it must go through the service worker.
 */
export async function notify(title: string, body: string, tag?: string) {
  if (notificationPermission() !== 'granted') return
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await reg.showNotification(title, { body, tag, icon: '/icons/icon-192.png', requireInteraction: true } as NotificationOptions)
      return
    }
  } catch {
    // fall through to the page-level API
  }
  try {
    new Notification(title, { body, tag })
  } catch {
    // Not supported in this context; the in-app overlay still shows.
  }
}
