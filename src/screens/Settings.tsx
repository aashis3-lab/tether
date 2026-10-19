import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { AUTH_MODE, formatPhone } from '@/auth/phoneAuth'
import { AvatarPicker } from '@/components/AvatarPicker'
import { BackTapSteps } from '@/components/BackTapSteps'
import { GuardianSheet } from '@/components/GuardianSheet'
import { Avatar } from '@/components/Avatar'
import {
  BellIcon,
  BluetoothIcon,
  CarIcon,
  ChatIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  HandIcon,
  HomeIcon,
  MoonIcon,
  PhoneIcon,
  PlusIcon,
  ShieldIcon,
  SunIcon,
  UserIcon,
  XIcon,
} from '@/components/icons'
import { KeychainCard } from '@/components/KeychainCard'
import { PermissionsCard } from '@/components/PermissionsCard'
import { SmsCard } from '@/components/SmsCard'
import { BottomNav } from '@/components/BottomNav'
import { Header, Button, ErrorText, Field, Screen, Segmented, Sheet } from '@/components/ui'
import { useActiveSessionId } from '@/hooks/useSession'
import { geocode, getCurrentPosition } from '@/lib/geo'
import { pairedKeychain, keychainSupported } from '@/lib/keychain'
import { profileContacts } from '@/lib/profile'
import { displayPhone, parsePhone, phoneError } from '@/lib/phone'
import { supabase } from '@/lib/supabase'
import { attempt } from '@/lib/toast'
import { getRideApp, setRideApp, type RideApp } from '@/lib/ridePref'
import { useTheme, type ThemePref } from '@/lib/theme'
import type { Contact, Member, Profile } from '@/lib/types'

type Edit =
  | null
  | 'photo'
  | 'phone'
  | 'contacts'
  | 'guardian'
  | 'home'
  | 'medical'
  | 'keychain'
  | 'backtap'
  | 'leftalone'
  | 'sms'
  | 'ride'
  | 'theme'
  | 'permissions'


/**
 * iPhone Settings-style: grouped rows with an icon, a label and the current
 * value; each row opens a detail sheet that carries the explanation.
 */
export function Settings() {
  const { userId, profile, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const { sessionId } = useActiveSessionId(userId)
  const [me, setMe] = useState<Member | null>(null)
  const { pref: themePref } = useTheme()
  const [rideApp, setRideAppState] = useState<RideApp>(getRideApp)
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

  const guardianValue = me?.guardian_name ? `${me.guardian_name} tonight` : 'Asked each night'
  const keychainName = pairedKeychain()
  const themeLabel = { light: 'Light', dark: 'Dark', system: 'System' }[themePref]

  return (
    <Screen className="pb-28">
      <Header title="Settings" back={sessionId ? true : undefined} />

      {/* Apple ID-style account row */}
      <button
        onClick={() => setEdit('photo')}
        className="flex w-full items-center gap-4 rounded-2xl bg-surface-lowest p-4 text-left dark:bg-surface-mid"
      >
        <Avatar name={profile.name} url={profile.avatar_url} size={56} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xl font-semibold">{profile.name}</span>
          <span className="block text-xs text-ink-dim">{formatPhone(profile.phone)} · Photo and name</span>
        </span>
        <ChevronRightIcon width={18} height={18} className="shrink-0 text-ink-faint" />
      </button>

      <Group title="Safety">
        <Row icon={<PhoneIcon width={18} height={18} />} tint="bg-danger" label="Emergency contact" value={contacts[0]?.name ?? 'Not set'} onClick={() => setEdit('contacts')} />
        <Row icon={<ShieldIcon width={18} height={18} />} tint="bg-primary" label="Guardian" value={guardianValue} onClick={() => setEdit('guardian')} />
        <Row icon={<HomeIcon width={18} height={18} />} tint="bg-secondary" label="Home" value={profile.home_address ?? 'Not set'} onClick={() => setEdit('home')} />
        <Row icon={<HeartIcon />} tint="bg-danger" label="Medical info" value={profile.medical_info || 'None'} onClick={() => setEdit('medical')} />
      </Group>

      <Group title="Account">
        <Row icon={<UserIcon width={18} height={18} />} tint="bg-[#1a73e8]" label="Phone" value={formatPhone(profile.phone)} onClick={() => setEdit('phone')} />
        <Row icon={<UserIcon width={18} height={18} />} tint="bg-[#1a73e8]" label="Photo" value={profile.avatar_url ? 'Set' : 'Add'} onClick={() => setEdit('photo')} />
      </Group>

      <Group title="Devices">
        {keychainSupported() && (
          <Row icon={<BluetoothIcon width={18} height={18} />} tint="bg-[#1a73e8]" label="Keychain" value={keychainName ?? 'Not paired'} onClick={() => setEdit('keychain')} />
        )}
        <Row icon={<HandIcon width={18} height={18} />} tint="bg-outline" label="Back Tap" value="iPhone" onClick={() => setEdit('backtap')} />
      </Group>

      <Group title="Alerts">
        <Row icon={<BellIcon width={18} height={18} />} tint="bg-secondary" label="Left-alone alerts" value="On" onClick={() => setEdit('leftalone')} />
        <Row icon={<ChatIcon width={18} height={18} />} tint="bg-safe" label="Test text" value="Guardian" onClick={() => setEdit('sms')} />
      </Group>

      <Group title="App">
        <Row icon={<CarIcon width={18} height={18} />} tint="bg-[#1a73e8]" label="Ride app" value={rideApp === 'lyft' ? 'Lyft' : 'Uber'} onClick={() => setEdit('ride')} />
        <Row icon={themePref === 'dark' ? <MoonIcon width={18} height={18} /> : <SunIcon width={18} height={18} />} tint="bg-primary" label="Theme" value={themeLabel} onClick={() => setEdit('theme')} />
        <Row icon={<CheckCircleIcon width={18} height={18} />} tint="bg-outline" label="Permissions" value="Location, alerts" onClick={() => setEdit('permissions')} />
      </Group>

      <Button
        variant="text"
        className="mt-4 !text-status-alert"
        onClick={async () => {
          await signOut()
          navigate('/signup', { replace: true })
        }}
      >
        Sign out
      </Button>

      {/* Detail pages: the explanations live here, not under every row. */}
      <Sheet open={edit === 'photo'} onClose={() => setEdit(null)} title="Photo">
        <p className="mb-4 text-base text-ink-dim">Friends see this on the map and in the party list.</p>
        <AvatarPicker userId={userId} name={profile.name} url={profile.avatar_url ?? null} onChange={(url) => save({ avatar_url: url })} />
      </Sheet>

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
                supabase.from('session_members').update({ guardian_name: g.name, guardian_phone: parsePhone(g.phone) ?? g.phone }).eq('id', me.id)
              )
              if (ok) setEdit(null)
            }}
          />
        ) : (
          <Sheet open onClose={() => setEdit(null)} title="Guardian">
            <p className="text-base text-ink-dim">
              Your guardian is the sober person at home who receives escalations. Tether asks who it is each time you
              start or join a party, and suggests {contacts[0]?.name ?? 'your emergency contact'} first.
            </p>
          </Sheet>
        ))}

      {edit === 'home' && <HomeSheet profile={profile} onClose={() => setEdit(null)} onSave={save} />}

      {edit === 'medical' && <MedicalSheet profile={profile} onClose={() => setEdit(null)} onSave={save} />}

      <Sheet open={edit === 'keychain'} onClose={() => setEdit(null)} title="Safety keychain">
        <p className="mb-3 text-base text-ink-dim">A Bluetooth button that can send a Find me without unlocking your phone.</p>
        <KeychainCard />
      </Sheet>

      <Sheet open={edit === 'backtap'} onClose={() => setEdit(null)} title="iPhone Back Tap">
        <p className="mb-3 text-base text-ink-dim">Accessibility → Touch → Back Tap. Assign a shortcut and test it first.</p>
        <BackTapSteps />
      </Sheet>

      <Sheet open={edit === 'leftalone'} onClose={() => setEdit(null)} title="Left-alone alerts">
        <p className="text-base text-ink-dim">
          After you leave a venue with no group member nearby, Tether checks in with you after a 2-minute buffer. It stays
          quiet if you leave with friends. Alerts keep going until a friend taps “I'm on it”. This is always on during a
          party.
        </p>
      </Sheet>

      <Sheet open={edit === 'sms'} onClose={() => setEdit(null)} title="Test text">
        <SmsCard />
      </Sheet>

      <Sheet open={edit === 'ride'} onClose={() => setEdit(null)} title="Ride app">
        <RideAppCard onChange={setRideAppState} />
      </Sheet>

      <Sheet open={edit === 'theme'} onClose={() => setEdit(null)} title="Theme">
        <ThemeCard />
      </Sheet>

      <Sheet open={edit === 'permissions'} onClose={() => setEdit(null)} title="Permissions">
        <p className="mb-3 text-base text-ink-dim">Tether needs location to share where you are, and notifications for alerts.</p>
        <PermissionsCard />
      </Sheet>
      <BottomNav />
    </Screen>
  )
}

/** iPhone Settings-style group: small gray title, rounded block of rows. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="px-4 pb-1.5 pt-5 text-xs font-medium uppercase tracking-wider text-ink-dim">{title}</h2>
      <div className="divide-y divide-line/70 overflow-hidden rounded-2xl bg-surface-lowest dark:bg-surface-mid">{children}</div>
    </section>
  )
}

/** Icon, label, current value right-aligned in gray, chevron. */
function Row({
  icon,
  tint,
  label,
  value,
  onClick,
}: {
  icon: ReactNode
  tint: string
  label: string
  value: string
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="flex min-h-[48px] w-full items-center gap-3 px-3 text-left transition-colors hover:bg-ink/[0.04]">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white ${tint}`}>{icon}</span>
      <span className="shrink-0 text-lg">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right text-base text-ink-dim">{value}</span>
      <ChevronRightIcon width={16} height={16} className="shrink-0 text-ink-faint" />
    </button>
  )
}

function HeartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
    </svg>
  )
}

/** Light / dark / follow the phone (this device only). */
function ThemeCard() {
  const { pref, setPref } = useTheme()
  return (
    <div className="rounded-2xl bg-surface-lowest p-4 dark:bg-surface-mid">
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
  // Index of the phone field being typed in (its error waits for blur).
  const [typing, setTyping] = useState<number | null>(null)
  const [list, setList] = useState<Contact[]>(() => {
    const c = profileContacts(profile).map((x) => ({ ...x, phone: displayPhone(x.phone) }))
    return c.length ? c : [{ name: '', phone: '' }]
  })
  const { busy, error, run } = useSaver(onSave)
  const set = (i: number, p: Partial<Contact>) => setList((l) => l.map((c, j) => (j === i ? { ...c, ...p } : c)))
  const ok =
    list[0].name.trim() && parsePhone(list[0].phone) && list.every((c) => !c.phone.trim() || parsePhone(c.phone))

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
              onFocus={() => setTyping(i)}
              onBlur={() => {
                setTyping(null)
                const e164 = parsePhone(c.phone)
                if (e164) set(i, { phone: displayPhone(e164) })
              }}
              aria-invalid={Boolean(phoneError(c.phone, typing === i))}
              className="block h-11 w-full border-t border-line bg-transparent text-lg placeholder:text-ink-faint focus:outline-none"
            />
            {phoneError(c.phone, typing === i) && <p className="pb-1 text-xs text-status-alert">{phoneError(c.phone, typing === i)}</p>}
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
          const [first, ...rest] = list.map((c) => ({ name: c.name.trim(), phone: parsePhone(c.phone) ?? '' }))
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
function RideAppCard({ onChange }: { onChange?: (a: RideApp) => void }) {
  const [app, setApp] = useState<RideApp>(getRideApp)
  const pick = (a: RideApp) => {
    setRideApp(a)
    setApp(a)
    onChange?.(a)
  }
  return (
    <div className="rounded-2xl bg-surface-lowest p-4 dark:bg-surface-mid">
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
