import { useState } from 'react'
import { displayPhone, parsePhone, phoneError } from '@/lib/phone'
import type { Contact } from '@/lib/types'
import { Avatar } from './Avatar'
import { PlusIcon } from './icons'
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
          <h2 className="text-xl font-medium">Your guardian tonight</h2>
          <p className="mb-3 text-base text-ink-dim">A sober person who gets a text only if you need help.</p>
        </>
      )}

      <div className="divide-y divide-line/70 overflow-hidden rounded-2xl bg-surface-lowest dark:bg-surface-mid" role="radiogroup">
        {contacts.map((c, i) => {
          const selected = !custom && matches(c)
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setCustom(false)
                onChange(c)
              }}
              className={`flex min-h-[64px] w-full items-center gap-4 px-4 py-2 text-left transition-colors ${selected ? 'bg-primary-container/50' : ''}`}
            >
              <Avatar name={c.name} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg">{c.name}</p>
                <p className="truncate text-xs text-ink-dim">
                  {displayPhone(c.phone)}
                  {i === 0 ? ' · emergency contact' : ''}
                </p>
              </div>
              <Radio on={selected} />
            </button>
          )
        })}

        {contacts.length > 0 && (
          <button
            type="button"
            role="radio"
            aria-checked={custom}
            onClick={() => {
              setCustom(true)
              onChange({ name: '', phone: '' })
            }}
            className={`flex min-h-[56px] w-full items-center gap-4 px-4 text-left transition-colors ${custom ? 'bg-primary-container/50' : ''}`}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-high text-ink-dim">
              <PlusIcon width={20} height={20} />
            </span>
            <span className="flex-1 text-lg">Someone else</span>
            <Radio on={custom} />
          </button>
        )}
      </div>

      {custom && (
        <div className="mt-4 flex flex-col gap-4">
          <Field label="Guardian name" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
          <div>
            <Field
              label="Guardian phone"
              type="tel"
              inputMode="tel"
              placeholder="(555) 123-4567"
              value={value.phone}
              onChange={(e) => onChange({ ...value, phone: e.target.value })}
              onBlur={() => {
                const e164 = parsePhone(value.phone)
                if (e164) onChange({ ...value, phone: displayPhone(e164) })
              }}
              aria-invalid={Boolean(phoneError(value.phone))}
            />
            {phoneError(value.phone) && <p className="mt-1.5 px-1 text-xs text-status-alert">{phoneError(value.phone)}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

/** Material radio indicator. */
function Radio({ on }: { on: boolean }) {
  return (
    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-primary' : 'border-outline'}`}>
      {on && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
    </span>
  )
}
