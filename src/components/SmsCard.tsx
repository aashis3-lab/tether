import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { errorText } from '@/lib/toast'
import { buttonClass } from './buttons'

interface SmsRow {
  id: string
  to_name: string | null
  to_phone: string
  body: string
  status: 'pending' | 'sending' | 'sent' | 'failed'
  error: string | null
  created_at: string
}

// Server-side failure reasons are written for people ("Mom isn't on Tether
// yet"); only unexpected client errors stay developer-only.
const devError = (raw: string) => (import.meta.env.DEV ? raw : 'Sending failed. Try again.')

const POLL_MS = 1500
const POLL_FOR_MS = 20_000

/**
 * Settings -> Guardian alerts: "Send test alert" to your guardian (a Tether
 * notification), and the latest ones about you with their real result or
 * failure reason.
 */
export function SmsCard() {
  const [rows, setRows] = useState<SmsRow[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('sms_outbox')
      .select('id, to_name, to_phone, body, status, error, created_at')
      .order('created_at', { ascending: false })
      .limit(5)
    setRows((data ?? []) as SmsRow[])
    return (data ?? []) as SmsRow[]
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function sendTest() {
    setBusy(true)
    setNote({ kind: 'info', text: 'Sending...' })
    const { data: id, error } = await supabase.rpc('queue_test_sms')
    if (error) {
      setBusy(false)
      setNote({ kind: 'error', text: devError(errorText(error)) })
      return
    }
    // Ask the server to send it now, then watch the real result.
    const { error: fnErr } = await supabase.functions.invoke('evaluate-session', { body: { outbox: true } })
    if (fnErr) {
      setNote({ kind: 'error', text: devError(`Queued, but the sender isn't reachable (deploy evaluate-session): ${errorText(fnErr)}`) })
    }
    const until = Date.now() + POLL_FOR_MS
    while (Date.now() < until) {
      const list = await load()
      const row = list.find((r) => r.id === id)
      if (row?.status === 'sent') {
        setNote({ kind: 'ok', text: `Sent to ${row.to_name ?? row.to_phone}.` })
        break
      }
      if (row?.status === 'failed') {
        setNote({ kind: 'error', text: row.error ?? 'Send failed.' })
        break
      }
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
    setBusy(false)
    setNote((n) => (n?.kind === 'info' ? { kind: 'error', text: 'Still waiting on the sender. Check the list below in a minute.' } : n))
  }

  return (
    <div className="mt-5 rounded-xl2 bg-bg-card p-4">
      <p className="text-sm font-bold uppercase tracking-wide text-accent-orange">Guardian alerts</p>
      <p className="mt-1 text-base text-ink-dim">Your guardian gets a Tether notification when you press HELP, when an alert reaches them, and when everyone is home.</p>
      <button
        onClick={sendTest}
        disabled={busy}
        className={`mt-3 ${buttonClass('primary')}`}
      >
        {busy ? 'Sending...' : 'Send test alert'}
      </button>
      {note && (
        <p
          className={`mt-2 text-sm font-semibold ${
            note.kind === 'ok' ? 'text-status-calm' : note.kind === 'error' ? 'text-status-alert' : 'text-ink-dim'
          }`}
        >
          {note.text}
        </p>
      )}
      {rows.length > 0 && (
        <ul className="mt-3 divide-y divide-white/5">
          {rows.map((r) => (
            <li key={r.id} className="py-2 text-sm">
              <p className="flex justify-between gap-2">
                <span className="truncate font-semibold">To {r.to_name ?? r.to_phone}</span>
                <span
                  className={
                    r.status === 'sent' ? 'text-status-calm' : r.status === 'failed' ? 'text-status-alert' : 'text-status-checkin'
                  }
                >
                  {r.status === 'sent' ? 'Sent' : r.status === 'failed' ? 'Failed' : 'Sending'}
                </span>
              </p>
              <p className="truncate text-ink-dim">{r.body}</p>
              {r.status === 'failed' && <p className="text-status-alert">{r.error ?? 'Send failed.'}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
