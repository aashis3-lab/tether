import type { Member } from './types'

/**
 * Update statuses ("What's happening?"). A person has exactly one at a time;
 * picking one replaces the last. Short-lived ones expire back to "Accounted
 * for" after `minutes`.
 */
export type ActivityKey =
  | 'bathroom'
  | 'drinks'
  | 'food'
  | 'outside'
  | 'dancing'
  | 'moving'
  | 'leaving_friend'
  | 'leaving_new'
  | 'ride'
  | 'heading_home'
  | 'phone_dying'
  | 'minute'
  | 'back'

export interface ActivityDef {
  key: ActivityKey
  label: string
  emoji: string
  minutes?: number
}

export const ACTIVITIES: ActivityDef[] = [
  { key: 'bathroom', label: 'Bathroom', emoji: '🚻', minutes: 10 },
  { key: 'drinks', label: 'Getting drinks', emoji: '🍹', minutes: 10 },
  { key: 'food', label: 'Getting food', emoji: '🍕', minutes: 10 },
  { key: 'outside', label: 'Outside', emoji: '🌙', minutes: 10 },
  { key: 'dancing', label: 'Dancing', emoji: '💃' },
  { key: 'moving', label: 'Moving venues', emoji: '📍' },
  { key: 'leaving_friend', label: 'Leaving with friend', emoji: '👯' },
  { key: 'leaving_new', label: 'Leaving with someone', emoji: '🧑‍🤝‍🧑' },
  { key: 'ride', label: 'Ordering a ride', emoji: '🚕' },
  { key: 'heading_home', label: 'Heading home', emoji: '🏠' },
  { key: 'phone_dying', label: 'Phone dying', emoji: '🪫' },
  { key: 'minute', label: 'Need a minute', emoji: '🫧', minutes: 15 },
  { key: 'back', label: 'Back with group', emoji: '✅' },
]

export const activityDef = (key: string | null | undefined) => ACTIVITIES.find((a) => a.key === key)

/** The member's live activity, or null if none / expired. */
export function liveActivity(m: Member, now = Date.now()): ActivityDef | null {
  const def = activityDef(m.activity)
  if (!def || def.key === 'back') return null
  if (m.activity_until && new Date(m.activity_until).getTime() <= now) return null
  return def
}

/** "7m" left on a short-lived status, or null. */
export function activityTimeLeft(m: Member, now = Date.now()): string | null {
  if (!m.activity_until) return null
  const ms = new Date(m.activity_until).getTime() - now
  if (ms <= 0) return null
  const min = Math.ceil(ms / 60_000)
  return min >= 1 ? `${min}m` : '<1m'
}

/**
 * One-line status for a member, used everywhere statuses are shown.
 * Rule-driven states (needs help, home, heading home, alone) win over activities.
 */
export function memberStatusLabel(m: Member, now = Date.now()): string {
  if (m.status === 'needs_help') return 'Needs help'
  if (m.status === 'home') return 'Home ✓'
  if (m.status === 'heading_home') return 'Heading home'
  const act = liveActivity(m, now)
  if (act) {
    // Activities with a detail ("Leaving with Jake", "Moving to The Lantern") keep it.
    const detailed = act.key === 'leaving_friend' || act.key === 'leaving_new' || act.key === 'moving'
    return detailed && m.status_note ? m.status_note : act.label
  }
  if (m.status === 'left_alone') return 'Alone'
  if (m.status === 'separated') return m.status_note || 'Away from group'
  return 'Accounted for'
}
