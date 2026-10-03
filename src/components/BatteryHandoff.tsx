import { useEffect, useState } from 'react'
import { claimAlert } from '@/lib/alerts'
import { firstName } from '@/lib/format'
import { tryOrToast } from '@/lib/toast'
import { hasLocation, placeName } from '@/lib/geo'
import { formatClock } from '@/lib/time'
import type { Alert, Member } from '@/lib/types'
import { ArrowLeftIcon, BatteryIcon, UsersIcon } from './icons'
import { Eyebrow, InfoCard, headerButton } from './ui'

/**
 * Low-battery buddy handoff (rule C), shown to the friend it's aimed at.
 * "I'm staying with Maya" claims the alert so the group and guardian know.
 */
export function BatteryHandoff({
  alert,
  member,
  me,
  onClose,
}: {
  alert: Alert
  member: Member
  me: Member | undefined
  onClose: () => void
}) {
  const [place, setPlace] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const name = firstName(member.name)
  const guardian = firstName(member.guardian_name) || 'their guardian'
  const parsed = /\((\d+)%\)/.exec(alert.message ?? '')?.[1]
  const level: number | null = member.battery_level ?? (parsed ? Number(parsed) : null)

  useEffect(() => {
    if (hasLocation(member)) void placeName(member).then(setPlace)
    // Look the place up once for this alert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert.id])

  return (
    <div className="fixed inset-0 z-[2000] flex justify-center bg-bg">
      <div className="flex w-full max-w-app flex-col overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="mb-5 grid min-h-tap grid-cols-[3rem_1fr_3rem] items-center">
          <button aria-label="Not now" onClick={onClose} className={headerButton}>
            <ArrowLeftIcon width={20} height={20} />
          </button>
          <p className="text-center text-xl font-bold tracking-tight text-accent-pink">tether</p>
        </div>

        <Eyebrow>{level != null ? `${level}% battery` : 'Phone dying'}</Eyebrow>
        <h1 className="mt-1 text-[2rem] font-bold leading-tight tracking-tight">
          {name}'s phone is dying. Stay with {name}.
        </h1>

        <div className="mt-5 flex flex-col gap-3">
          <InfoCard heading="Buddy handoff • Waiting" headingClass="text-status-alert" icon={<BatteryIcon width={18} height={18} />}>
            Stay together. After you tap, {guardian} can reach {name} through you if {name}'s phone goes offline.
          </InfoCard>
          <InfoCard heading="LAST KNOWN LOCATION SAVED" headingClass="text-status-checkin">
            <p className="font-semibold text-ink">
              {hasLocation(member) ? place ?? 'Looking up the spot…' : 'No location yet'} • {formatClock(member.last_updated)}
            </p>
            <p className="mt-1 text-sm">This saved location is not live after {name}'s phone dies.</p>
          </InfoCard>
          <InfoCard heading={`SMS TO ${guardian.toUpperCase()} • SAMPLE`} headingClass="text-status-checkin">
            “{level != null ? `${name}'s battery is at ${level}%.` : `${name}'s phone is dying.`} {firstName(me?.name) || 'A friend'} has been asked to stay with {name}. We'll confirm when they
            acknowledge.”
          </InfoCard>
        </div>

        <div className="mt-auto pt-6">
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await tryOrToast("Couldn't confirm", () => claimAlert(alert.id))
              setBusy(false)
            }}
            className="flex min-h-tap w-full items-center justify-center gap-3 rounded-xl2 bg-gradient-to-r from-accent-pink to-accent-orange text-lg font-bold text-white active:scale-[0.98]"
          >
            <UsersIcon width={22} height={22} />
            I'm staying with {name}
          </button>
          <p className="mt-3 text-center text-sm text-ink-dim">Acknowledge so the group and {guardian} know you're the buddy.</p>
        </div>
      </div>
    </div>
  )
}
