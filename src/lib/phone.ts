/**
 * Phone numbers are stored in E.164 ("+15551234567") and shown as
 * "(555) 123-4567" for US numbers. Accepts a US 10-digit number (any
 * punctuation), 1 + 10 digits, or a full E.164 number with a country code.
 */
export function parsePhone(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  const plus = s.startsWith('+')
  const digits = s.replace(/\D/g, '')
  if (plus) {
    if (digits.startsWith('1')) return digits.length === 11 ? `+${digits}` : null
    return digits.length >= 8 && digits.length <= 15 && digits[0] !== '0' ? `+${digits}` : null
  }
  if (digits.length === 10 && /^[2-9]/.test(digits)) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1') && /^[2-9]/.test(digits.slice(1))) return `+${digits}`
  return null
}

/** "+15551234567" -> "(555) 123-4567"; other countries keep E.164. */
export function displayPhone(phone: string | null | undefined): string {
  const e164 = parsePhone(phone) ?? (phone ?? '')
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164)
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164
}

export const PHONE_ERROR = 'Enter a 10-digit US number, or + and the country code.'

/**
 * Inline error for a phone field: empty when it's fine or still empty. While
 * the person is typing (`typing`), it waits until there are 10+ digits.
 */
export function phoneError(raw: string | null | undefined, typing = false): string {
  const s = (raw ?? '').trim()
  if (!s || parsePhone(s)) return ''
  if (typing && s.replace(/\D/g, '').length < 10) return ''
  return PHONE_ERROR
}
