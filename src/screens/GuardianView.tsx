import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Logo, Spinner } from '@/components/ui'
import { formatDistance } from '@/lib/geo'
import { supabase } from '@/lib/supabase'
import { formatClock } from '@/lib/time'
import type { AlertLevel } from '@/lib/types'

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

const POLL_MS = 5000

/**
 * /guardian/:token, no login. Shows the SMS that would be (or was) sent,
 * then ONE instruction with ONE call button. Polls because anonymous
 * visitors can't use RLS-gated Realtime.
 */
export function GuardianView() {
  const { token } = useParams()
  const [data, setData] = useState<GuardianData | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data: row } = await supabase.rpc('guardian_view', { p_token: token })
      if (!cancelled) setData((row as GuardianData | null) ?? null)
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
        <p className="mt-6 text-xl">This link is invalid or has expired.</p>
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

  return (
    <div className="app-shell px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <Logo />
      <p className="mt-2 text-ink-dim">Guardian view{data.guardian_name ? ` for ${data.guardian_name}` : ''}</p>

      {/* The SMS as it would arrive. */}
      <div className="mt-6">
        <p className="mb-1 text-center text-xs text-ink-faint">Text Message · {formatClock(data.created_at)}</p>
        <div className="max-w-[85%] rounded-3xl rounded-bl-md bg-bg-card px-4 py-3 text-base leading-snug">{data.message}</div>
      </div>

      <div className="flex flex-1 flex-col justify-center py-10">
        {emergency && (
          <p className="mb-3 self-start rounded-full bg-status-alert px-3 py-1 text-sm font-bold uppercase text-white">Emergency</p>
        )}
        <h1 className={`text-4xl font-extrabold leading-tight ${accent}`}>{instruction}</h1>
      </div>

      {callPhone && callName && (
        <a
          href={`tel:${callPhone}`}
          className="flex min-h-[88px] items-center justify-center rounded-3xl bg-status-calm text-2xl font-extrabold text-black active:scale-[0.98]"
        >
          📞 Call {callName}
        </a>
      )}
      {callPhone && <p className="mt-2 text-center text-ink-dim">{callPhone}</p>}
    </div>
  )
}
