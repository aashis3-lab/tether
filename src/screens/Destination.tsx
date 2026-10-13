import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircleIcon, ChevronLeftIcon, ClockIcon, PinIcon, SearchIcon, XIcon } from '@/components/icons'
import { PlaceKindIcon } from '@/components/PlaceKindIcon'
import { Button, Screen, Title } from '@/components/ui'
import { StartProgress } from './StartFlow'
import { locationPermission, requestLocation } from '@/lib/device'
import { distanceM, formatDistance, placeName, reverseGeocode } from '@/lib/geo'
import { updateDraft, useNightDraft, type Destination } from '@/lib/nightDraft'
import { nearbyPlacesLive, placesAvailable, recentDestinations, searchPlaces } from '@/lib/places'
import type { LatLng } from '@/lib/types'

const same = (a: Destination, b: Destination) => a.name === b.name && a.address === b.address

/** "Where are you going?", search + suggestions; each pick becomes a venue pin. */
export function DestinationScreen() {
  const navigate = useNavigate()
  const draft = useNightDraft()
  const [picked, setPicked] = useState<Destination[]>(draft.destinations)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Destination[]>([])
  const [searching, setSearching] = useState(false)
  const [here, setHere] = useState<LatLng | null>(null)
  const [nearby, setNearby] = useState<Destination[]>([])
  const [locState, setLocState] = useState<'checking' | 'on' | 'off' | 'denied' | 'locating'>('checking')
  const [current, setCurrent] = useState<Destination | null>(null)
  // Show the search box when nothing is picked yet, or after "Add Destination".
  const [adding, setAdding] = useState(draft.destinations.length === 0)
  const input = useRef<HTMLInputElement>(null)
  const recent = useRef(recentDestinations())

  // Where you actually are -> "Current location" + nearby suggestions.
  async function locate() {
    setLocState('locating')
    const r = await requestLocation()
    if (!r.ok) {
      setLocState(r.reason === 'denied' ? 'denied' : 'off')
      return
    }
    const p = { lat: r.lat, lng: r.lng }
    setHere(p)
    setLocState('on')
    void nearbyPlacesLive(p, setNearby)
    const [name, full] = await Promise.all([placeName(p), reverseGeocode(p)])
    const address = full ? full.split(',').slice(0, 3).join(',').trim() : ''
    setCurrent({ name: name ? `Current location · ${name}` : 'Current location', address, lat: p.lat, lng: p.lng })
  }

  // Only ask the browser on load if permission was already given; otherwise
  // wait for a tap on "Use my current location".
  useEffect(() => {
    void locationPermission().then((s) => {
      if (s === 'granted') void locate()
      else setLocState(s === 'denied' ? 'denied' : 'off')
    })
     
  }, [])

  // Debounced autocomplete.
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    setSearching(true)
    const t = window.setTimeout(async () => {
      setResults(await searchPlaces(query, here))
      setSearching(false)
    }, 300)
    return () => window.clearTimeout(t)
  }, [query, here])

  function pick(d: Destination) {
    setPicked((p) => (p.some((x) => same(x, d)) ? p : [...p, d]))
    setQuery('')
    setResults([])
    setAdding(false)
  }

  const suggestions = [
    ...recent.current.map((d) => ({ d, recent: true })),
    ...nearby.filter((n) => !recent.current.some((r) => same(r, n))).map((d) => ({ d, recent: false })),
  ].filter(({ d }) => !picked.some((p) => same(p, d)))

  return (
    <Screen>
      <button onClick={() => navigate('/')} className="-ml-1 mb-3 flex min-h-[44px] items-center gap-1 font-semibold text-accent-pink">
        <ChevronLeftIcon width={18} height={18} />
        Back
      </button>
      <StartProgress step={1} />
      <Title>Where are you going?</Title>
      <p className="mt-1 text-lg text-ink-dim">Set your destination for the night.</p>

      {(adding || picked.length === 0) && (
        <label className="mt-5 flex min-h-tap items-center gap-3 rounded-xl2 border border-white/15 bg-bg-card px-4">
          <SearchIcon width={20} height={20} className="shrink-0 text-ink-dim" />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placesAvailable ? 'Search address or place' : import.meta.env.DEV ? 'Search needs VITE_MAPTILER_KEY' : 'Search is unavailable right now'}
            disabled={!placesAvailable}
            autoFocus={picked.length > 0}
            className="h-full min-h-tap w-full bg-transparent text-lg placeholder:text-ink-faint focus:outline-none"
          />
        </label>
      )}

      {query.trim() ? (
        <ul className="mt-3 flex flex-col divide-y divide-white/5 rounded-xl2 bg-bg-card">
          {results.map((d) => (
            <PlaceRow key={d.name + d.address} d={d} icon={<PinIcon width={20} height={20} />} onClick={() => pick(d)} />
          ))}
          {!searching && results.length === 0 && <li className="px-4 py-4 text-ink-dim">No matches yet, try adding the city.</li>}
          {searching && results.length === 0 && <li className="px-4 py-4 text-ink-dim">Searching…</li>}
        </ul>
      ) : (
        <>
          {picked.length > 0 && (
            <div className="mt-5 flex flex-col gap-2">
              {picked.map((d) => (
                <div key={d.name + d.address} className="flex min-h-tap items-center gap-3 rounded-xl2 border border-white/10 bg-bg-card px-4 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-pink/20 text-accent-pink">
                    <PinIcon width={18} height={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-semibold">{d.name}</p>
                    <p className="truncate text-sm text-ink-dim">{d.address}</p>
                  </div>
                  {picked.length > 1 ? (
                    <button
                      aria-label={`Remove ${d.name}`}
                      onClick={() => setPicked((p) => p.filter((x) => !same(x, d)))}
                      className="flex h-10 w-10 items-center justify-center text-ink-dim"
                    >
                      <XIcon width={18} height={18} />
                    </button>
                  ) : (
                    <CheckCircleIcon width={22} height={22} className="shrink-0 text-accent-pink" />
                  )}
                </div>
              ))}
            </div>
          )}

          {picked.length > 0 && (
            <button
              onClick={() => {
                setAdding(true)
                window.setTimeout(() => input.current?.focus(), 0)
              }}
              className="mt-4 min-h-[48px] w-full rounded-xl2 bg-disabled/80 font-semibold text-white active:scale-[0.98]"
            >
              Add Destination
            </button>
          )}

          {(
            <>
              <p className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-ink-faint">Suggestions</p>
              <ul className="flex flex-col divide-y divide-white/5 rounded-xl2 bg-bg-card">
                {current && !picked.some((p) => same(p, current)) ? (
                  <PlaceRow d={current} icon={<CrosshairIcon />} onClick={() => pick(current)} />
                ) : !current ? (
                  <li>
                    <button
                      onClick={() => void locate()}
                      disabled={locState === 'locating' || locState === 'checking'}
                      className="flex min-h-tap w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-pink/15 text-accent-pink">
                        <CrosshairIcon />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">
                          {locState === 'locating' || locState === 'checking' ? 'Finding you…' : 'Use my current location'}
                        </span>
                        <span className="block text-sm text-ink-dim">
                          {locState === 'denied'
                            ? 'Location is blocked, turn it on in Settings → Permissions'
                            : 'Also suggests places near you'}
                        </span>
                      </span>
                    </button>
                  </li>
                ) : null}
                {suggestions.map(({ d, recent: r }) => (
                  <PlaceRow
                    key={d.name + d.address}
                    d={d}
                    icon={r ? <ClockIcon width={20} height={20} /> : <PlaceKindIcon kind={d.kind} />}
                    meta={here ? formatDistance(distanceM(here, d)) : undefined}
                    onClick={() => pick(d)}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <div className="mt-auto pt-8">
        <Button
          disabled={picked.length === 0}
          onClick={() => {
            updateDraft({ destinations: picked })
            navigate('/start/when')
          }}
        >
          Next
        </Button>
      </div>
    </Screen>
  )
}

function CrosshairIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  )
}

function PlaceRow({ d, icon, meta, onClick }: { d: Destination; icon: ReactNode; meta?: string; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className="flex min-h-tap w-full items-center gap-3 px-4 py-3 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-ink-dim">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{d.name}</span>
          <span className="block truncate text-sm text-ink-dim">{d.address}</span>
        </span>
        {meta && <span className="shrink-0 text-sm text-ink-dim">{meta}</span>}
      </button>
    </li>
  )
}
