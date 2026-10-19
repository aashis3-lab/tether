import { formatClock } from './time'
import { centroid, distanceM, formatDistance, hasLocation, timeAgo } from './geo'
import { firstName } from './format'
import type { Alert, LatLng, Member, MemberStatus } from './types'

/** Shown wherever a request goes out without a location to share. */
export const LOCATION_OFF = "Your location is off. Your group can't see where you are."

export type Tone = 'calm' | 'checkin' | 'alert'

// Never label anyone as intoxicated: these are neutral, location-only words.
export const STATUS_LABEL: Record<MemberStatus, string> = {
  together: 'With group',
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

export interface GroupState {
  tone: Tone
  /** One big line for the top of the map: "All 4 together", "Maya is away", "Maya needs help". */
  line: string
  /** Optional smaller second line ("1 heading home · 1 home"). */
  sub: string | null
}

/** "Maya", "Maya and Jake", "Maya, Jake and 2 more". */
function names(ms: Member[], meId: string | undefined) {
  const ns = ms.map((m) => (m.id === meId ? 'You' : firstName(m.name)))
  if (ns.length <= 2) return ns.join(' and ')
  return `${ns[0]}, ${ns[1]} and ${ns.length - 2} more`
}

/**
 * The one-line group state for the map's summary bar. Red when anyone needs
 * help (or has an open help request), yellow when anyone is away from the
 * group, otherwise green.
 */
export function groupState(members: Member[], alerts: Alert[], meId: string | undefined): GroupState {
  const out = members.filter((m) => m.status !== 'home')
  const homeCount = members.length - out.length
  const heading = out.filter((m) => m.status === 'heading_home').length
  const subParts = [heading && `${heading} heading home`, homeCount && `${homeCount} home`].filter(Boolean)
  const sub = subParts.length ? subParts.join(' · ') : null

  const helpIds = new Set(alerts.filter((a) => !a.resolved && a.type === 'manual').map((a) => a.member_id))
  const help = members.filter((m) => m.status === 'needs_help' || helpIds.has(m.id))
  if (help.length) {
    const solo = help.length === 1 && help[0].id !== meId
    return { tone: 'alert', line: `${names(help, meId)} ${solo ? 'needs' : 'need'} help`, sub }
  }

  const away = out.filter((m) => m.status === 'separated' || m.status === 'left_alone')
  if (away.length) {
    const solo = away.length === 1 && away[0].id !== meId
    return { tone: 'checkin', line: `${names(away, meId)} ${solo ? 'is' : 'are'} away`, sub }
  }

  // "Together" only counts people whose location the group can actually see.
  const together = out.filter((m) => m.status === 'together' && hasLocation(m)).length
  const dark = out.filter((m) => m.status === 'together' && !hasLocation(m))
  const darkSub = dark.length ? `${names(dark, meId)} ${dark.length === 1 && dark[0].id !== meId ? 'has' : 'have'} location off` : null
  const fullSub = [darkSub, sub].filter(Boolean).join(' · ') || null
  if (members.length === 0) return { tone: 'calm', line: 'Loading your group…', sub: null }
  if (out.length === 0) return { tone: 'calm', line: 'Everyone is home', sub: null }
  if (members.length === 1) return { tone: 'calm', line: 'Just you so far', sub: darkSub }
  return { tone: 'calm', line: together === out.length ? `All ${together} together` : `${together} of ${out.length} together`, sub: fullSub }
}

/**
 * "4 friends · all within 50 ft · updated now": the peek line under the
 * group state.
 */
export function groupMeta(members: Member[], me: Member | undefined, myPos: LatLng | null): string {
  const others = members.filter((m) => m.id !== me?.id && m.status !== 'home')
  const parts: string[] = [`${members.length} ${members.length === 1 ? 'person' : 'people'}`]
  const located = others.filter(hasLocation)
  if (myPos && located.length) {
    const far = Math.max(...located.map((m) => distanceM(myPos, m)))
    parts.push(located.length === others.length ? `all within ${formatDistance(far)}` : `${located.length} on map`)
  }
  const latest = members
    .filter(hasLocation)
    .map((m) => new Date(m.last_updated).getTime())
    .sort((a, b) => b - a)[0]
  if (latest) parts.push(`updated ${timeAgo(new Date(latest).toISOString()).replace('just now', 'now')}`)
  return parts.join(' · ')
}
