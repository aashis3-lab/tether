import { useEffect, useRef, useState } from 'react'
import { AlertOverlay } from './AlertOverlay'
import { BatteryHandoff } from './BatteryHandoff'
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

function whereIs(target: Member | undefined, from: LatLng | null) {
  if (!target || !hasLocation(target)) return 'Location unavailable'
  if (!from) return `Last seen ${timeAgo(target.last_updated)}`
  return `${formatDistance(distanceM(from, target))} ${compass(from, target)} of you`
}

/**
 * Receiver side of the ladder: full-screen overlay for alerts aimed at me,
 * plus a status strip for every open alert (and a "Found them" card once I've
 * claimed one).
 */
export function IncomingAlerts({
  alerts,
  members,
  me,
  userId,
  position,
  mode,
}: {
  alerts: Alert[]
  members: Member[]
  me: Member | undefined
  userId: string | null
  position: LatLng | null
  /** 'banners' = inline status strips (main screen); 'overlay' = full-screen takeover (session shell). */
  mode: 'banners' | 'overlay'
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

  if (mode === 'overlay') {
    if (!incoming) return null
    if (incoming.type === 'battery' && sender) {
      return <BatteryHandoff alert={incoming} member={sender} me={me} onClose={() => snooze(incoming)} />
    }
  }

  return (
    <>
      {mode === 'banners' && others.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {others.map((a) => {
            const who = members.find((m) => m.id === a.member_id)
            const claimer = claimerName(a, members)
            const mine = me && a.claimed_by === me.id
            return (
              <div key={a.id} className="rounded-xl2 border border-status-alert/60 bg-status-alert/15 p-4">
                <p className="text-xl font-bold text-status-alert">
                  {a.level === 'emergency' ? '🚨 ' : ''}
                  {alertTitle(a, who?.name ?? 'Someone')}
                </p>
                <p className="mt-1 text-lg">
                  {mine ? "You're on it" : claimer ? `${claimer} is on it` : 'Nobody has answered yet'}
                  {' · '}
                  {whereIs(who, position)}
                </p>
                {mine && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {who && hasLocation(who) && (
                      <a href={mapsLink(who)} target="_blank" rel="noreferrer" className="flex min-h-tap items-center justify-center rounded-xl2 bg-bg-card font-semibold">
                        Directions
                      </a>
                    )}
                    <button
                      disabled={working !== null}
                      onClick={() => void act('r' + a.id, "Couldn't mark found", () => resolveAlert(a.id))}
                      className="min-h-tap rounded-xl2 bg-status-calm font-bold text-black disabled:opacity-60"
                    >
                      {working === 'r' + a.id ? 'Saving...' : 'Found them ✓'}
                    </button>
                  </div>
                )}
                {!claimer && !mine && (
                  <button
                    disabled={working !== null}
                    onClick={() => void act('c' + a.id, "Couldn't claim", () => claimAlert(a.id))}
                    className="mt-3 min-h-tap w-full rounded-xl2 bg-black font-bold text-white disabled:opacity-60"
                  >
                    {working === 'c' + a.id ? 'Saving...' : "I'm on it"}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {mode === 'overlay' && incoming && (
        <AlertOverlay
          key={incoming.id + incoming.level}
          title={alertTitle(incoming, sender?.name ?? 'A friend')}
          body={
            <>
              <p className="text-2xl font-bold">
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
                <a href={mapsLink(sender)} target="_blank" rel="noreferrer" className="flex min-h-tap items-center justify-center rounded-2xl bg-black/15 font-bold">
                  Open in Maps
                </a>
              ) : (
                <span />
              )}
              <button
                onClick={() => snooze(incoming)}
                className="min-h-tap rounded-2xl bg-black/15 font-bold"
              >
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
