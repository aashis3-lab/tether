import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Member } from '@/lib/types'

/**
 * member id -> profile picture URL and phone, for everyone in the party.
 * Peers' profiles are readable by RLS (profiles_select_session_peers).
 * Re-fetches when someone joins.
 */
export function useMemberProfiles(members: Member[]): {
  avatars: Record<string, string | null>
  phones: Record<string, string | null>
} {
  const [byUser, setByUser] = useState<Record<string, { avatar: string | null; phone: string | null }>>({})
  const userIds = members.map((m) => m.user_id).filter(Boolean) as string[]
  const key = [...userIds].sort().join(',')

  useEffect(() => {
    if (!key) return
    void supabase
      .from('profiles')
      .select('id, avatar_url, phone')
      .in('id', key.split(','))
      .then(({ data }) => {
        const map: Record<string, { avatar: string | null; phone: string | null }> = {}
        for (const r of (data ?? []) as { id: string; avatar_url: string | null; phone: string | null }[]) {
          map[r.id] = { avatar: r.avatar_url, phone: r.phone }
        }
        setByUser(map)
      })
  }, [key])

  const avatars: Record<string, string | null> = {}
  const phones: Record<string, string | null> = {}
  for (const m of members) {
    const p = m.user_id ? byUser[m.user_id] : undefined
    avatars[m.id] = p?.avatar ?? null
    phones[m.id] = p?.phone ?? null
  }
  return { avatars, phones }
}
