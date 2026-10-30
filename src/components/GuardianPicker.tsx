import { useEffect, useState } from 'react'
import { normalizePhone } from '@/auth/phoneAuth'
import { supabase } from '@/lib/supabase'
import type { Contact } from '@/lib/types'
import { CheckIcon } from './icons'
import { Field } from './ui'

/**
 * "Your guardian tonight": one tap to pick one of your emergency contacts
 * (primary preselected), or "Someone else" to type a name + number.
 */
export function GuardianPicker({
  contacts,
  value,
  onChange,
  heading = true,
}: {
  contacts: Contact[]
  value: Contact
  onChange: (c: Contact) => void
  heading?: boolean
}) {
  const matches = (c: Contact) => c.name === value.name && c.phone === value.phone
  const [custom, setCustom] = useState(contacts.length === 0 || !contacts.some(matches))

  return (
    <div>
      {heading && (
        <>
          <h2 className="text-lg font-semibold">Your guardian tonight</h2>
          <p className="mb-3 text-ink-dim">A sober person on Tether who gets a notification only if you need help.</p>
        </>
      )}

      <div className="flex flex-col gap-2">
        {contacts.map((c, i) => {
          const selected = !custom && matches(c)
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                setCustom(false)
                onChange(c)
              }}
              className={`flex min-h-tap items-center gap-3 rounded-xl2 border bg-bg-card px-4 py-2 text-left ${
                selected ? 'border-accent-pink' : 'border-white/10'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold">{c.name}</p>
                <p className="truncate text-base text-ink-dim">{c.phone}</p>
              </div>
              {selected && <CheckIcon className="text-accent-pink" />}
            </button>
          )
        })}

        {contacts.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setCustom(true)
              onChange({ name: '', phone: '' })
            }}
            className={`flex min-h-tap items-center rounded-xl2 border bg-bg-card px-4 text-left text-lg font-semibold ${
              custom ? 'border-accent-pink' : 'border-white/10'
            }`}
          >
            Someone else
          </button>
        )}
      </div>

      {custom && (
        <div className="mt-4 flex flex-col gap-4">
          <Field label="Guardian name" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
          <Field
            label="Guardian phone"
            type="tel"
            value={value.phone}
            onChange={(e) => onChange({ ...value, phone: e.target.value })}
          />
        </div>
      )}

      <Reachability phone={value.phone} name={value.name} />
    </div>
  )
}

type Reach = 'ready' | 'no_push' | 'not_on_tether'

/** Guardians get alerts as Tether notifications, so say if this one can't. */
function Reachability({ phone, name }: { phone: string; name: string }) {
  const [reach, setReach] = useState<Reach | null>(null)
  const digits = phone.replace(/\D/g, '')

  useEffect(() => {
    setReach(null)
    if (digits.length < 10) return
    let live = true
    const t = window.setTimeout(() => {
      void supabase.rpc('guardian_reachability', { p_phone: normalizePhone(phone) }).then(({ data }) => {
        if (live && data) setReach(data as Reach)
      })
    }, 400)
    return () => {
      live = false
      window.clearTimeout(t)
    }
  }, [phone, digits.length])

  if (!reach) return null
  const who = name.trim() || 'Your guardian'
  if (reach === 'ready') return <p className="mt-3 text-sm font-semibold text-status-calm">{who} is on Tether and will get alerts.</p>
  return (
    <p className="mt-3 rounded-xl2 bg-status-checkin/10 px-3 py-2 text-sm font-semibold text-status-checkin">
      {reach === 'no_push'
        ? `${who} is on Tether but has notifications off, so they won't get alerts.`
        : `${who} isn't on Tether yet, so they won't get alerts. Ask them to sign up with this number.`}
    </p>
  )
}
