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

// Raw provider errors (e.g. Twilio codes) are for developers only.
const devError = (raw: string) => (import.meta.env.DEV ? raw : 'Text failed. Try again.')

const POLL_MS = 1500
const POLL_FOR_MS = 20_000

/**
 * Settings -> Text messages: "Send test text" to your guardian, and the
 * latest texts about you with their real delivery result or failure reason.
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
        setNote({ kind: 'error', text: devError(row.error ?? 'Send failed.') })
        break
      }
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
    setBusy(false)
    setNote((n) => (n?.kind === 'info' ? { kind: 'error', text: 'Still waiting on the sender. Check the list below in a minute.' } : n))
  }

  return (
    <div className="rounded-2xl bg-surface-lowest p-4 dark:bg-surface-mid">
      <p className="text-base text-ink-dim">Your guardian gets a text when you press HELP, when an alert reaches them, and when everyone is home.</p>
      <button
        onClick={sendTest}
        disabled={busy}
        className={`mt-3 ${buttonClass('tonal')}`}
      >
        {busy ? 'Sending...' : 'Send test text'}
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
        <ul className="mt-3 divide-y divide-line/70">
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
              {r.status === 'failed' && <p className="text-status-alert">{devError(r.error ?? 'Send failed.')}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
