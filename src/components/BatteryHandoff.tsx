import { useEffect, useState } from 'react'
import { claimAlert } from '@/lib/alerts'
import { firstName } from '@/lib/format'
import { tryOrToast } from '@/lib/toast'
import { hasLocation, placeName } from '@/lib/geo'
import { formatClock } from '@/lib/time'
import type { Alert, Member } from '@/lib/types'
import { ArrowLeftIcon, BatteryIcon, UsersIcon } from './icons'
import { Eyebrow, IconButton, InfoCard } from './ui'
import { buttonClass } from './buttons'

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
    <div className="fixed inset-0 z-[2000] flex animate-fade-in justify-center bg-surface">
      <div className="flex w-full max-w-app flex-col overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="-mx-1 mb-3 flex min-h-[56px] items-center gap-1">
          <IconButton label="Not now" onClick={onClose} className="text-ink">
            <ArrowLeftIcon width={22} height={22} strokeWidth={2} />
          </IconButton>
          <h1 className="pl-1 text-2xl">Phone dying</h1>
        </div>

        <Eyebrow>{level != null ? `${level}% battery` : 'Phone dying'}</Eyebrow>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
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
            className={buttonClass('primary')}
          >
            <UsersIcon width={22} height={22} />
            I'm staying with {name}
          </button>
          <p className="mt-3 text-center text-base text-ink-dim">Acknowledge so the group and {guardian} know you're the buddy.</p>
        </div>
      </div>
    </div>
  )
}
