import { useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { GuardianPicker } from '@/components/GuardianPicker'
import { NightEndsCalendar } from '@/components/NightEndsCalendar'
import { AppHeader, Button, ErrorText, Screen, Title, inputClass } from '@/components/ui'
import { errorText } from '@/lib/toast'
import { clearDraft, updateDraft, useNightDraft } from '@/lib/nightDraft'
import { rememberDestinations } from '@/lib/places'
import { profileContacts } from '@/lib/profile'
import { supabase } from '@/lib/supabase'
import { formatClock } from '@/lib/time'
import type { Contact, Session } from '@/lib/types'

/** "Step N of 4" bar shared by the Start a party screens. */
export function StartProgress({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="flex flex-1 gap-1.5">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? 'bg-accent-pink' : 'bg-white/15'}`} />
        ))}
      </div>
      <p className="text-sm font-semibold text-ink-dim">{step} of 4</p>
    </div>
  )
}

/** Step 2: when does the night end? */
export function StartWhen() {
  const navigate = useNavigate()
  const draft = useNightDraft()
  const [value, setValue] = useState(new Date(draft.endTime))
  const [valid, setValid] = useState(true)

  if (draft.destinations.length === 0) return <Navigate to="/start/where" replace />

  return (
    <Screen>
      <AppHeader back="/start/where" right={false} />
      <StartProgress step={2} />
      <Title>When does the night end?</Title>
      <p className="mb-5 mt-1 text-lg text-ink-dim">Location sharing stops then, even if you forget.</p>
      <NightEndsCalendar
        onChange={(d, ok) => {
          setValue(d)
          setValid(ok)
        }}
      />
      {!valid && <p className="mt-2 text-status-checkin">Pick a time in the future.</p>}
      <div className="mt-auto pt-6">
        <Button
          big
          disabled={!valid}
          onClick={() => {
            updateDraft({ endTime: value.toISOString() })
            navigate('/start/guardian')
          }}
        >
          Ends {value.toLocaleDateString([], { weekday: 'short' })} {formatClock(value)} · Next
        </Button>
      </div>
    </Screen>
  )
}

/** Step 3: who's your guardian tonight? */
export function StartGuardian() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const draft = useNightDraft()
  const contacts = profileContacts(profile)
  const [guardian, setGuardian] = useState<Contact>(draft.guardian ?? contacts[0] ?? { name: '', phone: '' })

  if (draft.destinations.length === 0) return <Navigate to="/start/where" replace />

  return (
    <Screen>
      <AppHeader back="/start/when" right={false} />
      <StartProgress step={3} />
      <Title>Who's your guardian tonight?</Title>
      <p className="mb-5 mt-1 text-lg text-ink-dim">A sober person at home. They only hear from us if you need help.</p>
      <GuardianPicker contacts={contacts} value={guardian} onChange={setGuardian} heading={false} />
      <div className="mt-auto pt-6">
        <Button
          big
          disabled={!guardian.name.trim() || !guardian.phone.trim()}
          onClick={() => {
            updateDraft({ guardian: { name: guardian.name.trim(), phone: guardian.phone.trim() } })
            navigate('/start/name')
          }}
        >
          Next
        </Button>
      </div>
    </Screen>
  )
}

/** Step 4: name your party (optional), then create it. */
export function StartName() {
  const navigate = useNavigate()
  const draft = useNightDraft()
  const [name, setName] = useState(draft.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Once created, never bounce back to step 1 while the draft is cleared.
  const created = useRef(false)

  if (!created.current && (draft.destinations.length === 0 || !draft.guardian)) return <Navigate to="/start/where" replace />

  const venue = draft.destinations[0]?.name ?? ''
  const day = new Date().toLocaleDateString([], { weekday: 'long' })
  const suggestions = [...new Set([venue && `${day} at ${venue}`, venue && `${venue} night`, `${day} night out`, 'Birthday crawl'].filter(Boolean))].slice(0, 4) as string[]

  async function start() {
    if (busy || created.current || !draft.guardian) return
    setBusy(true)
    setError('')
    const finalName = name.trim() || venue || null
    const { data, error: err } = await supabase.rpc('create_session', {
      p_end_time: draft.endTime,
      p_guardian_name: draft.guardian.name,
      p_guardian_phone: draft.guardian.phone,
      p_pins: draft.destinations.map((d) => ({ name: d.name, lat: d.lat, lng: d.lng, radius_m: 150, kind: d.kind ?? null })),
      p_name: finalName,
    })
    if (err || !data) {
      setBusy(false)
      setError(errorText(err) || 'Could not start the party. Try again.')
      return
    }
    created.current = true
    rememberDestinations(draft.destinations)
    // Navigate first, then clear the plan, so this screen can't redirect.
    navigate(`/session/${(data as Session).id}/invite`, { replace: true })
    window.setTimeout(clearDraft, 0)
  }

  return (
    <Screen>
      <AppHeader back="/start/guardian" right={false} />
      <StartProgress step={4} />
      <Title>Name your party</Title>
      <p className="mb-5 mt-1 text-lg text-ink-dim">Optional. Friends see it when they join.</p>
      <input
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          updateDraft({ name: e.target.value })
        }}
        placeholder={venue ? `Friday at ${venue}` : 'Friday at Red Lion'}
        maxLength={40}
        className={`${inputClass} text-xl font-semibold`}
        autoFocus
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => {
              setName(s)
              updateDraft({ name: s })
            }}
            className={`min-h-[40px] rounded-full border px-4 text-sm font-semibold transition active:scale-95 ${
              name === s ? 'border-accent-pink bg-accent-pink/15 text-accent-pink' : 'border-white/15 bg-bg-card'
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <ErrorText>{error}</ErrorText>
      </div>
      <div className="mt-auto pt-6">
        <button
          disabled={busy}
          onClick={start}
          className="min-h-[64px] w-full rounded-2xl bg-gradient-to-r from-accent-pink to-accent-orange text-xl font-bold text-white shadow-glow transition active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? 'Starting the party...' : 'Start the party'}
        </button>
        {!name.trim() && venue && <p className="mt-2 text-center text-sm text-ink-dim">Leave it blank to call it "{venue}".</p>}
      </div>
    </Screen>
  )
}
