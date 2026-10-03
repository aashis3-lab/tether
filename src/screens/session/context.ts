import { useOutletContext } from 'react-router-dom'
import type { GpsStatus } from '@/hooks/useLocationReporter'
import type { Alert, CheckIn, LatLng, Member, Pin, Profile, Session } from '@/lib/types'

/** Live night-out state shared by every /session/:id/* screen. */
export interface SessionCtx {
  session: Session
  members: Member[]
  pins: Pin[]
  alerts: Alert[]
  checkIns: CheckIn[]
  me: Member | undefined
  profile: Profile | null
  myPos: LatLng | null
  gpsStatus: GpsStatus
  retryGps: () => void
  /** member id -> picture URL (null = initials). */
  avatars: Record<string, string | null>
  /** member id -> phone (from their profile) for Call / Message. */
  phones: Record<string, string | null>
}

export function useSessionCtx() {
  return useOutletContext<SessionCtx>()
}
