import { supabase } from './supabase'

/**
 * Party history. Only what survives a party's end is used: date, venue names,
 * members (name, picture), home-arrival time, and your guardian that night.
 * No locations, those are deleted when the party ends.
 */
export interface PastMember {
  id: string
  userId: string | null
  name: string
  avatar: string | null
  home: boolean
  homeAt: string | null
}

export interface PastParty {
  id: string
  /** Party name, else the first venue, else "Party". */
  name: string
  creatorId: string | null
  date: string
  endTime: string
  venues: string[]
  members: PastMember[]
  /** Latest arrival, if everyone made it home. */
  allHomeBy: string | null
  homeCount: number
  myGuardian: string | null
}

interface MemberRow {
  id: string
  session_id: string
  user_id: string | null
  name: string
  status: string
  rule_state: { home_at?: string } | null
  guardian_name: string | null
  created_at: string
}

export async function loadHistory(userId: string, limit = 30): Promise<PastParty[]> {
  // Parties I was in that have ended (RLS: I'm a member of each).
  const { data: mine } = await supabase
    .from('session_members')
    .select('session_id, guardian_name, sessions!inner(id, status, created_at, end_time, venue_names, name, creator_id)')
    .eq('user_id', userId)
    .eq('sessions.status', 'ended')
  type MineRow = {
    session_id: string
    guardian_name: string | null
    sessions: { id: string; created_at: string; end_time: string; venue_names: string[] | null; name: string | null; creator_id: string | null }
  }
  const rows = ((mine ?? []) as unknown as MineRow[])
    .sort((a, b) => b.sessions.created_at.localeCompare(a.sessions.created_at))
    .slice(0, limit)
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.session_id)
  const { data: memberData } = await supabase
    .from('session_members')
    .select('id, session_id, user_id, name, status, rule_state, guardian_name, created_at')
    .in('session_id', ids)
    .order('created_at')
  const members = (memberData ?? []) as MemberRow[]

  const userIds = [...new Set(members.map((m) => m.user_id).filter(Boolean))] as string[]
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, avatar_url').in('id', userIds)
    : { data: [] }
  const avatar = new Map(((profiles ?? []) as { id: string; avatar_url: string | null }[]).map((p) => [p.id, p.avatar_url]))

  return rows.map((r) => {
    const ms = members
      .filter((m) => m.session_id === r.session_id)
      .map<PastMember>((m) => ({
        id: m.id,
        userId: m.user_id,
        name: m.name,
        avatar: m.user_id ? avatar.get(m.user_id) ?? null : null,
        home: m.status === 'home',
        homeAt: m.rule_state?.home_at ?? null,
      }))
    const homeCount = ms.filter((m) => m.home).length
    const everyone = ms.length > 0 && homeCount === ms.length
    const latest = ms
      .map((m) => m.homeAt)
      .filter(Boolean)
      .sort()
      .pop() as string | undefined
    return {
      id: r.session_id,
      name: r.sessions.name || r.sessions.venue_names?.[0] || 'Party',
      creatorId: r.sessions.creator_id,
      date: r.sessions.created_at,
      endTime: r.sessions.end_time,
      venues: r.sessions.venue_names ?? [],
      members: ms,
      allHomeBy: everyone ? latest ?? null : null,
      homeCount,
      myGuardian: r.guardian_name,
    }
  })
}

export function partyDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}
