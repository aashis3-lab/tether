import type { Contact, Profile } from './types'

/** Primary emergency contact first, then any extras. */
export function profileContacts(profile: Profile | null): Contact[] {
  if (!profile) return []
  const primary =
    profile.emergency_contact_name && profile.emergency_contact_phone
      ? [{ name: profile.emergency_contact_name, phone: profile.emergency_contact_phone }]
      : []
  return [...primary, ...(profile.additional_emergency_contacts ?? [])]
}
