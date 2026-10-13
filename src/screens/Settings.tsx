import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { AUTH_MODE, formatPhone } from '@/auth/phoneAuth'
import { AvatarPicker } from '@/components/AvatarPicker'
import { BackTapSteps } from '@/components/BackTapSteps'
import { GuardianSheet } from '@/components/GuardianSheet'
import { ChevronRightIcon, PlusIcon, XIcon } from '@/components/icons'
import { KeychainCard } from '@/components/KeychainCard'
import { PermissionsCard } from '@/components/PermissionsCard'
import { SmsCard } from '@/components/SmsCard'
import { Header, Button, ErrorText, Field, Screen, Sheet, Title } from '@/components/ui'
import { useActiveSessionId } from '@/hooks/useSession'
import { geocode, getCurrentPosition } from '@/lib/geo'
import { profileContacts } from '@/lib/profile'
import { supabase } from '@/lib/supabase'
import { attempt } from '@/lib/toast'
import type { Contact, Member, Profile } from '@/lib/types'

type Edit = null | 'phone' | 'contacts' | 'guardian' | 'home' | 'medical' | 'backtap'


/** "Safety settings", rows open edit sheets; keychain pairing is a demo mock. */
export function Settings() {
  const { userId, profile, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const { sessionId } = useActiveSessionId(userId)
  const [me, setMe] = useState<Member | null>(null)
  const [params] = useSearchParams()
  // Home's quick-info cards deep-link here, e.g. /settings?edit=home.
  const [edit, setEdit] = useState<Edit>(() => {
    const e = params.get('edit')
    return e === 'home' || e === 'contacts' || e === 'medical' || e === 'guardian' ? e : null
  })

  // Tonight's guardian lives on the session membership, not the profile.
  useEffect(() => {
    if (!sessionId || !userId) {
      setMe(null)
      return
    }
    void supabase
      .from('session_members')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => setMe(data as Member | null))
  }, [sessionId, userId, edit])

  if (!userId || !profile) return null

  const contacts = profileContacts(profile)
  const save = async (patch: Partial<Profile>) => {
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
    if (error) throw error
    await refreshProfile()
    setEdit(null)
  }

  return (
    <Screen>
      <Header title="Settings" back={true} />
      <Title>Safety settings</Title>

      <div className="mt-5 rounded-xl2 bg-bg-card p-4">
        <p className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-dim">Profile picture</p>
        <AvatarPicker
          userId={userId}
          name={profile.name}
          url={profile.avatar_url ?? null}
          onChange={(url) => save({ avatar_url: url })}
        />
      </div>

      <div className="mt-5 divide-y divide-white/5 rounded-xl2 bg-bg-card">
        <Row title="Phone" detail={formatPhone(profile.phone)} onClick={() => setEdit('phone')} />
        <Row
          title="Emergency contact"
          detail={
            contacts.length ? `${contacts[0].name}${contacts.length > 1 ? ` • +${contacts.length - 1} more` : ''}` : 'Not set'
          }
          onClick={() => setEdit('contacts')}
        />
        <Row
          title="Personal guardian"
          detail={
            me?.guardian_name
              ? `${me.guardian_name} • Home tonight`
              : `Asked each night${contacts[0] ? ` • defaults to ${contacts[0].name}` : ''}`
          }
          onClick={() => setEdit('guardian')}
        />
        <Row title="Home" detail={profile.home_address ?? 'Not set'} onClick={() => setEdit('home')} />
        <Row title="Medical info" detail={profile.medical_info || 'None'} onClick={() => setEdit('medical')} />
      </div>

      <SmsCard />

      <KeychainCard />

      <div className="mt-5 rounded-xl2 bg-bg-card">
        <Row
          title="iPhone Back Tap"
          detail="Accessibility → Touch → Back Tap. Assign a shortcut and test it first."
          onClick={() => setEdit('backtap')}
        />
      </div>

      <div className="mt-5 rounded-xl2 bg-bg-card p-4">
        <p className="font-bold">Left-alone alerts</p>
        <p className="mt-2 text-ink-dim">
          You get a reminder after leaving a venue with no group member nearby, with a 2-minute buffer. If you leave with
          friends, it stays quiet. Alerts stay on until a friend taps “I'm on it”.
        </p>
      </div>

      <div className="mt-5">
        <PermissionsCard />
      </div>

      <Button
        variant="text"
        onClick={async () => {
          await signOut()
          navigate('/signup', { replace: true })
        }}
      >
        Sign out
      </Button>

      {/* Edit sheets */}
      <Sheet open={edit === 'phone'} onClose={() => setEdit(null)} title="Phone">
        <p className="text-2xl font-bold">{formatPhone(profile.phone)}</p>
        <p className="mt-2 text-ink-dim">
          This is the number you sign in with{AUTH_MODE === 'mock' ? ' (demo sign-in)' : ''}. To use a different number,
          sign out and sign in again.
        </p>
      </Sheet>

      {edit === 'contacts' && <ContactsSheet profile={profile} onClose={() => setEdit(null)} onSave={save} />}

      {edit === 'guardian' &&
        (me ? (
          <GuardianSheet
            open
            contacts={contacts}
            initial={me.guardian_name && me.guardian_phone ? { name: me.guardian_name, phone: me.guardian_phone } : null}
            confirmLabel="Save guardian for tonight"
            onClose={() => setEdit(null)}
            onConfirm={async (g: Contact) => {
              const ok = await attempt(
                "Couldn't save tonight's guardian",
                supabase.from('session_members').update({ guardian_name: g.name, guardian_phone: g.phone }).eq('id', me.id)
              )
              if (ok) setEdit(null)
            }}
          />
        ) : (
          <Sheet open onClose={() => setEdit(null)} title="Personal guardian">
            <p className="text-lg text-ink-dim">
              Your guardian is the sober person at home for a given night. Tether asks who it is each time you start or
              join a party, and suggests {contacts[0]?.name ?? 'your emergency contact'} first.
            </p>
          </Sheet>
        ))}

      {edit === 'home' && <HomeSheet profile={profile} onClose={() => setEdit(null)} onSave={save} />}

      {edit === 'medical' && <MedicalSheet profile={profile} onClose={() => setEdit(null)} onSave={save} />}

      <Sheet open={edit === 'backtap'} onClose={() => setEdit(null)} title="iPhone Back Tap">
        <BackTapSteps />
      </Sheet>
    </Screen>
  )
}

function Row({ title, detail, onClick }: { title: string; detail: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex min-h-tap w-full items-center gap-3 px-4 py-3 text-left">
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold">{title}</span>
        <span className="block truncate text-base text-ink-dim">{detail}</span>
      </span>
      <ChevronRightIcon width={20} height={20} className="shrink-0 text-ink-dim" />
    </button>
  )
}

type SaveFn = (patch: Partial<Profile>) => Promise<void>

function useSaver(onSave: SaveFn) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (patch: Partial<Profile>) => {
    setBusy(true)
    setError('')
    try {
      await onSave(patch)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, setError, run }
}

function ContactsSheet({ profile, onClose, onSave }: { profile: Profile; onClose: () => void; onSave: SaveFn }) {
  const [list, setList] = useState<Contact[]>(() => {
    const c = profileContacts(profile)
    return c.length ? c : [{ name: '', phone: '' }]
  })
  const { busy, error, run } = useSaver(onSave)
  const set = (i: number, p: Partial<Contact>) => setList((l) => l.map((c, j) => (j === i ? { ...c, ...p } : c)))
  const ok = list[0].name.trim() && list[0].phone.trim()

  return (
    <Sheet open onClose={onClose} title="Emergency contacts">
      <div className="flex flex-col gap-3">
        {list.map((c, i) => (
          <div key={i} className="rounded-xl2 border border-danger-line bg-bg-card px-4 pb-2 pt-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Emergency Contact{i > 0 ? ` ${i + 1}` : ''}</p>
              {i > 0 && (
                <button
                  aria-label="Remove contact"
                  onClick={() => setList((l) => l.filter((_, j) => j !== i))}
                  className="-mr-2 flex h-10 w-10 items-center justify-center text-ink-dim"
                >
                  <XIcon width={18} height={18} />
                </button>
              )}
            </div>
            <input
              placeholder="Name"
              value={c.name}
              onChange={(e) => set(i, { name: e.target.value })}
              className="block h-11 w-full bg-transparent placeholder:text-ink-faint focus:outline-none"
            />
            <input
              placeholder="Phone"
              type="tel"
              value={c.phone}
              onChange={(e) => set(i, { phone: e.target.value })}
              className="block h-11 w-full bg-transparent placeholder:text-ink-faint focus:outline-none"
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-2 flex min-h-[48px] items-center gap-2 font-semibold text-ink underline underline-offset-4"
        onClick={() => setList((l) => [...l, { name: '', phone: '' }])}
      >
        <PlusIcon width={18} height={18} />
        Add another emergency contact
      </button>
      <div className="mt-3">
        <ErrorText>{error}</ErrorText>
      </div>
      <Button
        className="mt-3"
        disabled={!ok || busy}
        onClick={() => {
          const [first, ...rest] = list.map((c) => ({ name: c.name.trim(), phone: c.phone.trim() }))
          void run({
            emergency_contact_name: first.name,
            emergency_contact_phone: first.phone,
            additional_emergency_contacts: rest.filter((c) => c.name && c.phone),
          })
        }}
      >
        {busy ? 'Saving…' : 'Save'}
      </Button>
    </Sheet>
  )
}

function HomeSheet({ profile, onClose, onSave }: { profile: Profile; onClose: () => void; onSave: SaveFn }) {
  const [address, setAddress] = useState(profile.home_address ?? '')
  const { busy, error, setError, run } = useSaver(onSave)
  const [locating, setLocating] = useState(false)

  async function saveAddress() {
    if (!address.trim()) return run({ home_address: null, home_lat: null, home_lng: null })
    if (address.trim() === profile.home_address && profile.home_lat != null) return run({})
    const c = await geocode(address.trim())
    if (!c) {
      setError("Couldn't find that address. Try adding the city, or use where you are.")
      return
    }
    return run({ home_address: address.trim(), home_lat: c.lat, home_lng: c.lng })
  }

  async function useHere() {
    setLocating(true)
    try {
      const p = await getCurrentPosition()
      await run({ home_address: address.trim() || 'Current location', home_lat: p.lat, home_lng: p.lng })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLocating(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title="Home">
      <Field
        label="Home address"
        hint="Stored only for your get-me-home button."
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        autoComplete="street-address"
      />
      <button onClick={useHere} disabled={locating} className="mt-1 min-h-[44px] text-sm font-semibold text-accent-pink">
        {locating ? 'Finding you…' : "I'm home right now, use this spot"}
      </button>
      <div className="mt-2">
        <ErrorText>{error}</ErrorText>
      </div>
      <Button className="mt-3" disabled={busy} onClick={() => void saveAddress()}>
        {busy ? 'Saving…' : 'Save'}
      </Button>
    </Sheet>
  )
}

function MedicalSheet({ profile, onClose, onSave }: { profile: Profile; onClose: () => void; onSave: SaveFn }) {
  const [text, setText] = useState(profile.medical_info ?? '')
  const { busy, error, run } = useSaver(onSave)
  return (
    <Sheet open onClose={onClose} title="Medical info">
      <Field
        label="Allergies, conditions, medications"
        hint="Only shown on your safety card and the emergency screen."
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Peanut allergy • EpiPen"
      />
      <div className="mt-2">
        <ErrorText>{error}</ErrorText>
      </div>
      <Button className="mt-3" disabled={busy} onClick={() => void run({ medical_info: text.trim() || null })}>
        {busy ? 'Saving…' : 'Save'}
      </Button>
    </Sheet>
  )
}
