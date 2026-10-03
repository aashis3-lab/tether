import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Alert, CheckIn, Member, Pin, Session } from '@/lib/types'

/** The caller's current active session id, or null. undefined while loading. */
export function useActiveSessionId(userId: string | null) {
  const [sessionId, setSessionId] = useState<string | null | undefined>(undefined)

  const reload = useCallback(async () => {
    if (!userId) {
      setSessionId(null)
      return
    }
    const { data } = await supabase
      .from('session_members')
      .select('session_id, sessions!inner(status, created_at)')
      .eq('user_id', userId)
      .eq('sessions.status', 'active')
      // "End my night" marks you home; don't pull you back into the session.
      .neq('status', 'home')
      .order('created_at', { ascending: false })
      .limit(1)
    setSessionId(data?.[0]?.session_id ?? null)
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { sessionId, reload }
}

export interface LiveSession {
  loading: boolean
  error: string | null
  session: Session | null
  members: Member[]
  pins: Pin[]
  /** Unresolved alerts only. */
  alerts: Alert[]
  /** Unanswered check-ins only. */
  checkIns: CheckIn[]
}

/**
 * Loads a session with its members and pins, then keeps members (and the
 * session's status) live via Supabase Realtime postgres_changes.
 */
export function useLiveSession(sessionId: string | undefined): LiveSession {
  const [state, setState] = useState<LiveSession>({
    loading: true,
    error: null,
    session: null,
    members: [],
    pins: [],
    alerts: [],
    checkIns: [],
  })

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false

    async function load() {
      const [s, m, p, a, c] = await Promise.all([
        supabase.from('sessions').select('*').eq('id', sessionId).maybeSingle(),
        supabase.from('session_members').select('*').eq('session_id', sessionId).order('created_at'),
        supabase.from('pins').select('*').eq('session_id', sessionId).order('created_at'),
        supabase.from('alerts').select('*').eq('session_id', sessionId).eq('resolved', false).order('created_at'),
        supabase.from('check_ins').select('*').eq('session_id', sessionId).is('responded_at', null).order('created_at'),
      ])
      if (cancelled) return
      const error = s.error?.message ?? m.error?.message ?? p.error?.message ?? a.error?.message ?? null
      setState({
        loading: false,
        error: error ?? (s.data ? null : "This party doesn't exist or you're not in it."),
        session: s.data as Session | null,
        members: (m.data ?? []) as Member[],
        pins: (p.data ?? []) as Pin[],
        alerts: (a.data ?? []) as Alert[],
        checkIns: (c.data ?? []) as CheckIn[],
      })
    }

    void load()

    const channel = supabase
      .channel(`session:${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_members', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setState((prev) => {
            if (payload.eventType === 'DELETE') {
              const oldId = (payload.old as { id?: string }).id
              return { ...prev, members: prev.members.filter((x) => x.id !== oldId) }
            }
            const row = payload.new as Member
            const exists = prev.members.some((x) => x.id === row.id)
            return {
              ...prev,
              members: exists ? prev.members.map((x) => (x.id === row.id ? row : x)) : [...prev.members, row],
            }
          })
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'alerts', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setState((prev) => {
            const row = payload.new as Alert
            const rest = prev.alerts.filter((x) => x.id !== (row?.id ?? (payload.old as { id?: string }).id))
            if (payload.eventType === 'DELETE' || row.resolved) return { ...prev, alerts: rest }
            return { ...prev, alerts: [...rest, row].sort((x, y) => x.created_at.localeCompare(y.created_at)) }
          })
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'check_ins', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setState((prev) => {
            const row = payload.new as CheckIn
            const rest = prev.checkIns.filter((x) => x.id !== (row?.id ?? (payload.old as { id?: string }).id))
            if (payload.eventType === 'DELETE' || row.responded_at) return { ...prev, checkIns: rest }
            return { ...prev, checkIns: [...rest, row] }
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        (payload) => setState((prev) => ({ ...prev, session: payload.new as Session }))
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pins', filter: `session_id=eq.${sessionId}` },
        () => {
          // Pins change rarely; just refetch.
          void supabase
            .from('pins')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at')
            .then(({ data }) => !cancelled && setState((prev) => ({ ...prev, pins: (data ?? []) as Pin[] })))
        }
      )
      .subscribe((status) => {
        // Catch up on anything missed while (re)connecting.
        if (status === 'SUBSCRIBED') void load()
      })

    // Phones drop websockets in the background. Reload on return to the
    // foreground and refresh every 20 s, so a missed live update (someone
    // joining, a status change) is never missing for long.
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    const poll = window.setInterval(() => document.visibilityState === 'visible' && void load(), 20_000)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
      window.clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [sessionId])

  return state
}
