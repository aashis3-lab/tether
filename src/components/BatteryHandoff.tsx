import { useState } from 'react'
import { claimAlert } from '@/lib/alerts'
import { firstName } from '@/lib/format'
import { hasLocation } from '@/lib/geo'
import { tryOrToast } from '@/lib/toast'
import type { Alert, Member } from '@/lib/types'
import { Avatar } from './Avatar'
import { buttonClass } from './buttons'
import { PhoneIcon, UsersIcon, XIcon } from './icons'
import { MapView } from './MapView'

const digits = (p: string) => p.replace(/[^\d+]/g, '')

/**
 * Low-battery buddy handoff (rule C), shown to the friend it's aimed at:
 * "Maya's phone is at 8%", stay with Maya, "I'm with Maya" (claims the alert so
 * the group and guardian know) or "Call Maya", and the last known spot.
 */
export function BatteryHandoff({
  alert,
  member,
  avatar,
  phone,
  onClose,
}: {
  alert: Alert
  member: Member
  avatar?: string | null
  phone?: string | null
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const name = firstName(member.name)
  const parsed = /\((\d+)%\)/.exec(alert.message ?? '')?.[1]
  const level: number | null = member.battery_level ?? (parsed ? Number(parsed) : null)

  return (
    <div className="fixed inset-0 z-[2000] flex animate-fade-in justify-center bg-surface">
      <div className="flex w-full max-w-app flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex justify-end">
          <button onClick={onClose} aria-label="Not now" className="flex h-11 w-11 items-center justify-center rounded-full text-ink-dim">
            <XIcon width={22} height={22} />
          </button>
        </div>

        <div className="flex flex-col items-center text-center">
          <Avatar name={member.name} url={avatar} size={88} ring="ring-4 ring-status-alert/40" />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            {name}'s phone is at {level != null ? `${level}%` : 'low battery'}
          </h1>
          <p className="mt-1 text-lg text-ink-dim">Stay with {name}</p>
        </div>

        {hasLocation(member) && (
          <div className="mt-5 h-40 overflow-hidden rounded-2xl shadow-e1">
            <MapView members={[member]} interactive={false} fitMode="once" topPad={0} />
          </div>
        )}

        <div className="mt-auto flex flex-col gap-2 pt-6">
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await tryOrToast("Couldn't confirm", () => claimAlert(alert.id))
              setBusy(false)
            }}
            className={buttonClass('primary', true)}
          >
            <UsersIcon width={20} height={20} /> I'm with {name}
          </button>
          {phone && (
            <a href={`tel:${digits(phone)}`} className={buttonClass('secondary', true)}>
              <PhoneIcon width={20} height={20} /> Call {name}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
