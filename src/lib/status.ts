import { formatClock } from './time'
import { centroid, distanceM, formatDistance, hasLocation, timeAgo } from './geo'
import type { LatLng, Member, MemberStatus } from './types'

export type Tone = 'calm' | 'checkin' | 'alert'

// Never label anyone as intoxicated: these are neutral, location-only words.
export const STATUS_LABEL: Record<MemberStatus, string> = {
  together: 'Accounted for',
  separated: 'Away from the group',
  left_alone: 'Alone',
  heading_home: 'Heading home',
  home: 'Home',
  needs_help: 'Needs help',
}

export function statusTone(s: MemberStatus): Tone {
  if (s === 'needs_help') return 'alert'
  if (s === 'separated' || s === 'left_alone') return 'checkin'
  return 'calm'
}

export const TONE_TEXT: Record<Tone, string> = {
  calm: 'text-status-calm',
  checkin: 'text-status-checkin',
  alert: 'text-status-alert',
}

export interface GroupSummary {
  headline: string
  tone: Tone
  /** Members worth calling out on the status card (not with the group). */
  flagged: { member: Member; detail: string }[]
}

/**
 * Status-first summary line, e.g. "3/4 accounted for" plus "Maya: 0.3 mi away, alone".
 * Distances are from `me` when known, else from the group centroid.
 */
export function summarize(members: Member[], me: LatLng | null): GroupSummary {
  const total = members.length
  const together = members.filter((m) => m.status === 'together').length
  const home = members.filter((m) => m.status === 'home').length
  const origin = me ?? centroid(members.filter(hasLocation))

  const flagged = members
    .filter((m) => m.status !== 'together' && m.status !== 'home')
    .sort((a, b) => rank(b.status) - rank(a.status))
    .map((m) => {
      const parts: string[] = []
      if (hasLocation(m) && origin) parts.push(`${formatDistance(distanceM(origin, m))} away`)
      else parts.push('location off')
      parts.push((m.status_note || STATUS_LABEL[m.status]).toLowerCase())
      if (m.status === 'heading_home' && m.eta) parts.push(`ETA ${formatClock(m.eta)}`)
      else parts.push(timeAgo(m.last_updated))
      return { member: m, detail: parts.join(', ') }
    })

  const tone: Tone = flagged.some((f) => statusTone(f.member.status) === 'alert')
    ? 'alert'
    : flagged.some((f) => statusTone(f.member.status) === 'checkin')
      ? 'checkin'
      : 'calm'

  let headline = `${together}/${total} accounted for`
  if (home) headline += ` · ${home} home`
  if (together + home === total && total > 0) headline = home === total ? 'Everyone is home' : `${together}/${total} accounted for`

  return { headline, tone, flagged }
}

function rank(s: MemberStatus) {
  return { needs_help: 3, left_alone: 2, separated: 2, heading_home: 1, together: 0, home: 0 }[s]
}
