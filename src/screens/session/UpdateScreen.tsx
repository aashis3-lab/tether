import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { BatteryIcon, CarIcon, CheckCircleIcon, HomeIcon, UserIcon, UsersIcon } from '@/components/icons'
import { Header, Button, ErrorText, Screen, Sheet, Title, inputClass } from '@/components/ui'
import { buttonClass } from '@/components/buttons'
import { ACTIVITIES, STATUS_CHOICES, activityTimeLeft, liveActivity, type ActivityDef, type ActivityKey } from '@/lib/activities'
import { raiseAlert } from '@/lib/alerts'
import { firstName } from '@/lib/format'
import { errorText } from '@/lib/toast'
import { supabase } from '@/lib/supabase'
import { useSessionCtx } from './context'

/** Icon and one-line explanation for each status in the list. */
const STATUS_META: Partial<Record<ActivityKey, { icon: ReactNode; desc: string }>> = {
  heading_home: { icon: <HomeIcon width={20} height={20} />, desc: 'Pick how, see your ETA; Tether watches until you arrive' },
  leaving_new: { icon: <UserIcon width={20} height={20} />, desc: "Someone outside the group; check-ins stay on" },
  leaving_friend: { icon: <UsersIcon width={20} height={20} />, desc: 'With someone from your group; keeps alerts quiet' },
  ride: { icon: <CarIcon width={20} height={20} />, desc: 'Waiting on a car' },
  phone_dying: { icon: <BatteryIcon width={20} height={20} />, desc: 'A friend is asked to stay with you' },
}

/**
 * "What's happening?", one status at a time; picking a tile replaces the
 * last one. Only the night-out-ending statuses are offered; "Back with
 * group" is pinned to the bottom. Older statuses (Bathroom, Dancing, …) still
 * display for anyone who has one, and short-lived ones expire on their own.
 * Existing rules stay wired: Leaving with a friend quiets the left-alone
 * alert, Heading home starts ETA tracking, Phone dying hands off to a buddy.
 */
export function UpdateScreen() {
  const navigate = useNavigate()
  const { session, members, me, avatars } = useSessionCtx()
  const [picker, setPicker] = useState<null | 'leaving_friend' | 'leaving_new'>(null)
  const [friends, setFriends] = useState<string[]>([])
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState<ActivityKey | null>(null)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<string | null>(null)
  const back = `/session/${session.id}`
  const current = me ? liveActivity(me) : null
  const others = members.filter((m) => m.id !== me?.id && m.status !== 'home')

  async function apply(def: ActivityDef, detail?: { note?: string; leavingWith?: string[] }) {
    if (!me) return
    setBusy(def.key)
    setError('')
    const keepStatus = me.status === 'needs_help' || me.status === 'home'
    const patch =
      def.key === 'back'
        ? {
            activity: null,
            activity_until: null,
            status_note: null,
            leaving_with: [] as string[],
            eta: null,
            ...(keepStatus ? {} : { status: 'together' }),
          }
        : {
            activity: def.key,
            activity_until: def.minutes ? new Date(Date.now() + def.minutes * 60_000).toISOString() : null,
            status_note: detail?.note ?? def.label,
            // Only a group friend counts as a hand-off; heading home is tracked by ETA.
            leaving_with: def.key === 'leaving_friend' ? detail?.leavingWith ?? [] : def.key === 'heading_home' ? ['solo'] : [],
            eta: null,
            ...(keepStatus ? {} : { status: def.key === 'heading_home' ? 'heading_home' : 'together' }),
          }
    const { error: err } = await supabase.from('session_members').update(patch).eq('id', me.id)
    if (!err && def.key === 'phone_dying') {
      // Same buddy hand-off as the automatic low-battery rule.
      await raiseAlert(me.id, 'ping', { type: 'battery', message: `${firstName(me.name)}'s phone is dying. Stay with ${firstName(me.name)}.` }).catch(() => undefined)
    }
    setBusy(null)
    setPicker(null)
    if (err) {
      setError(errorText(err))
      return
    }
    // Confirm on screen (the grid also highlights the new status from live data).
    setSent(def.key === 'back' ? 'Back with the group' : detail?.note ?? def.label)
  }

  function tap(def: ActivityDef) {
    // Heading home asks how you're getting there, shows home + ETA, and starts arrival tracking.
    if (def.key === 'heading_home') navigate(`${back}/home`)
    else if (def.key === 'leaving_friend' || def.key === 'leaving_new') setPicker(def.key)
    else void apply(def)
  }

  const def = (k: ActivityKey) => ACTIVITIES.find((a) => a.key === k)!

  return (
    <Screen>
      <Header title="Status" back={back} />
      <Title>What's happening?</Title>
      <p className="mt-1 text-base text-ink-dim">
        {current ? (
          <>
            Now: <span className="font-medium text-ink">{me?.status_note || current.label}</span>
            {me && activityTimeLeft(me) && <span className="ml-2 rounded-full bg-secondary-container px-2 py-0.5 text-xs text-secondary-on-container">{activityTimeLeft(me)} left</span>}
          </>
        ) : (
          'Pick one. It replaces your last update.'
        )}
      </p>

      <div className="mt-5 divide-y divide-line/70 overflow-hidden rounded-2xl bg-surface-lowest dark:bg-surface-mid" role="radiogroup" aria-label="Your status">
        {STATUS_CHOICES.map((k) => {
          const a = def(k)
          const active = current?.key === a.key
          const meta = STATUS_META[a.key]
          return (
            <button
              key={a.key}
              role="radio"
              aria-checked={active}
              aria-label={`Set status: ${a.label}`}
              disabled={busy !== null}
              onClick={() => tap(a)}
              className={`flex min-h-[64px] w-full items-center gap-4 px-4 py-3 text-left transition-colors disabled:opacity-40 ${
                active ? 'bg-primary-container/50' : 'hover:bg-ink/[0.04]'
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  a.key === 'leaving_new' ? 'bg-status-checkin/15 text-status-checkin' : 'bg-secondary-container/70 text-secondary-on-container'
                }`}
              >
                {meta?.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg">{busy === a.key ? 'Saving…' : a.label}</span>
                {meta && <span className="block text-xs text-ink-dim">{meta.desc}</span>}
              </span>
              {active && <CheckCircleIcon width={20} height={20} className="shrink-0 text-primary-ink" />}
            </button>
          )
        })}
      </div>

      <div className="mt-3">
        <ErrorText>{error}</ErrorText>
      </div>

      {/* Room so the pinned bar never covers the last tile. */}
      <div className={sent ? 'h-64' : 'h-28'} aria-hidden="true" />

      {/* Pinned to the bottom: confirmation (after an update) and Back with group. */}
      <div className="fixed inset-x-0 bottom-0 z-[900] flex justify-center">
        <div className="w-full max-w-app bg-gradient-to-t from-surface via-surface to-surface/0 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6">
          {sent && (
            <div className="mb-3 animate-enter rounded-xl bg-inverse p-4 text-inverse-on shadow-e3" aria-live="polite">
              <p className="text-xs opacity-80">Sent to your group</p>
              <p className="text-lg font-medium">{sent}</p>
              <button onClick={() => navigate(back)} className="mt-3 min-h-tap w-full rounded-full bg-primary text-base font-medium text-primary-on">
                Back to map
              </button>
            </div>
          )}
          <button
            disabled={busy !== null}
            onClick={() => tap(def('back'))}
            aria-pressed={!current}
            aria-label="Set status: Back with group"
            className={buttonClass('safe', true)}
          >
            <CheckCircleIcon width={20} height={20} /> {busy === 'back' ? 'Saving…' : 'Back with group'}
          </button>
        </div>
      </div>

      {/* Leaving with a friend: pick from the group (quiets left-alone). */}
      <Sheet open={picker === 'leaving_friend'} onClose={() => setPicker(null)} title="Leaving with…">
        <div className="flex flex-col gap-2">
          {others.map((o) => {
            const on = friends.includes(o.id)
            return (
              <button
                key={o.id}
                onClick={() => setFriends((f) => (on ? f.filter((x) => x !== o.id) : [...f, o.id]))}
                className={`flex min-h-[56px] items-center gap-3 rounded-xl px-3 text-left transition-colors ${on ? 'bg-primary-container/60' : 'bg-surface-lowest dark:bg-surface-mid'}`}
              >
                <Avatar name={o.name} url={avatars[o.id]} size={36} />
                <span className="flex-1 text-lg">{firstName(o.name)}</span>
                {on && <CheckCircleIcon width={20} height={20} className="text-primary-ink" />}
              </button>
            )
          })}
          {others.length === 0 && <p className="text-ink-dim">Nobody else is here yet.</p>}
        </div>
        <Button
          className="mt-4"
          disabled={friends.length === 0 || busy !== null}
          onClick={() => {
            const names = others.filter((o) => friends.includes(o.id)).map((o) => firstName(o.name))
            void apply(def('leaving_friend'), { note: `Leaving with ${names.join(' & ')}`, leavingWith: friends })
          }}
        >
          Leaving together
        </Button>
        <p className="mt-2 text-center text-xs text-ink-dim">Keeps the left-alone alert quiet.</p>
      </Sheet>

      {/* Leaving with someone new: their name (checks stay on). */}
      <Sheet open={picker === 'leaving_new'} onClose={() => setPicker(null)} title="Leaving with someone new">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Their name" className={inputClass} autoFocus />
        <p className="mt-2 text-xs text-ink-dim">They're not in your group, so automatic check-ins stay on.</p>
        <Button
          className="mt-4"
          disabled={!newName.trim() || busy !== null}
          onClick={() => void apply(def('leaving_new'), { note: `Leaving with ${newName.trim()} (new)` })}
        >
          Send update
        </Button>
      </Sheet>
    </Screen>
  )
}
