import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { buttonClass } from '@/components/buttons'
import { PhoneIcon } from '@/components/icons'
import { PartyWatch } from '@/components/PartyWatch'
import { ListItem, ListSection, Logo, Spinner, StatusChip } from '@/components/ui'
import { formatDistance } from '@/lib/geo'
import { supabase } from '@/lib/supabase'
import { formatClock } from '@/lib/time'
import type { AlertLevel, Member, Pin } from '@/lib/types'

interface GuardianData {
  member_name: string
  member_phone: string | null
  guardian_name: string | null
  level: AlertLevel
  message: string | null
  created_at: string
  resolved: boolean
  claimed_by_name: string | null
  session_status: 'active' | 'ended'
  nearest: { name: string; phone: string | null; distance_m: number } | null
}

interface PartyData {
  party_name: string | null
  end_time: string
  alert_member_id: string
  members: (Pick<Member, 'id' | 'name' | 'status' | 'status_note' | 'lat' | 'lng' | 'battery_level' | 'last_updated'> & {
    avatar_url: string | null
    phone: string | null
  })[]
  pins: Pick<Pin, 'id' | 'name' | 'lat' | 'lng' | 'radius_m'>[]
}

const POLL_MS = 5000

/**
 * /guardian/:token, no login. Opens in observing mode ("Watching …": the
 * party's map and people, read-only) with the current instruction and ONE
 * call button; X shows the alert details (the SMS, who's on it). Polls
 * because anonymous visitors can't use RLS-gated Realtime.
 */
export function GuardianView() {
  const { token } = useParams()
  const [data, setData] = useState<GuardianData | null | undefined>(undefined)
  // The whole party (observing mode). Null when the migration isn't applied yet,
  // the party ended, or the link is bad; then only the instruction view shows.
  const [party, setParty] = useState<PartyData | null>(null)
  const [watching, setWatching] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const [{ data: row }, { data: p }] = await Promise.all([
        supabase.rpc('guardian_view', { p_token: token }),
        supabase.rpc('guardian_party_view', { p_token: token }),
      ])
      if (cancelled) return
      setData((row as GuardianData | null) ?? null)
      setParty((p as PartyData | null) ?? null)
    }
    void load()
    const t = window.setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [token])

  if (data === undefined) return <Spinner />
  if (data === null) {
    return (
      <div className="app-shell items-center justify-center px-6 text-center">
        <Logo />
        <p className="mt-6 text-lg">This link is invalid or has expired.</p>
      </div>
    )
  }

  const { member_name: who, nearest } = data
  const done = data.resolved || data.session_status === 'ended'

  // The single instruction + the single number to call.
  let instruction: string
  let callName: string | null = null
  let callPhone: string | null = null
  if (done) {
    instruction = `${who} is OK now. No action needed.`
  } else if (data.claimed_by_name) {
    instruction = `${data.claimed_by_name} is on it and heading to ${who}.`
    callName = who
    callPhone = data.member_phone
  } else if (nearest?.phone) {
    instruction = `Call ${nearest.name}, they're ${formatDistance(nearest.distance_m)} from ${who}.`
    callName = nearest.name
    callPhone = nearest.phone
  } else {
    instruction = `Call ${who} now.`
    callName = who
    callPhone = data.member_phone
  }

  const emergency = data.level === 'emergency' && !done
  const accent = done ? 'text-status-calm' : 'text-status-alert'

  const levelLabel = data.level === 'emergency' ? 'Emergency' : data.level === 'alert' ? 'Alert' : 'Ping'

  // Observing mode: the party, read-only, with the current instruction at the bottom.
  if (party && watching) {
    const members = party.members.map((m) => ({ ...m, session_id: '', user_id: null, guardian_name: null, guardian_phone: null, leaving_with: [], eta: null, is_simulated: false }) as Member)
    const pins = party.pins.map((p) => ({ ...p, session_id: '' }) as Pin)
    const avatars = Object.fromEntries(party.members.map((m) => [m.id, m.avatar_url]))
    const phones = Object.fromEntries(party.members.map((m) => [m.id, m.phone]))
    return (
      <PartyWatch
        partyName={party.party_name ?? `${who}'s party`}
        endTime={party.end_time}
        members={members}
        pins={pins}
        avatars={avatars}
        phones={phones}
        onExit={() => setWatching(false)}
        exitLabel="Show alert details"
        bottom={
          <>
            <div className="flex items-center gap-2">
              <StatusChip tone={done ? 'calm' : emergency ? 'alert' : 'checkin'}>{done ? 'Resolved' : levelLabel}</StatusChip>
              <span className="text-xs text-ink-dim">Guardian view · live</span>
            </div>
            <p className={`mt-2 text-xl font-bold leading-snug ${accent}`}>{instruction}</p>
            {callPhone && callName && (
              <a href={`tel:${callPhone}`} className={`mt-3 ${buttonClass('safe', true)}`}>
                <PhoneIcon width={20} height={20} strokeWidth={2} /> Call {callName}
              </a>
            )}
            <button onClick={() => setWatching(false)} className="mt-2 block w-full py-2 text-center text-sm font-semibold text-ink-dim">
              Alert details and text
            </button>
          </>
        }
      />
    )
  }

  return (
    <div className="app-shell px-4 pb-8 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="-mx-1 flex min-h-[56px] items-center gap-2">
        <Logo />
        <span className="ml-auto text-xs text-ink-dim">Guardian view{data.guardian_name ? ` · ${data.guardian_name}` : ''}</span>
      </div>

      {/* The SMS as it would arrive. */}
      <div className="mt-3">
        <p className="mb-1.5 text-center text-xs text-ink-faint">Text message · {formatClock(data.created_at)}</p>
        <div className="max-w-[85%] rounded-[20px] rounded-bl-md bg-surface-high px-4 py-3 text-base leading-snug">{data.message}</div>
      </div>

      {/* The one instruction. */}
      <div className={`mt-6 rounded-[20px] p-5 ${done ? 'bg-status-calm/10' : emergency ? 'bg-danger/10' : 'bg-primary-container/60'}`}>
        <div className="mb-2 flex items-center gap-2">
          <StatusChip tone={done ? 'calm' : emergency ? 'alert' : 'checkin'}>{done ? 'Resolved' : levelLabel}</StatusChip>
          {!done && <span className="text-xs text-ink-dim">Updates every few seconds</span>}
        </div>
        <h1 className={`text-3xl font-normal leading-tight tracking-tight ${accent}`}>{instruction}</h1>
      </div>

      <ListSection title="Details">
        <ListItem headline={who} supporting={`Sent this ${levelLabel.toLowerCase()} at ${formatClock(data.created_at)}`} />
        <ListItem
          headline={data.claimed_by_name ? `${data.claimed_by_name} is on it` : done ? 'No one needed' : 'No friend has answered yet'}
          supporting="Friends tap “I'm on it” in Tether when they head over"
        />
        {nearest && (
          <ListItem
            headline={`Nearest friend: ${nearest.name}`}
            supporting={`${formatDistance(nearest.distance_m)} from ${who}${nearest.phone ? ` · ${nearest.phone}` : ''}`}
          />
        )}
      </ListSection>

      {party && (
        <button onClick={() => setWatching(true)} className={`mt-4 ${buttonClass('secondary')}`}>
          Watch the party
        </button>
      )}

      <div className="mt-auto pt-8">
        {callPhone && callName && (
          <a
            href={`tel:${callPhone}`}
            className="flex min-h-[64px] items-center justify-center gap-3 rounded-full bg-safe text-xl font-medium text-black shadow-e1 active:scale-[0.98]"
          >
            <PhoneIcon width={22} height={22} strokeWidth={2} /> Call {callName}
          </a>
        )}
        {callPhone && <p className="mt-2 text-center text-xs text-ink-dim">{callPhone}</p>}
      </div>
    </div>
  )
}
