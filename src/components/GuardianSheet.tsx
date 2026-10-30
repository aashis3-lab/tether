import { useEffect, useState } from 'react'
import type { Contact } from '@/lib/types'
import { GuardianPicker } from './GuardianPicker'
import { Button, Sheet } from './ui'

/**
 * "Who's your at-home guardian tonight?", asked every time you start or
 * join a night. Pre-selects `initial` (defaults to your emergency contact).
 */
export function GuardianSheet({
  open,
  contacts,
  initial,
  confirmLabel = 'Confirm guardian',
  onClose,
  onConfirm,
}: {
  open: boolean
  contacts: Contact[]
  initial: Contact | null
  confirmLabel?: string
  onClose: () => void
  onConfirm: (c: Contact) => void
}) {
  const [value, setValue] = useState<Contact>(initial ?? contacts[0] ?? { name: '', phone: '' })

  useEffect(() => {
    if (open) setValue(initial ?? contacts[0] ?? { name: '', phone: '' })
    // Reset to the default each time it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const ok = value.name.trim() && value.phone.trim()

  return (
    <Sheet open={open} onClose={onClose} title="Who's your at-home guardian tonight?">
      <GuardianPicker contacts={contacts} value={value} onChange={setValue} heading={false} />
      <Button className="mt-5" disabled={!ok} onClick={() => onConfirm({ name: value.name.trim(), phone: value.phone.trim() })}>
        {confirmLabel}
      </Button>
    </Sheet>
  )
}
