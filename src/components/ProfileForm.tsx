import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { geocode, getCurrentPosition } from '@/lib/geo'
import type { Contact, LatLng, Profile } from '@/lib/types'
import { AvatarPicker } from './AvatarPicker'
import { PlusIcon, XIcon } from './icons'
import { Button, ErrorText, Field } from './ui'

const emptyContact: Contact = { name: '', phone: '' }

export function ProfileForm({
  userId,
  phone,
  initial,
  submitLabel,
  showMedical = false,
  onSaved,
}: {
  userId: string
  phone: string
  initial?: Profile | null
  submitLabel: string
  /** Medical info isn't on the sign-up design; it's edited from Settings. */
  showMedical?: boolean
  onSaved: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [homeAddress, setHomeAddress] = useState(initial?.home_address ?? '')
  const [home, setHome] = useState<LatLng | null>(
    initial?.home_lat != null && initial?.home_lng != null
      ? { lat: initial.home_lat, lng: initial.home_lng }
      : null
  )
  // contacts[0] is the primary emergency contact (emergency_contact_* columns);
  // the rest go in additional_emergency_contacts.
  const [contacts, setContacts] = useState<Contact[]>(() => [
    { name: initial?.emergency_contact_name ?? '', phone: initial?.emergency_contact_phone ?? '' },
    ...(initial?.additional_emergency_contacts ?? []),
  ])
  const [medical, setMedical] = useState(initial?.medical_info ?? '')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial?.avatar_url ?? null)
  const [busy, setBusy] = useState(false)
  const [locating, setLocating] = useState(false)
  const [geocodeFailed, setGeocodeFailed] = useState(false)
  const [error, setError] = useState('')
  // Asked once: no home address -> "Add it for directions home?" before saving.
  const [askedHome, setAskedHome] = useState(Boolean(initial))

  const primaryOk = contacts[0].name.trim() && contacts[0].phone.trim()
  const ready = Boolean(name.trim() && primaryOk)

  function updateContact(i: number, patch: Partial<Contact>) {
    setContacts((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  }

  async function useHere() {
    setLocating(true)
    setError('')
    try {
      setHome(await getCurrentPosition())
      setHomeAddress((a) => a || 'Current location')
      setGeocodeFailed(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLocating(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!homeAddress.trim() && !askedHome) {
      setAskedHome(true)
      return
    }
    setBusy(true)
    setError('')

    let coords = home
    if (homeAddress.trim() && !coords) {
      coords = await geocode(homeAddress.trim())
      if (!coords) {
        setBusy(false)
        setGeocodeFailed(true)
        setError("Couldn't find that address. Try adding the city.")
        return
      }
    }
    if (!homeAddress.trim()) coords = null

    const [primary, ...extra] = contacts
    const { error: err } = await supabase.from('profiles').upsert({
      id: userId,
      name: name.trim(),
      phone,
      home_address: homeAddress.trim() || null,
      home_lat: coords?.lat ?? null,
      home_lng: coords?.lng ?? null,
      emergency_contact_name: primary.name.trim() || null,
      emergency_contact_phone: primary.phone.trim() || null,
      additional_emergency_contacts: extra
        .map((c) => ({ name: c.name.trim(), phone: c.phone.trim() }))
        .filter((c) => c.name && c.phone),
      medical_info: medical.trim() || null,
      avatar_url: avatarUrl,
    })
    setBusy(false)
    if (err) setError(err.message)
    else onSaved()
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <div className="flex flex-col gap-5">
        <AvatarPicker userId={userId} name={name} url={avatarUrl} onChange={setAvatarUrl} />
        <Field label="Your Name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="given-name" />

        <div>
          <Field
            label="Home address"
            hint="Stored only for your get-me-home button."
            value={homeAddress}
            onChange={(e) => {
              setHomeAddress(e.target.value)
              setHome(null)
            }}
            autoComplete="street-address"
            id="home-address"
          />
          {askedHome && !initial && !homeAddress.trim() && (
            <div className="mt-3 rounded-xl border border-outline p-4" role="alert">
              <p className="text-lg font-medium">Add your home address?</p>
              <p className="text-base text-ink-dim">It gives you one-tap directions home. Optional.</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => document.getElementById('home-address')?.focus()} className="min-h-tap rounded-full bg-primary text-base font-medium text-primary-on">
                  Add it
                </button>
                <button type="submit" className="min-h-tap rounded-full border border-outline text-base font-medium text-primary-ink">
                  Skip
                </button>
              </div>
            </div>
          )}
          {(geocodeFailed || home) && (
            <button type="button" onClick={useHere} disabled={locating} className="mt-1 min-h-[44px] text-sm font-semibold text-primary-ink">
              {locating ? 'Finding you…' : home ? '✓ Location saved' : "Use where I am right now instead"}
            </button>
          )}
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {contacts.map((c, i) => (
          <div key={i} className="rounded-xl border border-danger-line bg-surface-high/70 px-4 pb-2 pt-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Emergency Contact{i > 0 ? ` ${i + 1}` : ''}</p>
              {i > 0 && (
                <button
                  type="button"
                  aria-label="Remove contact"
                  onClick={() => setContacts((cs) => cs.filter((_, j) => j !== i))}
                  className="-mr-2 flex h-10 w-10 items-center justify-center text-ink-dim"
                >
                  <XIcon width={18} height={18} />
                </button>
              )}
            </div>
            <input
              aria-label={`Emergency contact ${i + 1} name`}
              placeholder="Name"
              value={c.name}
              onChange={(e) => updateContact(i, { name: e.target.value })}
              required={i === 0}
              className="block h-11 w-full bg-transparent text-ink placeholder:text-ink-faint focus:outline-none"
            />
            <input
              aria-label={`Emergency contact ${i + 1} phone`}
              placeholder="Phone"
              type="tel"
              value={c.phone}
              onChange={(e) => updateContact(i, { phone: e.target.value })}
              required={i === 0}
              className="block h-11 w-full bg-transparent text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        className="mt-3 flex min-h-tap items-center gap-2 self-start rounded-full px-2 text-sm font-medium text-primary-ink"
        onClick={() => setContacts((cs) => [...cs, { ...emptyContact }])}
      >
        <PlusIcon width={18} height={18} />
        Add another emergency contact
      </button>

      {showMedical && (
        <div className="mt-8">
          <Field
            label="Medical info (optional)"
            hint="Only shown on your wallet card and to EMS."
            value={medical}
            onChange={(e) => setMedical(e.target.value)}
            placeholder="Allergies, conditions, meds"
          />
        </div>
      )}

      <div className="mt-5">
        <ErrorText>{error}</ErrorText>
      </div>

      {/* Pinned to the bottom of the screen so it's always in reach. */}
      <div className="sticky bottom-0 -mx-5 mt-auto bg-gradient-to-t from-bg via-bg to-bg/0 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
        <Button type="submit" disabled={busy || !ready}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
