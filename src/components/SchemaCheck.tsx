import { useEffect, useState } from 'react'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Startup check: is every migration applied? Probes columns / functions with
 * a separate signed-out client (so nothing is ever created) and, if anything
 * is missing, blocks the app with exactly which migration file(s) to run.
 */
interface Probe {
  migration: string
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (db: SupabaseClient<any>) => PromiseLike<{ error: { code?: string; message?: string } | null }>
}

const MISSING = new Set(['42703', '42P01', 'PGRST202', 'PGRST204', 'PGRST205'])

const PROBES: Probe[] = [
  { migration: '20260101000000_init.sql', label: 'base tables', run: (db) => db.from('session_members').select('id').limit(0) },
  { migration: '20260102000000_sessions_rpc.sql', label: 'join_session', run: (db) => db.rpc('join_session', { p_join_code: '', p_guardian_name: '', p_guardian_phone: '' }) },
  { migration: '20260103000000_escalation.sql', label: 'raise_alert', run: (db) => db.rpc('raise_alert', { p_member_id: '00000000-0000-0000-0000-000000000000' }) },
  { migration: '20260104000000_extra_emergency_contacts.sql', label: 'profiles.additional_emergency_contacts', run: (db) => db.from('profiles').select('additional_emergency_contacts').limit(0) },
  { migration: '20260105000000_automatic_rules.sql', label: 'session_members.rule_state', run: (db) => db.from('session_members').select('rule_state').limit(0) },
  { migration: '20260106000000_design_refresh.sql', label: '_normalize_code', run: (db) => db.rpc('_normalize_code', { p: 'x' }) },
  { migration: '20260107000000_avatars.sql', label: 'profiles.avatar_url', run: (db) => db.from('profiles').select('avatar_url').limit(0) },
  { migration: '20260108000000_history_and_activities.sql', label: 'session_members.activity', run: (db) => db.from('session_members').select('activity,activity_until').limit(0) },
  { migration: '20260109000000_sms_names_cleanup.sql', label: 'sessions.name / sms_outbox', run: (db) => db.from('sms_outbox').select('id').limit(0) },
  { migration: '20260109000000_sms_names_cleanup.sql', label: 'pins.kind', run: (db) => db.from('pins').select('kind').limit(0) },
  {
    migration: '20260109000000_sms_names_cleanup.sql',
    label: 'help_pressed',
    run: (db) => db.rpc('help_pressed', { p_member_id: '00000000-0000-0000-0000-000000000000', p_base_url: '' }),
  },
]

export function SchemaCheck() {
  const [missing, setMissing] = useState<string[]>([])

  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (!url || !key) return
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'tether-schema-probe' } })
    void Promise.all(
      PROBES.map(async (p) => {
        try {
          const { error } = await p.run(db)
          return error && MISSING.has(error.code ?? '') ? p : null
        } catch {
          return null // network trouble is not a schema problem
        }
      })
    ).then((r) => {
      const files = [...new Set(r.filter(Boolean).map((p) => p!.migration))].sort()
      setMissing(files)
      if (files.length) console.error('[tether] missing migrations:', files)
    })
  }, [])

  if (missing.length === 0) return null
  return (
    <div className="fixed inset-0 z-[6000] flex justify-center bg-bg/95 backdrop-blur">
      <div className="flex w-full max-w-app flex-col justify-center px-6">
        <p className="text-sm font-bold uppercase tracking-wide text-status-checkin">Database out of date</p>
        <h1 className="mt-2 text-3xl font-bold">Run {missing.length === 1 ? 'this migration' : 'these migrations'}</h1>
        <p className="mt-2 text-ink-dim">
          Supabase dashboard, SQL Editor: paste each file from <span className="font-mono">supabase/migrations/</span> and run
          it, in this order. Then reload.
        </p>
        <ol className="mt-4 flex list-decimal flex-col gap-2 rounded-2xl bg-bg-card py-4 pl-10 pr-4 font-mono text-sm">
          {missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ol>
        <button onClick={() => window.location.reload()} className="mt-6 min-h-tap rounded-2xl bg-accent-pink text-lg font-bold text-white">
          I ran it, reload
        </button>
      </div>
    </div>
  )
}
