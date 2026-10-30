// evaluate-session, Tether's automatic rules (CLAUDE.md "AUTOMATIC RULES" A–D).
//
// Called by:
//   * pg_cron every 10 s (header x-cron-secret = CRON_SECRET) -> all active sessions
//   * open apps after location updates (Authorization: Bearer <user JWT>,
//     body { session_id }) -> that session, if the caller is a member
//
// Deploy with JWT verification OFF (it authenticates callers itself):
//   npx supabase functions deploy evaluate-session --no-verify-jwt
// or paste this file into Dashboard -> Edge Functions -> new function, and
// untick "Enforce JWT verification".
//
// Secrets: APP_BASE_URL, CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT (SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided automatically).
//
// Single file on purpose so it can be pasted into the dashboard editor.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = (Deno.env.get('APP_BASE_URL') ?? '').replace(/\/$/, '')
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''

/** Rule timer in ms. T(10) = "10 minutes". */
const T = (minutes: number) => minutes * 60_000

const SEPARATION_M = 150 // A: distance from group centroid
const ALONE_RADIUS_M = 50 // B: no friend within this
const HOME_RADIUS_M = 75 // D: "arrived home"
const AWAY_FROM_HOME_M = 200 // D: must have been this far from home before "arrived" counts
const NEARBY_M = 61 // 200 ft, for ping targeting in big groups
const BATTERY_LOW = 10 // C
const BATTERY_RESET = 20

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ---------------------------------------------------------------------------
// Types (subset of the schema)
// ---------------------------------------------------------------------------

interface LatLng {
  lat: number
  lng: number
}

interface RuleState {
  home_at?: string
  been_away?: boolean
  in_pin?: boolean
  left_venue_at?: string
  sep_since?: string
  sep_acked?: boolean
  sep_pinged?: string
  alone_since?: string
  alone_checked?: string
  alone_pinged?: string
  battery_warned?: boolean
  not_home_for?: string
  not_home_pinged?: string
}

interface Member {
  id: string
  session_id: string
  user_id: string | null
  name: string
  guardian_name: string | null
  guardian_phone: string | null
  lat: number | null
  lng: number | null
  battery_level: number | null
  status: string
  status_note: string | null
  leaving_with: string[]
  eta: string | null
  rule_state: RuleState
  activity: string | null
  activity_until: string | null
}

interface Pin extends LatLng {
  radius_m: number
}

interface CheckIn {
  id: string
  member_id: string
  reason: string
  created_at: string
  responded_at: string | null
}

interface Alert {
  id: string
  member_id: string
  level: string
  type: string
  target_user_ids: string[]
  claimed_by: string | null
  resolved: boolean
  created_at: string
}

interface Session {
  id: string
  end_time: string
  status: string
}

// ---------------------------------------------------------------------------
// Geo helpers (mirror src/lib/geo.ts)
// ---------------------------------------------------------------------------

function dist(a: LatLng, b: LatLng): number {
  const r = (d: number) => (d * Math.PI) / 180
  const h =
    Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

function centroid(ps: LatLng[]): LatLng {
  return { lat: ps.reduce((s, p) => s + p.lat, 0) / ps.length, lng: ps.reduce((s, p) => s + p.lng, 0) / ps.length }
}

function fmtDist(m: number): string {
  const ft = m * 3.28084
  if (ft < 528) return `${Math.max(10, Math.round(ft / 10) * 10)} ft`
  const mi = m / 1609.34
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`
}

function compass(from: LatLng, to: LatLng): string {
  const r = (d: number) => (d * Math.PI) / 180
  const y = Math.sin(r(to.lng - from.lng)) * Math.cos(r(to.lat))
  const x = Math.cos(r(from.lat)) * Math.sin(r(to.lat)) - Math.sin(r(from.lat)) * Math.cos(r(to.lat)) * Math.cos(r(to.lng - from.lng))
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8]
}

const located = (m: Member): m is Member & LatLng => m.lat != null && m.lng != null

/** Rough door-to-door time: walk under 2 km, otherwise drive. Real-world ms. */
function travelMs(m: number): number {
  return m < 2000 ? (m / 1.3) * 1000 : (m / 8) * 1000 + 5 * 60_000
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    // Echo whatever headers this supabase-js version sends, so a new header
    // never makes the browser block the call.
    const asked = req.headers.get('Access-Control-Request-Headers')
    return new Response('ok', { headers: asked ? { ...CORS, 'Access-Control-Allow-Headers': asked } : CORS })
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  // session_id: evaluate that party (caller must be a member).
  // outbox: true with no session_id: only send the caller's own queued texts
  // (Settings -> Send test text).
  const body = (await req.json().catch(() => ({}))) as {
    session_id?: string
    outbox?: boolean
    nearby?: { lat: number; lng: number; radius?: number }
  }

  let sessions: Session[] = []
  let uid: string | null = null
  const isCron = CRON_SECRET !== '' && req.headers.get('x-cron-secret') === CRON_SECRET

  if (isCron) {
    const { data } = await db.from('sessions').select('id, end_time, status').eq('status', 'active')
    sessions = (data ?? []) as Session[]
  } else {
    // A member's app: verify their JWT (and membership when a party is named).
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: userData } = await db.auth.getUser(jwt)
    uid = userData.user?.id ?? null
    if (!uid) return json({ error: 'unauthorized' }, 401)
    // Nearby venue search, proxied because Overpass rejects browser requests.
    if (body.nearby) return json(await overpassNearby(body.nearby.lat, body.nearby.lng, body.nearby.radius ?? 2000))
    if (body.session_id) {
      const { data: mem } = await db
        .from('session_members')
        .select('id')
        .eq('session_id', body.session_id)
        .eq('user_id', uid)
        .maybeSingle()
      if (!mem) return json({ error: 'not a member of this session' }, 403)
      const { data } = await db.from('sessions').select('id, end_time, status').eq('id', body.session_id).eq('status', 'active')
      sessions = (data ?? []) as Session[]
    } else if (!body.outbox) {
      return json({ error: 'session_id required' }, 400)
    }
  }

  const results = []
  for (const s of sessions) {
    try {
      results.push({ session_id: s.id, actions: await evaluateSession(db, s) })
      await pushSessionEvents(db, s.id)
    } catch (e) {
      console.error('evaluate failed', s.id, e)
      results.push({ session_id: s.id, error: String(e) })
    }
  }
  // Guardian messages queued by the database (HELP, guardian alerts, everyone
  // home, test). Cron sends everything; an app sends its party's and its own.
  const guardian = await processOutbox(db, isCron ? {} : { sessionId: body.session_id, userId: uid! })
  return json({ results, guardian })
})

// ---------------------------------------------------------------------------
// Nearby venues (OpenStreetMap Overpass), proxied for the app
// ---------------------------------------------------------------------------

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

async function overpassNearby(lat: number, lng: number, radius: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { places: [], error: 'bad location' }
  const r = Math.min(Math.max(radius, 200), 5000)
  const sel = `["amenity"~"^(bar|pub|nightclub|restaurant)$"]["name"](around:${r},${lat},${lng})`
  const q = `[out:json][timeout:15];(node${sel};way${sel};);out center 200;`
  for (const url of OVERPASS_MIRRORS) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 12_000)
    try {
      const res = await fetch(url, {
        method: 'POST',
        // Overpass rejects browser user agents; identify the app instead.
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Tether/1.0 (nightlife safety app)' },
        body: 'data=' + encodeURIComponent(q),
        signal: ctrl.signal,
      })
      if (!res.ok) continue
      const data = (await res.json()) as {
        elements?: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[]
      }
      const places = (data.elements ?? [])
        .map((el) => {
          const t2 = el.tags ?? {}
          const plat = el.lat ?? el.center?.lat
          const plng = el.lon ?? el.center?.lon
          if (plat == null || plng == null || !t2.name) return null
          return {
            name: t2.name,
            address: [t2['addr:housenumber'], t2['addr:street']].filter(Boolean).join(' ') || t2['addr:city'] || '',
            lat: plat,
            lng: plng,
            kind: t2.amenity,
          }
        })
        .filter(Boolean)
      return { places, source: url }
    } catch {
      // timeout / network: next mirror
    } finally {
      clearTimeout(t)
    }
  }
  return { places: [], error: 'all Overpass mirrors failed' }
}

// ---------------------------------------------------------------------------
// Web push (replaces SMS)
// ---------------------------------------------------------------------------

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:tether@example.com'
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

const STALE_SENDING_MS = 2 * 60_000
const MAX_ATTEMPTS = 3

interface OutboxRow {
  id: string
  to_name: string | null
  to_phone: string
  body: string
  status: 'pending' | 'sending' | 'sent' | 'failed'
  attempts: number
  created_at: string
}

interface PushMessage {
  title: string
  body: string
  url: string
  tag: string
}

/** "(217) 555-0138" -> "+12175550138". US numbers assumed without a country code. */
function toE164(raw: string): string {
  const d = raw.replace(/[^\d+]/g, '')
  if (d.startsWith('+')) return d
  if (d.length === 10) return '+1' + d
  if (d.length === 11 && d.startsWith('1')) return '+' + d
  return '+' + d
}

/**
 * Pushes to every device of these users. Dead subscriptions (404/410) are
 * removed. Returns how many devices got it.
 */
async function pushToUsers(db: SupabaseClient, userIds: string[], msg: PushMessage): Promise<number> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || userIds.length === 0) return 0
  const { data } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('user_id', userIds)
  let delivered = 0
  for (const sub of (data ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[]) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(msg),
        { TTL: 3600, urgency: 'high' },
      )
      delivered++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('id', sub.id)
      else console.error('push failed', sub.id, code, String(e))
    }
  }
  return delivered
}

/** Records an event key; true only the first time, so each push goes out once. */
async function firstTime(db: SupabaseClient, key: string): Promise<boolean> {
  const { error } = await db.from('push_log').insert({ event_key: key })
  return !error
}

/**
 * Delivers queued guardian messages (HELP, guardian alerts, everyone home,
 * test) as a push to the Tether account with that phone number. Each row is
 * claimed with a conditional update so two runners (cron + an app) can never
 * send it twice. Failures are recorded with a readable reason (shown in
 * Settings) and never throw, so the alert flow keeps going.
 */
async function processOutbox(db: SupabaseClient, scope: { sessionId?: string; userId?: string }) {
  let q = db
    .from('sms_outbox')
    .select('id, to_name, to_phone, body, status, attempts, created_at')
    .in('status', ['pending', 'sending'])
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at')
    .limit(20)
  if (scope.sessionId && scope.userId) q = q.or(`session_id.eq.${scope.sessionId},requested_by.eq.${scope.userId}`)
  else if (scope.userId) q = q.eq('requested_by', scope.userId)
  const { data, error } = await q
  if (error) {
    console.error('outbox read failed', error.message)
    return { error: error.message }
  }

  let sent = 0
  let failed = 0
  for (const row of (data ?? []) as OutboxRow[]) {
    // A row stuck in "sending" (crashed run) is retried after 2 minutes.
    if (row.status === 'sending' && Date.now() - new Date(row.created_at).getTime() < STALE_SENDING_MS) continue
    const { data: claimed } = await db
      .from('sms_outbox')
      .update({ status: 'sending', attempts: row.attempts + 1 })
      .eq('id', row.id)
      .eq('status', row.status)
      .eq('attempts', row.attempts)
      .select('id')
    if (!claimed || claimed.length === 0) continue

    const who = row.to_name?.trim() || 'Your guardian'
    const { data: owners } = await db.from('profiles').select('id').eq('phone', toE164(row.to_phone))
    const ids = ((owners ?? []) as { id: string }[]).map((o) => o.id)
    let failure: string | null = null
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) failure = 'Notifications are not set up on the server (VAPID keys missing).'
    else if (ids.length === 0) failure = `${who} isn't on Tether yet. Ask them to sign up with ${row.to_phone}.`
    else {
      const link = /\s(https?:\/\/\S+)$/.exec(row.body)
      const text = (link ? row.body.slice(0, link.index) : row.body).replace(/^Tether:\s*/, '')
      const n = await pushToUsers(db, ids, { title: 'Tether', body: text, url: link?.[1] ?? '/', tag: `outbox-${row.id}` })
      if (n === 0) failure = `${who} hasn't turned on Tether notifications.`
    }

    if (!failure) {
      sent++
      await db.from('sms_outbox').update({ status: 'sent', sent_at: new Date().toISOString(), error: null }).eq('id', row.id)
    } else {
      failed++
      console.error('guardian push failed', row.id, failure)
      await db.from('sms_outbox').update({ status: 'failed', error: failure }).eq('id', row.id)
    }
  }
  return { sent, failed }
}

function alertTitle(a: Alert, name: string): string {
  if (a.level === 'emergency') return `EMERGENCY: ${name}`
  if (a.level === 'alert') return `${name} needs help`
  switch (a.type) {
    case 'battery':
      return `${name}'s phone is dying`
    case 'left_alone':
      return `${name} is on their own`
    case 'separation':
      return `${name} isn't answering`
    case 'not_home':
      return `${name} hasn't made it home`
    default:
      return `${name} needs you`
  }
}

const CHECK_IN_BODY: Record<string, string> = {
  separation: "You've been away from your group for a while. Tap to answer.",
  left_alone: 'You left on your own. All good? Tap to answer.',
  not_home: "You haven't confirmed you're home. Tap to answer.",
}

/**
 * Pushes this party's open alerts to their targets (once per alert, level
 * and person, so a ping widening to the whole group reaches the new people)
 * and open check-ins to the member asked.
 */
async function pushSessionEvents(db: SupabaseClient, sessionId: string) {
  const [{ data: memberRows }, { data: ciRows }, { data: alertRows }] = await Promise.all([
    db.from('session_members').select('id, user_id, name').eq('session_id', sessionId),
    db.from('check_ins').select('id, member_id, reason').eq('session_id', sessionId).is('responded_at', null),
    db.from('alerts').select('*').eq('session_id', sessionId).eq('resolved', false),
  ])
  const members = (memberRows ?? []) as { id: string; user_id: string | null; name: string }[]
  const byId = new Map(members.map((m) => [m.id, m]))
  const url = `/session/${sessionId}`

  for (const a of (alertRows ?? []) as (Alert & { message: string | null })[]) {
    if (a.claimed_by) continue
    const from = byId.get(a.member_id)
    for (const uid of a.target_user_ids ?? []) {
      if (uid === from?.user_id) continue
      if (!(await firstTime(db, `alert:${a.id}:${a.level}:${uid}`))) continue
      await pushToUsers(db, [uid], {
        title: alertTitle(a, from?.name ?? 'A friend'),
        body: a.message ?? 'Tap to see where they are.',
        url,
        tag: `alert-${a.id}`,
      })
    }
  }

  for (const ci of (ciRows ?? []) as { id: string; member_id: string; reason: string }[]) {
    const uid = byId.get(ci.member_id)?.user_id
    if (!uid || !(await firstTime(db, `checkin:${ci.id}`))) continue
    await pushToUsers(db, [uid], {
      title: 'Are you okay?',
      body: CHECK_IN_BODY[ci.reason] ?? 'Tap to answer.',
      url,
      tag: `checkin-${ci.id}`,
    })
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

async function evaluateSession(db: SupabaseClient, session: Session): Promise<string[]> {
  const actions: string[] = []
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const ms = (iso?: string | null) => (iso ? new Date(iso).getTime() : NaN)

  // Session ends at end_time …
  if (now >= ms(session.end_time)) {
    await db.rpc('end_session', { p_session_id: session.id })
    return ['ended: end_time reached']
  }

  const [{ data: memberRows }, { data: pinRows }, { data: ciRows }, { data: alertRows }] = await Promise.all([
    db.from('session_members').select('*').eq('session_id', session.id),
    db.from('pins').select('lat, lng, radius_m').eq('session_id', session.id),
    db.from('check_ins').select('*').eq('session_id', session.id).is('responded_at', null),
    db.from('alerts').select('*').eq('session_id', session.id).eq('resolved', false),
  ])
  const members = (memberRows ?? []) as Member[]
  const pins = (pinRows ?? []) as Pin[]
  const openCheckIns = (ciRows ?? []) as CheckIn[]
  const openAlerts = (alertRows ?? []) as Alert[]

  // … or when every member is home (end_session texts each guardian once).
  const real = members
  if (real.length > 0 && real.every((m) => m.status === 'home')) {
    await db.rpc('end_session', { p_session_id: session.id })
    return ['ended: everyone home']
  }

  // Home coordinates for real members.
  const userIds = real.map((m) => m.user_id).filter(Boolean) as string[]
  const { data: profileRows } = userIds.length
    ? await db.from('profiles').select('id, home_lat, home_lng').in('id', userIds)
    : { data: [] }
  const homeOf = new Map<string, LatLng>()
  for (const p of (profileRows ?? []) as { id: string; home_lat: number | null; home_lng: number | null }[]) {
    if (p.home_lat != null && p.home_lng != null) homeOf.set(p.id, { lat: p.home_lat, lng: p.home_lng })
  }

  const openCI = (memberId: string, reason: string) =>
    openCheckIns.find((c) => c.member_id === memberId && c.reason === reason)
  const openAlert = (memberId: string, type: string) =>
    openAlerts.find((a) => a.member_id === memberId && a.type === type)

  /** Every other real member still out (user ids). */
  const allTargets = (m: Member) =>
    members.filter((o) => o.id !== m.id && o.user_id && o.status !== 'home').map((o) => o.user_id!) as string[]

  /** Spec ping targeting: group <= 5 -> everyone; else within 200 ft first. */
  const pingTargets = (m: Member) => {
    const all = allTargets(m)
    if (members.length <= 5 || !located(m)) return all
    const near = members
      .filter((o) => o.id !== m.id && o.user_id && o.status !== 'home' && located(o) && dist(m as LatLng, o as LatLng) <= NEARBY_M)
      .map((o) => o.user_id!) as string[]
    return near.length ? near : all
  }

  /** Nearest other member (real preferred, since only real people get alerts). */
  const nearestFriend = (m: Member) => {
    if (!located(m)) return null
    const cands = members
      .filter((o) => o.id !== m.id && o.user_id && o.status !== 'home' && located(o))
      .map((o) => ({ o, d: dist(m, o as LatLng) }))
      .sort((a, b) => a.d - b.d)
    return cands[0] ?? null
  }

  const insertCheckIn = async (m: Member, reason: string) => {
    const { error } = await db.from('check_ins').insert({ session_id: session.id, member_id: m.id, reason })
    if (error && error.code !== '23505') throw error
    actions.push(`check-in ${reason}: ${m.name}`)
  }

  const insertAlert = async (m: Member, type: string, message: string, targets: string[]) => {
    const { error } = await db.from('alerts').insert({
      session_id: session.id,
      member_id: m.id,
      level: 'ping',
      type,
      message,
      target_user_ids: targets,
    })
    if (error && error.code !== '23505') throw error
    actions.push(`ping ${type}: ${m.name} -> ${targets.length} people`)
  }

  const closeCheckIn = async (ci: CheckIn | undefined, response: string) => {
    if (!ci) return
    await db.from('check_ins').update({ responded_at: nowIso, response }).eq('id', ci.id).is('responded_at', null)
  }

  const resolveAlerts = async (m: Member, types: string[]) => {
    await db.from('alerts').update({ resolved: true }).eq('member_id', m.id).in('type', types).eq('resolved', false)
  }

  for (const m of members) {
    if (m.status === 'home') continue

    const state: RuleState = { ...(m.rule_state ?? {}) }
    const patch: Partial<Member> = {}
    const before = JSON.stringify(state)
    const home = m.user_id ? homeOf.get(m.user_id) : undefined
    const others = members.filter((o) => o.id !== m.id && o.status !== 'home' && located(o)) as (Member & LatLng)[]

    // -------------------------------------------------------------------
    // D (part 1): arrived home, only after having actually been away, so
    // starting a night out from home (pregame, testing) doesn't instantly
    // mark you home and end the session.
    // -------------------------------------------------------------------
    if (located(m) && home && dist(m, home) > AWAY_FROM_HOME_M) state.been_away = true
    if (located(m) && home && state.been_away && dist(m, home) <= HOME_RADIUS_M) {
      patch.status = 'home'
      patch.status_note = 'Home'
      patch.eta = null
      for (const r of ['separation', 'left_alone', 'not_home']) await closeCheckIn(openCI(m.id, r), 'arrived')
      await resolveAlerts(m, ['separation', 'left_alone', 'not_home'])
      // home_at feeds the Get home grid and the morning summary.
      await db.from('session_members').update({ ...patch, rule_state: { home_at: nowIso } }).eq('id', m.id)
      actions.push(`home: ${m.name}`)
      continue
    }

    // Venue tracking (for B and D).
    const inPin = located(m) && pins.some((p) => dist(m, p) <= p.radius_m)
    if (located(m) && pins.length) {
      if (inPin) {
        if (!state.in_pin || state.left_venue_at) {
          // Back at a venue: forget the previous departure.
          delete state.left_venue_at
          delete state.alone_since
          delete state.alone_checked
          delete state.not_home_for
        }
        state.in_pin = true
      } else if (state.in_pin) {
        state.in_pin = false
        state.left_venue_at = nowIso
        actions.push(`left venue: ${m.name}`)
      }
    }

    // Short-lived Update statuses (Bathroom, Getting drinks, …) expire back
    // to "Accounted for".
    if (m.activity_until && now >= ms(m.activity_until)) {
      patch.activity = null
      patch.activity_until = null
      patch.status_note = null
      actions.push(`status expired: ${m.name}`)
    }

    const busy = m.status === 'heading_home' || m.status === 'needs_help' || m.leaving_with.length > 0

    // -------------------------------------------------------------------
    // A. Separation: > 150 m from the rest of the group for > 10 min while
    //    at a venue (or anywhere, if no venues were pinned).
    // -------------------------------------------------------------------
    const atVenue = pins.length === 0 || inPin
    const separated =
      located(m) && others.length > 0 && !busy && atVenue && dist(m, centroid(others)) > SEPARATION_M

    if (separated) {
      state.sep_since ??= nowIso
      if (now - ms(state.sep_since) > T(10) && !state.sep_acked && !openCI(m.id, 'separation')) {
        await insertCheckIn(m, 'separation')
        patch.status = 'separated'
      }
    } else if (state.sep_since || state.sep_acked) {
      delete state.sep_since
      delete state.sep_acked
      delete state.sep_pinged
      await closeCheckIn(openCI(m.id, 'separation'), 'auto_cleared')
      await resolveAlerts(m, ['separation'])
      if (m.status === 'separated' && m.leaving_with.length === 0) {
        patch.status = 'together'
        patch.status_note = null
      }
    }

    // No answer in 3 min -> ping.
    const sepCI = openCI(m.id, 'separation')
    if (sepCI && now - ms(sepCI.created_at) > T(3) && state.sep_pinged !== sepCI.id && !openAlert(m.id, 'separation')) {
      const away = located(m) && others.length ? `, ${fmtDist(dist(m, centroid(others)))} from the group` : ''
      await insertAlert(m, 'separation', `${m.name} hasn't answered “Are you okay?”${away}.`, pingTargets(m))
      state.sep_pinged = sepCI.id
    }

    // -------------------------------------------------------------------
    // B. Left alone: out of every venue, no friend within 50 m, for > 2 min,
    //    and not "leaving with" anyone.
    // -------------------------------------------------------------------
    const friendClose = located(m) && others.some((o) => dist(m, o) <= ALONE_RADIUS_M)
    const alone = located(m) && pins.length > 0 && !inPin && !!state.left_venue_at && !busy && !friendClose

    if (alone) {
      state.alone_since ??= nowIso
      if (
        now - ms(state.alone_since) > T(2) &&
        state.alone_checked !== state.left_venue_at &&
        !openCI(m.id, 'left_alone')
      ) {
        await insertCheckIn(m, 'left_alone')
        patch.status = 'left_alone'
        state.alone_checked = state.left_venue_at
      }
    } else {
      delete state.alone_since
      // Back with friends / at a venue -> stand down.
      if (m.status === 'left_alone' && (inPin || friendClose)) {
        await closeCheckIn(openCI(m.id, 'left_alone'), 'auto_cleared')
        await resolveAlerts(m, ['left_alone'])
        patch.status = 'together'
        patch.status_note = null
      }
    }

    const aloneCI = openCI(m.id, 'left_alone')
    if (aloneCI) {
      const age = now - ms(aloneCI.created_at)
      const alert = openAlert(m.id, 'left_alone')

      // 3 min: (client makes the check-in louder) + ping nearest friend.
      if (age > T(3) && !alert && state.alone_pinged !== aloneCI.id) {
        const nf = nearestFriend(m)
        const msg = nf
          ? `${m.name} is alone, ${fmtDist(nf.d)} ${compass(nf.o as LatLng, m as LatLng)} of you. Can you check on ${m.name}?`
          : `${m.name} left on their own and isn't answering.`
        await insertAlert(m, 'left_alone', msg, nf ? [nf.o.user_id!] : allTargets(m))
        state.alone_pinged = aloneCI.id
      }

      // 5 min: whole group (repeats every 2 min on clients until claimed).
      if (age > T(5) && alert && !alert.claimed_by && alert.level === 'ping') {
        const all = allTargets(m)
        if (all.some((u) => !alert.target_user_ids.includes(u))) {
          const away = located(m) && others.length ? `, ${fmtDist(dist(m, centroid(others)))} from the group` : ''
          await db
            .from('alerts')
            .update({ target_user_ids: all, message: `${m.name} is alone and not answering${away}.` })
            .eq('id', alert.id)
          actions.push(`left_alone widened: ${m.name}`)
        }
      }

      // 10 min unclaimed: guardian.
      if (age > T(10) && alert && !alert.claimed_by && alert.level === 'ping') {
        await db.rpc('_apply_level', { p_alert_id: alert.id, p_level: 'alert', p_base_url: BASE_URL })
        actions.push(`left_alone -> guardian: ${m.name}`)
      }
    }

    // -------------------------------------------------------------------
    // C. Battery: at 10%, nearest friend gets "phone is dying"; guardian FYI.
    // -------------------------------------------------------------------
    if (m.battery_level != null && m.battery_level <= BATTERY_LOW && !state.battery_warned) {
      const nf = nearestFriend(m)
      await insertAlert(
        m,
        'battery',
        `${m.name}'s phone is dying (${m.battery_level}%). Stay with ${m.name}.`,
        nf ? [nf.o.user_id!] : allTargets(m)
      )
      console.log(
        `tether sms (disabled) to ${m.guardian_name} <${m.guardian_phone}>: Tether: ${m.name}'s phone is at ${m.battery_level}%. ` +
          `${nf ? `${nf.o.name} is ${fmtDist(nf.d)} away. ` : ''}Their last location stays visible to the group.`
      )
      state.battery_warned = true
    } else if (m.battery_level != null && m.battery_level > BATTERY_RESET && state.battery_warned) {
      delete state.battery_warned
      await resolveAlerts(m, ['battery'])
    }

    // -------------------------------------------------------------------
    // D (part 2): arrival chain
    // -------------------------------------------------------------------
    if (home) {
      // Heading home with no ETA yet -> estimate one.
      if (m.status === 'heading_home' && !m.eta && located(m)) {
        patch.eta = new Date(now + travelMs(dist(m, home))).toISOString()
      }
      const eta = patch.eta ?? m.eta

      // Not home by ETA + 15 min -> check-in.
      if (m.status === 'heading_home' && eta && now > ms(eta) + T(15) && state.not_home_for !== eta && !openCI(m.id, 'not_home')) {
        await insertCheckIn(m, 'not_home')
        state.not_home_for = eta
      }

      // Left a venue 30+ min ago and not home (and not on a tracked trip) -> check-in.
      if (
        state.left_venue_at &&
        m.status !== 'heading_home' &&
        now - ms(state.left_venue_at) > T(30) &&
        state.not_home_for !== state.left_venue_at &&
        !openCI(m.id, 'not_home')
      ) {
        await insertCheckIn(m, 'not_home')
        state.not_home_for = state.left_venue_at
      }
    }

    // Unanswered "Did you get home?" -> ping the group (ladder continues
    // via escalate_alerts: guardian after 10 min).
    const homeCI = openCI(m.id, 'not_home')
    if (homeCI && now - ms(homeCI.created_at) > T(3) && state.not_home_pinged !== homeCI.id && !openAlert(m.id, 'not_home')) {
      await insertAlert(m, 'not_home', `${m.name} hasn't confirmed getting home.`, pingTargets(m))
      state.not_home_pinged = homeCI.id
    }

    // Persist only real changes (rule bookkeeping never bumps last_updated).
    if (JSON.stringify(state) !== before || Object.keys(patch).length) {
      await db.from('session_members').update({ ...patch, rule_state: state }).eq('id', m.id)
    }
  }

  // Time-based steps of the manual ladder (widen pings, 10-min re-escalation).
  await db.rpc('escalate_alerts', { p_session_id: session.id, p_base_url: BASE_URL })

  return actions
}
