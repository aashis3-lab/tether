import { displayPhone, parsePhone } from '@/lib/phone'
import { supabase } from '@/lib/supabase'

/**
 * VITE_AUTH_MODE:
 *  - "sms" (default): real Supabase phone OTP (needs an SMS provider such as
 *    Twilio configured under Authentication -> Providers -> Phone).
 *  - "mock" (local development only, must be set explicitly): no SMS is sent. The app shows the code in an on-screen
 *    "incoming text" banner, and on verify signs in with a Supabase anonymous
 *    session. The phone number is stored on the profile. Requires
 *    "Allow anonymous sign-ins" in the Supabase dashboard.
 */
export const AUTH_MODE: 'mock' | 'sms' =
  import.meta.env.VITE_AUTH_MODE === 'mock' ? 'mock' : 'sms'

/** Returns the code to display in mock mode, or null when a real SMS was sent. */
export async function sendCode(phone: string): Promise<string | null> {
  if (AUTH_MODE === 'mock') {
    return String(Math.floor(100_000 + Math.random() * 900_000))
  }
  const { error } = await supabase.auth.signInWithOtp({ phone })
  if (error) throw new Error(friendlyAuthError(error.message))
  return null
}

/** Supabase limits one SMS per number per 60s by default. */
export const RESEND_COOLDOWN_S = 60

export async function verifyCode(phone: string, code: string, mockCode: string | null) {
  if (AUTH_MODE === 'mock') {
    if (code !== mockCode) throw new Error("That code doesn't match. Try again.")
    const { data: existing } = await supabase.auth.getSession()
    // Same number as the account already signed in on this browser -> keep it.
    // A different number is a different person: sign the old one out first,
    // otherwise they'd silently share one account.
    if (existing.session) {
      if (existing.session.user.user_metadata?.phone === phone) return
      await supabase.auth.signOut()
    }
    const { error } = await supabase.auth.signInAnonymously({ options: { data: { phone } } })
    if (error) throw error
    return
  }
  const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' })
  if (error) throw new Error(friendlyAuthError(error.message))
}

/** Turns Supabase/SMS-provider errors into something a person can act on. */
export function friendlyAuthError(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('expired') || m.includes('invalid') || m.includes('token'))
    return "That code didn't work. Check the text, or send a new code."
  const wait = /after (\d+) seconds?/.exec(m)
  if (wait) return `Please wait ${wait[1]} seconds before requesting another code.`
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many tries. Wait a minute and try again.'
  if (m.includes('provider') || m.includes('phone signups are disabled') || m.includes('sms'))
    return "Texting isn't set up on the server yet (Supabase → Auth → Phone provider)."
  if (m.includes('invalid phone') || m.includes('phone number')) return "That phone number doesn't look right. Include the country code."
  return msg
}

/**
 * Android Chrome: reads the incoming SMS code automatically (WebOTP). Needs the
 * SMS to end with "@<your-domain> #<code>", see README "Real SMS codes".
 * Resolves to the code, or null if unsupported/cancelled.
 */
export async function listenForSmsCode(signal: AbortSignal): Promise<string | null> {
  if (!('OTPCredential' in window)) return null
  try {
    const cred = (await navigator.credentials.get({
      otp: { transport: ['sms'] },
      signal,
    } as CredentialRequestOptions)) as (Credential & { code?: string }) | null
    return cred?.code ?? null
  } catch {
    return null
  }
}

/** E.164 for a valid number (US 10-digit or +country code), else the raw digits. */
export function normalizePhone(raw: string): string {
  return parsePhone(raw) ?? raw.replace(/[^\d+]/g, '')
}

/** "+12175550142" -> "(217) 555-0142" for display; other formats pass through. */
export function formatPhone(e164: string): string {
  return displayPhone(e164)
}
