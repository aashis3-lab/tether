import { useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { GuardianPicker } from '@/components/GuardianPicker'
import { NightEndsCalendar } from '@/components/NightEndsCalendar'
import { Header, Button, Chip, ErrorText, Screen, Stepper, Title, inputClass } from '@/components/ui'
import { buttonClass } from '@/components/buttons'
import { errorText } from '@/lib/toast'
import { clearDraft, updateDraft, useNightDraft } from '@/lib/nightDraft'
import { rememberDestinations } from '@/lib/places'
import { parsePhone } from '@/lib/phone'
import { profileContacts } from '@/lib/profile'
import { supabase } from '@/lib/supabase'
import { defaultEndTime, formatClock } from '@/lib/time'
import type { Contact, Session } from '@/lib/types'

/** Stepper shared by the Start a night screens. */
export function StartProgress({ step }: { step: 1 | 2 | 3 | 4 }) {
  return <Stepper steps={['Where', 'When', 'Guardian', 'Name']} current={step - 1} />
}

/** Step 2: when does the night end? */
export function StartWhen() {
  const navigate = useNavigate()
  const draft = useNightDraft()
  // Until you pick one, the end time is 9 AM the next morning.
  const [initial] = useState(() => (draft.endTimePicked ? new Date(draft.endTime) : defaultEndTime()))
  const [value, setValue] = useState(initial)
  const [valid, setValid] = useState(true)

  if (draft.destinations.length === 0) return <Navigate to="/start/where" replace />

  return (
    <Screen>
      <Header title="Start a night" back="/start/where" />
      <StartProgress step={2} />
      <Title>When does the night end?</Title>
      <p className="mb-5 mt-1 text-base text-ink-dim">Location sharing stops then, even if you forget.</p>
      <NightEndsCalendar
        value={initial}
        onChange={(d, ok) => {
          setValue(d)
          setValid(ok)
        }}
      />
      {!valid && <p className="mt-2 text-xs text-status-checkin">Pick a time in the future.</p>}
      <div className="mt-auto pt-6">
        <Button
          big
          disabled={!valid}
          onClick={() => {
            updateDraft({ endTime: value.toISOString(), endTimePicked: true })
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
      <Header title="Start a night" back="/start/when" />
      <StartProgress step={3} />
      <Title>Who's your guardian tonight?</Title>
      <p className="mb-5 mt-1 text-base text-ink-dim">A sober person at home. They only hear from us if you need help.</p>
      <GuardianPicker contacts={contacts} value={guardian} onChange={setGuardian} heading={false} />
      <div className="mt-auto pt-6">
        <Button
          big
          disabled={!guardian.name.trim() || !parsePhone(guardian.phone)}
          onClick={() => {
            updateDraft({ guardian: { name: guardian.name.trim(), phone: parsePhone(guardian.phone) ?? guardian.phone } })
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
  // What a blank name becomes; the placeholder shows exactly this.
  const defaultName = venue || `${day} night out`
  const suggestions = [...new Set([venue && `${day} at ${venue}`, venue && `${venue} night`, `${day} night out`, 'Birthday crawl'].filter(Boolean))].slice(0, 4) as string[]

  async function start() {
    if (busy || created.current || !draft.guardian) return
    setBusy(true)
    setError('')
    const finalName = name.trim() || defaultName
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
    navigate(`/session/${(data as Session).id}`, { replace: true, state: { invitePrompt: true } })
    window.setTimeout(clearDraft, 0)
  }

  return (
    <Screen>
      <Header title="Start a night" back="/start/guardian" />
      <StartProgress step={4} />
      <Title>Name your party</Title>
      <p className="mb-5 mt-1 text-base text-ink-dim">Optional. Friends see it when they join.</p>
      <input
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          updateDraft({ name: e.target.value })
        }}
        placeholder={defaultName}
        maxLength={40}
        className={`${inputClass} text-xl`}
        autoFocus
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <Chip
            key={s}
            selected={name === s}
            onClick={() => {
              setName(s)
              updateDraft({ name: s })
            }}
          >
            {s}
          </Chip>
        ))}
      </div>
      <div className="mt-3">
        <ErrorText>{error}</ErrorText>
      </div>
      <div className="mt-auto pt-6">
        <button
          disabled={busy}
          onClick={start}
          className={buttonClass('primary', true)}
        >
          {busy ? 'Starting the party...' : 'Start the party'}
        </button>
        {!name.trim() && <p className="mt-2 text-center text-xs text-ink-dim">Leave it blank to call it "{defaultName}".</p>}
      </div>
    </Screen>
  )
}
