import { appBaseUrl } from './format'
import { DEMO_SPEED, supabase } from './supabase'
import type { Alert, AlertLevel, AlertType, CheckInResponse, Member } from './types'

export interface RaiseResult {
  alert_id: string
  level: AlertLevel
  guardian_token: string | null
}

export async function raiseAlert(
  memberId: string,
  level: AlertLevel,
  opts: { type?: AlertType; message?: string } = {}
): Promise<RaiseResult> {
  const { data, error } = await supabase.rpc('raise_alert', {
    p_member_id: memberId,
    p_level: level,
    p_type: opts.type ?? 'manual',
    p_message: opts.message ?? null,
    p_base_url: appBaseUrl(),
  })
  if (error) throw error
  return data as RaiseResult
}

/** HELP pressed: raises the help alert and queues one text to the guardian. */
export async function helpPressed(memberId: string): Promise<RaiseResult> {
  const { data, error } = await supabase.rpc('help_pressed', { p_member_id: memberId, p_base_url: appBaseUrl() })
  if (error) throw error
  return data as RaiseResult
}

export async function claimAlert(alertId: string) {
  const { error } = await supabase.rpc('claim_alert', { p_alert_id: alertId })
  if (error) throw error
}

export async function resolveAlert(alertId: string) {
  const { error } = await supabase.rpc('resolve_alert', { p_alert_id: alertId })
  if (error) throw error
}

export async function guardianToken(alertId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_guardian_token', { p_alert_id: alertId })
  if (error) throw error
  return data as string
}

export async function respondCheckIn(checkInId: string, response: CheckInResponse) {
  const { error } = await supabase.rpc('respond_check_in', {
    p_check_in_id: checkInId,
    p_response: response,
    p_base_url: appBaseUrl(),
  })
  if (error) throw error
}

/**
 * Runs the automatic rules for this session now (evaluate-session Edge
 * Function). Falls back to just the manual-ladder timers if the function
 * isn't deployed yet, so Phase 3 behaviour keeps working.
 */
export async function evaluateSession(sessionId: string) {
  const { error } = await supabase.functions.invoke('evaluate-session', { body: { session_id: sessionId } })
  if (error) await escalateAlerts(sessionId)
}

export function escalateAlerts(sessionId: string) {
  return supabase.rpc('escalate_alerts', {
    p_session_id: sessionId,
    p_demo_speed: DEMO_SPEED,
    p_base_url: appBaseUrl(),
  })
}

/** Rule timers in ms after DEMO_SPEED, e.g. ruleMs(2) = "2 minutes". */
export function ruleMs(minutes: number) {
  return (minutes * 60_000) / Math.max(DEMO_SPEED, 0.01)
}

export const LEVEL_TITLE: Record<AlertLevel, string> = {
  ping: 'needs you',
  alert: 'needs help, guardian alerted',
  emergency: 'EMERGENCY',
}

export function claimerName(alert: Alert, members: Member[]) {
  return members.find((m) => m.id === alert.claimed_by)?.name ?? null
}
