import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { AUTH_MODE, formatPhone } from '@/auth/phoneAuth'
import { AvatarPicker } from '@/components/AvatarPicker'
import { BackTapSteps } from '@/components/BackTapSteps'
import { GuardianSheet } from '@/components/GuardianSheet'
import { BellIcon, ChevronRightIcon, HandIcon, HomeIcon, MoonIcon, PhoneIcon, PlusIcon, ShieldIcon, SunIcon, UserIcon, XIcon } from '@/components/icons'
import { KeychainCard } from '@/components/KeychainCard'
import { PermissionsCard } from '@/components/PermissionsCard'
import { SmsCard } from '@/components/SmsCard'
import { Header, Button, ErrorText, Field, ListSection, Screen, Segmented, Sheet } from '@/components/ui'
import { useActiveSessionId } from '@/hooks/useSession'
import { geocode, getCurrentPosition } from '@/lib/geo'
import { profileContacts } from '@/lib/profile'
import { supabase } from '@/lib/supabase'
import { attempt } from '@/lib/toast'
import { getRideApp, setRideApp, type RideApp } from '@/lib/ridePref'
import { useTheme, type ThemePref } from '@/lib/theme'
import type { Contact, Member, Profile } from '@/lib/types'

type Edit = null | 'phone' | 'contacts' | 'guardian' | 'home' | 'medical' | 'backtap'


/** Settings in grouped sections; each row opens an edit sheet. */
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

      {/* Profile header */}
      <div className="flex items-center gap-4 rounded-2xl bg-surface-lowest p-4 dark:bg-surface-mid">
        <AvatarPicker
          userId={userId}
          name={profile.name}
          url={profile.avatar_url ?? null}
          onChange={(url) => save({ avatar_url: url })}
        />
      </div>

      <ListSection title="Safety">
        <Row
          icon={<PhoneIcon width={20} height={20} />}
          title="Emergency contact"
          detail={
            contacts.length ? `${contacts[0].name}${contacts.length > 1 ? ` · +${contacts.length - 1} more` : ''}` : 'Not set'
          }
          description="Gets a text if you press HELP"
          onClick={() => setEdit('contacts')}
        />
        <Row
          icon={<ShieldIcon width={20} height={20} />}
          title="Personal guardian"
          detail={
            me?.guardian_name
              ? `${me.guardian_name} · home tonight`
              : `Asked each night${contacts[0] ? ` · defaults to ${contacts[0].name}` : ''}`
          }
          description="The sober person at home who receives escalations"
          onClick={() => setEdit('guardian')}
        />
        <Row
          icon={<HomeIcon width={20} height={20} />}
          title="Home"
          detail={profile.home_address ?? 'Not set'}
          description="Used for Get me home and arrival checks"
          onClick={() => setEdit('home')}
        />
        <Row
          icon={<HeartIcon />}
          title="Medical info"
          detail={profile.medical_info || 'None'}
          description="Only shown on your safety card and the emergency screen"
          onClick={() => setEdit('medical')}
        />
      </ListSection>

      <ListSection title="Account">
        <Row
          icon={<UserIcon width={20} height={20} />}
          title="Phone"
          detail={formatPhone(profile.phone)}
          description="The number you sign in with"
          onClick={() => setEdit('phone')}
        />
      </ListSection>

      <section>
        <h2 className="section-title">Alerts and devices</h2>
        <KeychainCard />
        <div className="mt-2 divide-y divide-line/70 overflow-hidden rounded-2xl bg-surface-lowest dark:bg-surface-mid">
          <Row
            icon={<HandIcon width={20} height={20} />}
            title="iPhone Back Tap"
            detail="Accessibility → Touch → Back Tap"
            description="Assign a shortcut and test it first"
            onClick={() => setEdit('backtap')}
          />
          <div className="flex gap-4 px-4 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary-container/70 text-secondary-on-container">
              <BellIcon width={20} height={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg">Left-alone alerts</span>
              <span className="mt-0.5 block text-xs text-ink-dim">
                A reminder after you leave a venue with no group member nearby, with a 2-minute buffer. Quiet if you leave
                with friends. Alerts stay on until a friend taps “I'm on it”.
              </span>
            </span>
          </div>
        </div>
      </section>

      <section>
        <h2 className="section-title">Text messages</h2>
        <SmsCard />
      </section>

      <section>
        <h2 className="section-title">Going home</h2>
        <RideAppCard />
      </section>

      <section>
        <h2 className="section-title">Appearance</h2>
        <ThemeCard />
      </section>

      <section>
        <h2 className="section-title">Permissions</h2>
        <PermissionsCard />
      </section>

      <Button
        variant="text"
        className="mt-4"
        onClick={async () => {
          await signOut()
          navigate('/signup', { replace: true })
        }}
      >
        Sign out
      </Button>

      {/* Edit sheets */}
      <Sheet open={edit === 'phone'} onClose={() => setEdit(null)} title="Phone">
        <p className="text-2xl">{formatPhone(profile.phone)}</p>
        <p className="mt-2 text-base text-ink-dim">
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
            <p className="text-base text-ink-dim">
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

/** Google Settings-style row: icon, title, current value, a description, chevron. */
function Row({
  icon,
  title,
  detail,
  description,
  onClick,
}: {
  icon: ReactNode
  title: string
  detail: ReactNode
  description?: string
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="flex min-h-[64px] w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-ink/[0.04]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary-container/70 text-secondary-on-container">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg">{title}</span>
        <span className="block truncate text-base text-ink-dim">{detail}</span>
        {description && <span className="mt-0.5 block text-xs text-ink-faint">{description}</span>}
      </span>
      <ChevronRightIcon width={18} height={18} className="shrink-0 text-ink-faint" />
    </button>
  )
}

function HeartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
    </svg>
  )
}

/** Light / dark / follow the phone (this device only). */
function ThemeCard() {
  const { pref, setPref } = useTheme()
  return (
    <div className="rounded-2xl bg-surface-lowest p-4 dark:bg-surface-mid">
      <p className="text-lg">Theme</p>
      <p className="mb-3 text-xs text-ink-dim">Saved on this device. System follows your phone's setting.</p>
      <Segmented<ThemePref>
        value={pref}
        onChange={setPref}
        options={[
          { value: 'light', label: 'Light', icon: <SunIcon width={16} height={16} /> },
          { value: 'dark', label: 'Dark', icon: <MoonIcon width={16} height={16} /> },
          { value: 'system', label: 'System' },
        ]}
      />
    </div>
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
          <div key={i} className="rounded-xl border border-outline px-4 pb-2 pt-3 focus-within:border-primary">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-ink-dim">Emergency contact{i > 0 ? ` ${i + 1}` : ''}</p>
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
              className="block h-11 w-full bg-transparent text-lg placeholder:text-ink-faint focus:outline-none"
            />
            <input
              placeholder="Phone"
              type="tel"
              value={c.phone}
              onChange={(e) => set(i, { phone: e.target.value })}
              className="block h-11 w-full border-t border-line bg-transparent text-lg placeholder:text-ink-faint focus:outline-none"
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-2 flex min-h-[44px] items-center gap-2 rounded-full px-2 text-sm font-medium text-primary-ink"
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
      <button onClick={useHere} disabled={locating} className="mt-1 min-h-[44px] rounded-full px-1 text-sm font-medium text-primary-ink">
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

/** Which app "Get a ride" opens on the Going home screen (this device). */
function RideAppCard() {
  const [app, setApp] = useState<RideApp>(getRideApp)
  const pick = (a: RideApp) => {
    setRideApp(a)
    setApp(a)
  }
  return (
    <div className="rounded-2xl bg-surface-lowest p-4 dark:bg-surface-mid">
      <p className="text-lg">Ride app</p>
      <p className="mb-3 text-xs text-ink-dim">"Get a ride" on the Going home screen opens this app.</p>
      <Segmented<RideApp>
        value={app}
        onChange={pick}
        options={[
          { value: 'uber', label: 'Uber' },
          { value: 'lyft', label: 'Lyft' },
        ]}
      />
    </div>
  )
}
