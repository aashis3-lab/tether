import { supabase } from '@/lib/supabase'

/**
 * Signs in with just a phone number, no SMS code: a Supabase anonymous
 * session with the phone on the account (needs "Allow anonymous sign-ins"
 * in the dashboard). The phone is stored on the profile and is how a
 * guardian's alerts find their Tether account.
 */
export async function signInWithPhone(phone: string) {
  const { data: existing } = await supabase.auth.getSession()
  // Same number as the account already signed in on this browser -> keep it.
  // A different number is a different person: sign the old one out first,
  // otherwise they'd silently share one account.
  if (existing.session) {
    if (existing.session.user.user_metadata?.phone === phone) return
    await supabase.auth.signOut()
  }
  const { error } = await supabase.auth.signInAnonymously({ options: { data: { phone } } })
  if (error) throw new Error(friendlyAuthError(error.message))
}

/** Turns Supabase errors into something a person can act on. */
function friendlyAuthError(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('anonymous')) return "Sign-in isn't set up on the server yet (Supabase → Auth → Allow anonymous sign-ins)."
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many tries. Wait a minute and try again.'
  return msg
}

/** Light normalization to E.164 assuming US numbers when no country code. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) return digits
  if (digits.length === 10) return '+1' + digits
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits
  return '+' + digits
}

/** "+12175550142" -> "+1 (217) 555-0142" for display; other formats pass through. */
export function formatPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164)
  return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : e164
}
