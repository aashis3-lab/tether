/** "K7MQ4X" -> "K7M 4QX"; old "TG4826" codes -> "TG 4826". Partial input passes through. */
export function formatCode(code: string) {
  if (/^TG\d{4}$/.test(code)) return `${code.slice(0, 2)} ${code.slice(2)}`
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code
}

/** First word of a name: "Maya Chen" -> "Maya". */
export function firstName(name: string | null | undefined) {
  return (name ?? '').trim().split(/\s+/)[0] ?? ''
}

/**
 * Base URL for invite links/QR codes. VITE_PUBLIC_APP_URL (e.g. your Vercel
 * URL, or https://192.168.x.x:5173 from `npm run dev:phone`) wins; otherwise
 * the address this browser is on.
 */
export function appBaseUrl(): string {
  const configured = (import.meta.env.VITE_PUBLIC_APP_URL ?? '').trim().replace(/\/$/, '')
  return configured || window.location.origin
}

export function joinLink(code: string) {
  return `${appBaseUrl()}/join/${code}`
}

/** True when invite links would point at this computer only (localhost). */
export function inviteLinkIsLocalOnly(): boolean {
  try {
    const host = new URL(appBaseUrl()).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
  } catch {
    return false
  }
}
