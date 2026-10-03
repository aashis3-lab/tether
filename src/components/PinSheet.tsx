import { useEffect, useState } from 'react'
import { placeName } from '@/lib/geo'
import { supabase } from '@/lib/supabase'
import type { LatLng, Pin } from '@/lib/types'
import { Button, ErrorText, Field, Sheet } from './ui'

/**
 * Name a new venue pin, or rename / remove an existing one, mid-night.
 * Pins sync to everyone through Realtime and feed the automatic rules.
 */
export function PinSheet({
  sessionId,
  draft,
  pin,
  onClose,
}: {
  sessionId: string
  /** New pin location (long-press / "+ Add pin"). */
  draft?: LatLng | null
  /** Existing pin to edit. */
  pin?: Pin | null
  onClose: () => void
}) {
  const [name, setName] = useState(pin?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Suggest a name for a new pin from what's there.
  useEffect(() => {
    if (!pin && draft) void placeName(draft).then((n) => n && setName((cur) => cur || n))
  }, [pin, draft])

  async function save() {
    setBusy(true)
    setError('')
    const clean = name.trim() || 'Venue'
    const { error: err } = pin
      ? await supabase.from('pins').update({ name: clean }).eq('id', pin.id)
      : await supabase.from('pins').insert({ session_id: sessionId, name: clean, lat: draft!.lat, lng: draft!.lng, radius_m: 150 })
    setBusy(false)
    if (err) setError(err.message)
    else onClose()
  }

  async function remove() {
    if (!pin) return
    setBusy(true)
    const { error: err } = await supabase.from('pins').delete().eq('id', pin.id)
    setBusy(false)
    if (err) setError(err.message)
    else onClose()
  }

  return (
    <Sheet open onClose={onClose} title={pin ? 'Edit pin' : 'New pin'}>
      <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="The Lantern" autoFocus />
      <p className="mt-2 text-sm text-ink-dim">Everyone in the group sees it. Leaving a pin's area counts as leaving a venue.</p>
      <div className="mt-2">
        <ErrorText>{error}</ErrorText>
      </div>
      <Button className="mt-3" disabled={busy} onClick={save}>
        {busy ? 'Saving…' : pin ? 'Save' : 'Add pin'}
      </Button>
      {pin && (
        <Button variant="ghost" className="mt-2 text-status-alert" disabled={busy} onClick={remove}>
          Remove pin
        </Button>
      )}
    </Sheet>
  )
}
