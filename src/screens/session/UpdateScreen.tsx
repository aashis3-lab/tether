import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { CheckCircleIcon, PinIcon } from '@/components/icons'
import { Header, Button, ErrorText, Screen, Sheet, Title, inputClass } from '@/components/ui'
import { ACTIVITIES, activityTimeLeft, liveActivity, type ActivityDef, type ActivityKey } from '@/lib/activities'
import { raiseAlert } from '@/lib/alerts'
import { firstName } from '@/lib/format'
import { errorText } from '@/lib/toast'
import { supabase } from '@/lib/supabase'
import { useSessionCtx } from './context'

/**
 * "What's happening?", one status at a time; picking a tile replaces the
 * last one. Short-lived ones expire back to "Accounted for" on their own.
 * Existing rules stay wired: Leaving with a friend quiets the left-alone
 * alert, Heading home starts ETA tracking, Phone dying hands off to a buddy.
 */
export function UpdateScreen() {
  const navigate = useNavigate()
  const { session, members, pins, me, avatars } = useSessionCtx()
  const [picker, setPicker] = useState<null | 'moving' | 'leaving_friend' | 'leaving_new'>(null)
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
    if (def.key === 'moving' || def.key === 'leaving_friend' || def.key === 'leaving_new') setPicker(def.key)
    else void apply(def)
  }

  const def = (k: ActivityKey) => ACTIVITIES.find((a) => a.key === k)!

  return (
    <Screen>
      <Header title="Status" back={back} />
      <Title>What's happening?</Title>
      <p className="mt-1 text-ink-dim">
        {current ? (
          <>
            Now: <span className="font-semibold text-ink">{me?.status_note || current.label}</span>
            {me && activityTimeLeft(me) && <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-sm">{activityTimeLeft(me)} left</span>}
          </>
        ) : (
          'Pick one. It replaces your last update.'
        )}
      </p>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {ACTIVITIES.map((a) => {
          const active = current?.key === a.key || (a.key === 'back' && !current)
          return (
            <button
              key={a.key}
              disabled={busy !== null}
              onClick={() => tap(a)}
              className={`flex items-center justify-center gap-2 rounded-2xl border p-2 text-center transition active:scale-95 ${
                a.key === 'back'
                  ? 'col-span-3 min-h-tap flex-row border-status-calm/50 bg-status-calm/10'
                  : `aspect-square flex-col ${active ? 'border-accent-pink bg-accent-pink/15' : 'border-white/5 bg-bg-card'}`
              }`}
            >
              <span className={a.key === 'back' ? 'text-2xl' : 'text-4xl'} aria-hidden="true">
                {a.emoji}
              </span>
              <span className="text-sm font-bold leading-tight">
                {busy === a.key ? '…' : a.label}
                {a.minutes && a.key !== 'back' && <span className="block text-[11px] font-normal text-ink-faint">{a.minutes} min</span>}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-3">
        <ErrorText>{error}</ErrorText>
      </div>

      {sent && (
        <div className="sticky bottom-3 mt-4 animate-enter rounded-2xl bg-status-calm p-4 text-black shadow-lg">
          <p className="text-lg font-bold">Sent to your group</p>
          <p className="font-medium">{sent}</p>
          <button onClick={() => navigate(back)} className="mt-3 min-h-[48px] w-full rounded-xl bg-black font-bold text-white">
            Back to map
          </button>
        </div>
      )}

      {/* Moving venues: pick one of tonight's places. */}
      <Sheet open={picker === 'moving'} onClose={() => setPicker(null)} title="Moving to…">
        <ul className="divide-y divide-white/5 rounded-xl2 bg-bg-card">
          {pins.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => void apply(def('moving'), { note: `Moving to ${p.name}` })}
                className="flex min-h-tap w-full items-center gap-3 px-4 text-left font-semibold"
              >
                <PinIcon width={18} height={18} className="text-accent-orange" /> {p.name}
              </button>
            </li>
          ))}
          {pins.length === 0 && <li className="px-4 py-4 text-ink-dim">No places yet, add one with “+ Add place” on the map.</li>}
        </ul>
      </Sheet>

      {/* Leaving with a friend: pick from the group (quiets left-alone). */}
      <Sheet open={picker === 'leaving_friend'} onClose={() => setPicker(null)} title="Leaving with…">
        <div className="flex flex-col gap-2">
          {others.map((o) => {
            const on = friends.includes(o.id)
            return (
              <button
                key={o.id}
                onClick={() => setFriends((f) => (on ? f.filter((x) => x !== o.id) : [...f, o.id]))}
                className={`flex min-h-tap items-center gap-3 rounded-xl2 border px-3 text-left ${on ? 'border-accent-pink bg-accent-pink/10' : 'border-white/10 bg-bg-card'}`}
              >
                <Avatar name={o.name} url={avatars[o.id]} size={36} />
                <span className="flex-1 font-semibold">{firstName(o.name)}</span>
                {on && <CheckCircleIcon width={20} height={20} className="text-accent-pink" />}
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
        <p className="mt-2 text-center text-base text-ink-dim">Keeps the left-alone alert quiet.</p>
      </Sheet>

      {/* Leaving with someone new: their name (checks stay on). */}
      <Sheet open={picker === 'leaving_new'} onClose={() => setPicker(null)} title="Leaving with someone new">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Their name" className={inputClass} autoFocus />
        <p className="mt-2 text-base text-ink-dim">They're not in your group, so automatic check-ins stay on.</p>
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
