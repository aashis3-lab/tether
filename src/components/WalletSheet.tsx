import type { Member, Profile } from '@/lib/types'
import { Sheet } from './ui'

/** Wallet card (spec screen 6): what a stranger or EMS would need. */
export function WalletSheet({
  open,
  onClose,
  profile,
  me,
}: {
  open: boolean
  onClose: () => void
  profile: Profile | null
  me: Member | undefined
}) {
  const rows: [string, string][] = [
    ['Name', profile?.name ?? me?.name ?? ''],
    [
      'Emergency contact',
      profile?.emergency_contact_name
        ? `${profile.emergency_contact_name} · ${profile.emergency_contact_phone ?? ''}`
        : 'Not set',
    ],
    ['Guardian tonight', me?.guardian_name ? `${me.guardian_name} · ${me.guardian_phone ?? ''}` : 'Not set'],
    ['Home', profile?.home_address ?? 'Not set'],
    ['Medical info', profile?.medical_info || 'None on file'],
  ]
  return (
    <Sheet open={open} onClose={onClose} title="Safety card">
      <div className="overflow-hidden rounded-xl2 bg-brand-br p-[2px]">
        <dl className="flex flex-col gap-3 rounded-[0.65rem] bg-bg-card p-5">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-bold uppercase tracking-wide text-ink-faint">{k}</dt>
              <dd className="text-lg font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="mt-3 text-base text-ink-dim">Show this screen if someone is helping you.</p>
    </Sheet>
  )
}
