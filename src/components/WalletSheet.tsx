import type { Member, Profile } from '@/lib/types'
import { formatPhone } from '@/auth/phoneAuth'
import { profileContacts } from '@/lib/profile'
import { PhoneIcon } from './icons'
import { Sheet } from './ui'

/** Wallet card (spec screen 6): what a stranger or EMS would need. Built to be read by someone helping you. */
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
  const contacts = profileContacts(profile)
  const rows: { label: string; value: string; phone?: string | null }[] = [
    { label: 'Name', value: profile?.name ?? me?.name ?? '' },
    ...(contacts.length
      ? contacts.map((c) => ({ label: 'Emergency contact', value: c.name, phone: c.phone }))
      : [{ label: 'Emergency contact', value: 'Not set' }]),
    me?.guardian_name
      ? { label: 'Guardian tonight', value: me.guardian_name, phone: me.guardian_phone }
      : { label: 'Guardian tonight', value: 'Not set' },
    { label: 'Home', value: profile?.home_address ?? 'Not set' },
    { label: 'Medical info', value: profile?.medical_info || 'None on file' },
  ]
  return (
    <Sheet open={open} onClose={onClose} title="Safety card">
      <dl className="flex flex-col divide-y divide-black/10 rounded-2xl bg-white px-5 py-2 text-black">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <dt className="text-sm font-bold uppercase tracking-wide text-black/60">{r.label}</dt>
              <dd className="break-words text-2xl font-bold leading-tight">{r.value}</dd>
              {r.phone && <dd className="text-lg font-semibold text-black/80">{formatPhone(r.phone)}</dd>}
            </div>
            {r.phone && (
              <a
                href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}
                aria-label={`Call ${r.value}`}
                className="flex min-h-[56px] shrink-0 items-center gap-2 rounded-full bg-black px-5 text-lg font-bold text-white active:scale-95"
              >
                <PhoneIcon width={20} height={20} strokeWidth={2.2} /> Call
              </a>
            )}
          </div>
        ))}
      </dl>
      <p className="mt-3 text-base text-ink-dim">Show this screen if someone is helping you.</p>
    </Sheet>
  )
}
