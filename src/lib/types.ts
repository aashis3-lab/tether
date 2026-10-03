// Row shapes for the tables in supabase/migrations. Kept hand-written (not
// generated) since the schema is small and changes rarely.

export interface Profile {
  id: string
  name: string
  phone: string
  home_lat: number | null
  home_lng: number | null
  home_address: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  additional_emergency_contacts: Contact[]
  medical_info: string | null
  /** Public Storage URL; null = show initials. */
  avatar_url?: string | null
}

export interface Contact {
  name: string
  phone: string
}

export type SessionStatus = 'active' | 'ended'

export interface Session {
  id: string
  creator_id: string
  join_code: string
  end_time: string
  status: SessionStatus
  created_at: string
  /** Venue names kept for party history after pins are deleted. */
  venue_names?: string[]
  /** Optional party name ("Friday at Red Lion"). */
  name?: string | null
}

export type MemberStatus =
  | 'together'
  | 'separated'
  | 'left_alone'
  | 'heading_home'
  | 'home'
  | 'needs_help'

export interface Member {
  id: string
  session_id: string
  user_id: string | null
  name: string
  guardian_name: string | null
  guardian_phone: string | null
  lat: number | null
  lng: number | null
  battery_level: number | null
  status: MemberStatus
  status_note: string | null
  leaving_with: string[]
  eta: string | null
  last_updated: string
  is_simulated: boolean
  /** Server-side rule timers (evaluate-session). Not for display. */
  rule_state?: Record<string, unknown>
  /** Current Update status key (see lib/activities.ts); null = accounted for. */
  activity?: string | null
  /** When a short-lived activity auto-expires back to "accounted for". */
  activity_until?: string | null
}

export interface Pin {
  id: string
  session_id: string
  name: string
  lat: number
  lng: number
  radius_m: number
  /** Venue type for the pin icon. */
  kind?: 'bar' | 'pub' | 'nightclub' | 'restaurant' | null
}

export interface LatLng {
  lat: number
  lng: number
}

export type AlertLevel = 'ping' | 'alert' | 'emergency'

export type AlertType = 'manual' | 'separation' | 'left_alone' | 'battery' | 'not_home' | 'fake_call'

export interface Alert {
  id: string
  session_id: string
  member_id: string
  level: AlertLevel
  type: AlertType
  message: string | null
  target_user_ids: string[]
  claimed_by: string | null
  resolved: boolean
  created_at: string
  escalated_at: string | null
}

export type CheckInReason = 'separation' | 'left_alone' | 'not_home'

export type CheckInResponse = 'ok' | 'heading_home' | 'elsewhere' | 'home' | 'help'

export interface CheckIn {
  id: string
  session_id: string
  member_id: string
  reason: CheckInReason
  created_at: string
  responded_at: string | null
  response: string | null
}
