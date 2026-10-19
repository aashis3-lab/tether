import { useEffect, useState } from 'react'
import { distanceM, formatDistance } from '@/lib/geo'
import type { Destination } from '@/lib/nightDraft'
import { nearbyPlacesLive, placesAvailable, searchPlaces } from '@/lib/places'
import { supabase } from '@/lib/supabase'
import { attempt } from '@/lib/toast'
import type { LatLng, Pin } from '@/lib/types'
import { MapPickIcon, PinIcon, SearchIcon, XIcon } from './icons'
import { PlaceKindIcon } from './PlaceKindIcon'
import { Button, ErrorText, Field, Sheet } from './ui'

/**
 * "+ Add place" during a party: search, nearby bars/restaurants, or pick on
 * the map. Picking anything goes to a short confirm step with an editable
 * name. Existing pins are listed with Remove.
 */
export function AddPlaceSheet({
  sessionId,
  pins,
  near,
  onPickOnMap,
  onClose,
}: {
  sessionId: string
  pins: Pin[]
  near: LatLng | null
  onPickOnMap: () => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Destination[]>([])
  const [nearby, setNearby] = useState<Destination[] | null>(null)
  const [chosen, setChosen] = useState<Destination | null>(null)

  useEffect(() => {
    void nearbyPlacesLive(near, setNearby).then((l) => setNearby(l))
    // Load once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    const t = window.setTimeout(async () => setResults(await searchPlaces(query, near)), 300)
    return () => window.clearTimeout(t)
  }, [query, near])

  if (chosen) {
    return <ConfirmPlace sessionId={sessionId} place={chosen} onBack={() => setChosen(null)} onDone={onClose} />
  }

  const list = query.trim() ? results : nearby ?? []

  return (
    <Sheet open onClose={onClose} title="Add place">
      <label className="flex min-h-tap items-center gap-3 rounded-xl border border-line bg-surface-high/70 px-4">
        <SearchIcon width={20} height={20} className="shrink-0 text-ink-dim" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placesAvailable ? 'Search a bar, restaurant or address' : import.meta.env.DEV ? 'Search needs VITE_MAPTILER_KEY' : 'Search is unavailable right now'}
          className="min-h-tap w-full bg-transparent text-lg placeholder:text-ink-faint focus:outline-none"
        />
      </label>

      <button
        onClick={onPickOnMap}
        className="mt-3 flex min-h-tap w-full items-center gap-3 rounded-xl bg-accent-pink/15 px-4 text-left font-semibold text-primary-ink"
      >
        <MapPickIcon width={22} height={22} />
        Pick on map
      </button>

      <p className="mb-2 mt-5 text-base font-bold">
        {query.trim() ? 'Results' : 'Nearby'}
      </p>
      <ul className="divide-y divide-line/70 rounded-xl bg-surface-high/70">
        {list.map((d) => (
          <li key={`${d.name}-${d.lat}-${d.lng}`}>
            <button onClick={() => setChosen(d)} className="flex min-h-tap w-full items-center gap-3 px-4 py-3 text-left">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink/5 text-secondary-ink">
                <PlaceKindIcon kind={d.kind} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{d.name}</span>
                {d.address && <span className="block truncate text-base text-ink-dim">{d.address}</span>}
              </span>
              {near && <span className="shrink-0 text-base text-ink-dim">{formatDistance(distanceM(near, d))}</span>}
            </button>
          </li>
        ))}
        {!query.trim() && nearby === null && <li className="px-4 py-4 text-ink-dim">Finding places near you…</li>}
        {!query.trim() && nearby?.length === 0 && (
          <li className="px-4 py-4 text-ink-dim">{near ? 'No bars or restaurants found nearby.' : 'Turn on location to see places near you.'}</li>
        )}
      </ul>

      {pins.length > 0 && (
        <>
          <p className="mb-2 mt-5 text-base font-bold">Your places</p>
          <ul className="divide-y divide-line/70 rounded-xl bg-surface-high/70">
            {pins.map((p) => (
              <li key={p.id} className="flex min-h-[52px] items-center gap-3 px-4">
                <PinIcon width={18} height={18} className="shrink-0 text-secondary-ink" />
                <span className="flex-1 truncate font-semibold">{p.name}</span>
                <button
                  onClick={() => void attempt("Couldn't remove place", supabase.from('pins').delete().eq('id', p.id))}
                  className="flex min-h-[44px] items-center gap-1 px-2 text-sm font-semibold text-status-alert"
                >
                  <XIcon width={14} height={14} /> Remove
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  )
}

/** Editable name + "Add place". Also used by Pick on map. */
export function ConfirmPlace({
  sessionId,
  place,
  onBack,
  onDone,
}: {
  sessionId: string
  place: Destination
  onBack: () => void
  onDone: () => void
}) {
  const [name, setName] = useState(place.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function add() {
    setBusy(true)
    const { error: err } = await supabase
      .from('pins')
      .insert({ session_id: sessionId, name: name.trim() || 'Place', lat: place.lat, lng: place.lng, radius_m: 150, kind: place.kind ?? null })
    setBusy(false)
    if (err) setError(err.message)
    else onDone()
  }

  return (
    <Sheet open onClose={onBack} title="Add this place">
      <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      {place.address && <p className="mt-2 text-ink-dim">{place.address}</p>}
      <div className="mt-2">
        <ErrorText>{error}</ErrorText>
      </div>
      <Button big className="mt-4" disabled={busy} onClick={add}>
        {busy ? 'Adding…' : 'Add place'}
      </Button>
      <Button variant="text" className="mt-1" onClick={onBack}>
        Back
      </Button>
    </Sheet>
  )
}
