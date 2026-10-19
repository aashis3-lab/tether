import { useEffect, useRef, useState } from 'react'
import { AlertOverlay } from './AlertOverlay'
import { BatteryHandoff } from './BatteryHandoff'
import { AlertTriangleIcon, CheckIcon } from './icons'
import { claimAlert, claimerName, resolveAlert, ruleMs } from '@/lib/alerts'
import { notify } from '@/lib/device'
import { tryOrToast } from '@/lib/toast'
import { compass, distanceM, formatDistance, hasLocation, mapsLink, timeAgo } from '@/lib/geo'
import type { Alert, LatLng, Member } from '@/lib/types'

/** Headline for an alert about `name`, by what triggered it. */
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

/** Unclaimed alerts reappear this long after "Not right now" (repeats until claimed). */
const REPEAT_MINUTES = 2

/** Automatic "away from the group" pings show as a snackbar first... */
const SOFT_TYPES = new Set<Alert['type']>(['separation', 'left_alone'])
/** ...and take over the screen if nobody acts on them within this long. */
const SNACKBAR_MS = 30_000

function whereIs(target: Member | undefined, from: LatLng | null) {
  if (!target || !hasLocation(target)) return 'Location unavailable'
  if (!from) return `Last seen ${timeAgo(target.last_updated)}`
  return `${formatDistance(distanceM(from, target))} ${compass(from, target)} of you`
}

/**
 * Receiver side of the ladder: alerts aimed at me (full-screen, or a snackbar
 * first for separation pings), plus a status card for every open alert (and
 * "Found them" once I've claimed one).
 */
export function IncomingAlerts({
  alerts,
  members,
  me,
  userId,
  position,
  mode,
  avatars,
  phones,
}: {
  alerts: Alert[]
  members: Member[]
  me: Member | undefined
  userId: string | null
  position: LatLng | null
  /** 'banners' = inline status strips (main screen); 'overlay' = full-screen takeover (session shell). */
  mode: 'banners' | 'overlay'
  /** member id -> picture / phone, for the phone-dying handoff. */
  avatars?: Record<string, string | null>
  phones?: Record<string, string | null>
}) {
  const [dismissed, setDismissed] = useState<Record<string, number>>({})
  const [working, setWorking] = useState<string | null>(null)
  const act = async (key: string, label: string, fn: () => Promise<void>) => {
    if (working) return
    setWorking(key)
    await tryOrToast(label, fn)
    setWorking(null)
  }
  const [, setTick] = useState(0)
  const notified = useRef(new Set<string>())

  // Re-evaluate snoozes every few seconds.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 2000)
    return () => window.clearInterval(id)
  }, [])

  const others = alerts.filter((a) => a.member_id !== me?.id)
  const incoming = others.find((a) => {
    if (!userId || !a.target_user_ids.includes(userId) || a.claimed_by) return false
    const snoozedAt = dismissed[a.id + a.level]
    return snoozedAt == null || Date.now() - snoozedAt > ruleMs(REPEAT_MINUTES)
  })

  const sender = incoming ? members.find((m) => m.id === incoming.member_id) : undefined

  // System notification if the app is in the background.
  useEffect(() => {
    if (mode !== 'overlay' || !incoming || !sender) return
    const key = incoming.id + incoming.level
    if (notified.current.has(key)) return
    notified.current.add(key)
    if (document.hidden) void notify(alertTitle(incoming, sender.name), incoming.message ?? 'Come find me', incoming.id)
  }, [incoming, sender, mode])

  const snooze = (a: Alert) => setDismissed((d) => ({ ...d, [a.id + a.level]: Date.now() }))

  // Separation / left-alone pings start as a snackbar; if nobody acts on it
  // within SNACKBAR_MS it becomes the full-screen takeover.
  const incomingKey = incoming ? incoming.id + incoming.level : null
  const soft = incoming != null && incoming.level === 'ping' && SOFT_TYPES.has(incoming.type)
  const [firstSeen, setFirstSeen] = useState<Record<string, number>>({})
  useEffect(() => {
    if (mode !== 'overlay' || !soft || !incomingKey) return
    setFirstSeen((s) => (incomingKey in s ? s : { ...s, [incomingKey]: Date.now() }))
  }, [mode, soft, incomingKey])
  const seenAt = incomingKey ? firstSeen[incomingKey] : undefined
  const snackbar = soft && (seenAt == null || Date.now() - seenAt < SNACKBAR_MS)

  if (mode === 'overlay') {
    if (!incoming) return null
    if (incoming.type === 'battery' && sender) {
      return (
        <BatteryHandoff
          alert={incoming}
          member={sender}
          avatar={avatars?.[sender.id]}
          phone={phones?.[sender.id]}
          onClose={() => snooze(incoming)}
        />
      )
    }
  }

  return (
    <>
      {mode === 'banners' && others.length > 0 && (
        <div className="mb-2 flex flex-col gap-2">
          {others.map((a) => {
            const who = members.find((m) => m.id === a.member_id)
            const claimer = claimerName(a, members)
            const mine = me && a.claimed_by === me.id
            const urgent = a.level !== 'ping'
            return (
              <div key={a.id} className="glass animate-enter rounded-2xl p-3 shadow-e2">
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      urgent ? 'bg-danger text-white' : 'bg-status-checkin/15 text-status-checkin'
                    }`}
                  >
                    <AlertTriangleIcon width={18} height={18} strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-lg font-medium leading-snug ${urgent ? 'text-status-alert' : 'text-ink'}`}>
                      {alertTitle(a, who?.name ?? 'Someone')}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-dim">
                      {mine ? "You're on it" : claimer ? `${claimer} is on it` : 'Nobody has answered yet'}
                      {' · '}
                      {whereIs(who, position)}
                      {' · '}
                      {timeAgo(a.created_at)}
                    </p>
                  </div>
                </div>
                {(mine || (!claimer && !mine)) && (
                  <div className="mt-2 flex justify-end gap-1">
                    {mine && who && hasLocation(who) && (
                      <a href={mapsLink(who)} target="_blank" rel="noreferrer" className="flex h-9 items-center rounded-full px-3 text-sm font-medium text-primary-ink">
                        Directions
                      </a>
                    )}
                    {mine && (
                      <button
                        disabled={working !== null}
                        onClick={() => void act('r' + a.id, "Couldn't mark found", () => resolveAlert(a.id))}
                        className="flex h-9 items-center gap-1 rounded-full bg-safe px-4 text-sm font-medium text-black disabled:opacity-60"
                      >
                        <CheckIcon width={16} height={16} strokeWidth={2.5} />
                        {working === 'r' + a.id ? 'Saving…' : 'Found them'}
                      </button>
                    )}
                    {!claimer && !mine && (
                      <button
                        disabled={working !== null}
                        onClick={() => void act('c' + a.id, "Couldn't claim", () => claimAlert(a.id))}
                        className="flex h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-on disabled:opacity-60"
                      >
                        {working === 'c' + a.id ? 'Saving…' : "I'm on it"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {mode === 'overlay' && incoming && snackbar && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[1950] flex justify-center px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div role="alert" className="pointer-events-auto w-full max-w-[calc(430px-1.5rem)] animate-enter rounded-xl bg-inverse p-3 pl-4 text-inverse-on shadow-e3">
            <p className="text-lg font-medium">{alertTitle(incoming, sender?.name ?? 'A friend')}</p>
            <p className="mt-0.5 text-xs opacity-80">
              {whereIs(sender, position)} · their pin is highlighted on the map
            </p>
            <div className="mt-2 flex justify-end gap-1">
              <button onClick={() => snooze(incoming)} className="flex h-9 items-center rounded-full px-3 text-sm font-medium opacity-90">
                Not now
              </button>
              <button
                disabled={working !== null}
                onClick={() => void act('c' + incoming.id, "Couldn't claim", () => claimAlert(incoming.id))}
                className="flex h-9 items-center rounded-full px-3 text-sm font-medium text-primary dark:text-primary-ink"
              >
                {working === 'c' + incoming.id ? 'Saving…' : "I'm on it"}
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === 'overlay' && incoming && !snackbar && (
        <AlertOverlay
          key={incoming.id + incoming.level}
          tone={incoming.level === 'ping' ? 'findMe' : 'alert'}
          title={alertTitle(incoming, sender?.name ?? 'A friend')}
          body={
            <>
              <p className="text-2xl font-medium">
                {incoming.level !== 'ping'
                  ? '“I need help”'
                  : incoming.type === 'manual'
                    ? `“${incoming.message ?? 'Come find me'}”`
                    : incoming.message}
              </p>
              <p className="mt-3">{whereIs(sender, position)}</p>
              {incoming.level !== 'ping' && <p className="mt-2">Their guardian has been alerted.</p>}
            </>
          }
          footer={
            <div className="grid grid-cols-2 gap-3">
              {sender && hasLocation(sender) ? (
                <a href={mapsLink(sender)} target="_blank" rel="noreferrer" className="flex min-h-[52px] items-center justify-center rounded-full bg-black/15 font-medium">
                  Open in Maps
                </a>
              ) : (
                <span />
              )}
              <button onClick={() => snooze(incoming)} className="min-h-[52px] rounded-full bg-black/15 font-medium">
                Not right now
              </button>
            </div>
          }
          onAction={() => void act('c' + incoming.id, "Couldn't claim", () => claimAlert(incoming.id))}
        />
      )}
    </>
  )
}
