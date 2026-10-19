import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { CheckCircleIcon, ClockIcon, PinIcon, SearchIcon, XIcon } from '@/components/icons'
import { PlaceKindIcon } from '@/components/PlaceKindIcon'
import { Button, Header, Screen, Title } from '@/components/ui'
import { buttonClass } from '@/components/buttons'
import { StartProgress } from './StartFlow'
import { locationPermission, requestLocation } from '@/lib/device'
import { distanceM, formatDistance, placeName, reverseGeocode } from '@/lib/geo'
import { updateDraft, useNightDraft, type Destination } from '@/lib/nightDraft'
import { approximateLocation, nearbyPlacesLive, placesAvailable, recentDestinations, searchPlaces } from '@/lib/places'
import type { LatLng } from '@/lib/types'

const same = (a: Destination, b: Destination) => a.name === b.name && a.address === b.address

/** "Where are you going?", search + suggestions; each pick becomes a venue pin. */
export function DestinationScreen() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const draft = useNightDraft()
  const [picked, setPicked] = useState<Destination[]>(draft.destinations)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Destination[]>([])
  const [searching, setSearching] = useState(false)
  const [here, setHere] = useState<LatLng | null>(null)
  const [nearby, setNearby] = useState<Destination[]>([])
  // ask = never asked yet; off = asked but no fix (services off, timeout, insecure).
  const [locState, setLocState] = useState<'checking' | 'ask' | 'on' | 'off' | 'denied' | 'locating'>('checking')
  const [current, setCurrent] = useState<Destination | null>(null)
  // Show the search box when nothing is picked yet, or after "Add Destination".
  const [adding, setAdding] = useState(draft.destinations.length === 0)
  const input = useRef<HTMLInputElement>(null)
  const recent = useRef(recentDestinations())

  // Where to bias search and suggestions: you, else your saved home, else
  // a rough IP-based location.
  const home =
    profile?.home_lat != null && profile?.home_lng != null ? { lat: profile.home_lat, lng: profile.home_lng } : null
  const [ipSpot, setIpSpot] = useState<LatLng | null>(null)
  const anchor = here ?? home ?? ipSpot
  useEffect(() => {
    if (!home) void approximateLocation().then(setIpSpot)
    // Only needed once, when there's no saved home.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Nearby venues before you type anything; refreshed once your real location arrives.
  const anchorKey = anchor ? `${anchor.lat.toFixed(3)},${anchor.lng.toFixed(3)}` : ''
  useEffect(() => {
    if (anchor) void nearbyPlacesLive(anchor, setNearby)
    // Re-run only when the anchor really moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorKey])

  // Where you actually are -> "Current location" + nearby suggestions.
  async function locate() {
    setLocState('locating')
    const r = await requestLocation(10_000)
    if (!r.ok) {
      setLocState(r.reason === 'denied' ? 'denied' : 'off')
      return
    }
    const p = { lat: r.lat, lng: r.lng }
    setHere(p)
    setLocState('on')
    const [name, full] = await Promise.all([placeName(p), reverseGeocode(p)])
    const address = full ? full.split(',').slice(0, 3).join(',').trim() : ''
    setCurrent({ name: name ? `Current location · ${name}` : 'Current location', address, lat: p.lat, lng: p.lng })
  }

  // Only ask the browser on load if permission was already given; otherwise
  // wait for a tap on "Use my current location". Never sit on "Finding you…":
  // a permission check that hangs counts as not asked yet.
  useEffect(() => {
    const timeout = new Promise<'prompt'>((r) => window.setTimeout(() => r('prompt'), 2500))
    void Promise.race([locationPermission(), timeout]).then((s) => {
      if (s === 'granted') void locate()
      else setLocState(s === 'denied' ? 'denied' : s === 'prompt' ? 'ask' : 'off')
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
      setResults(await searchPlaces(query, anchor))
      setSearching(false)
    }, 300)
    return () => window.clearTimeout(t)
    // `anchorKey` stands in for `anchor`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, anchorKey])

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
      <Header title="Start a night" back="/" />
      <StartProgress step={1} />
      <Title>Where are you going?</Title>
      <p className="mt-1 text-base text-ink-dim">Add one or more venues. Each becomes a pin your group can see.</p>

      {(adding || picked.length === 0) && (
        <label className="mt-5 flex min-h-[56px] items-center gap-3 rounded-full bg-surface-high px-5 shadow-e1 focus-within:ring-2 focus-within:ring-primary">
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
        <ul className="mt-3 flex flex-col divide-y divide-line/70 overflow-hidden rounded-2xl bg-surface-lowest dark:bg-surface-mid">
          {results.map((d) => (
            <PlaceRow key={d.name + d.address} d={d} icon={<PinIcon width={20} height={20} />} onClick={() => pick(d)} />
          ))}
          {!searching && results.length === 0 && <li className="px-4 py-4 text-base text-ink-dim">No matches yet, try adding the city.</li>}
          {searching && results.length === 0 && <li className="px-4 py-4 text-base text-ink-dim">Searching…</li>}
        </ul>
      ) : (
        <>
          {picked.length > 0 && (
            <div className="mt-5 flex flex-col gap-2">
              {picked.map((d) => (
                <div key={d.name + d.address} className="flex min-h-tap animate-enter items-center gap-3 rounded-2xl bg-primary-container/60 px-4 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-on">
                    <PinIcon width={18} height={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-medium text-primary-on-container">{d.name}</p>
                    <p className="truncate text-xs text-primary-on-container/75">{d.address}</p>
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
                    <CheckCircleIcon width={22} height={22} className="shrink-0 text-primary-ink" />
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
              className={`mt-3 ${buttonClass('secondary')}`}
            >
              Add another place
            </button>
          )}

          {(
            <>
              <p className="section-title mt-2">Suggestions</p>
              <ul className="flex flex-col divide-y divide-line/70 overflow-hidden rounded-2xl bg-surface-lowest dark:bg-surface-mid">
                {current && !picked.some((p) => same(p, current)) ? (
                  <PlaceRow d={current} icon={<CrosshairIcon />} onClick={() => pick(current)} />
                ) : !current ? (
                  <li>
                    <button
                      onClick={() => void locate()}
                      disabled={locState === 'locating' || locState === 'checking'}
                      className="flex min-h-tap w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-me/15 text-me">
                        <CrosshairIcon />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-lg font-medium">
                          {locState === 'locating' || locState === 'checking'
                            ? 'Finding you…'
                            : locState === 'ask'
                              ? 'Use my current location'
                              : 'Turn on location for nearby places'}
                        </span>
                        <span className="block text-xs text-ink-dim">
                          {locState === 'denied'
                            ? 'Location is blocked. Turn it on in your phone settings, then tap here.'
                            : locState === 'off'
                              ? 'Location is off. Tap to try again.'
                              : home && locState === 'ask'
                                ? 'Showing places near your home for now'
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
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-high text-ink-dim">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg">{d.name}</span>
          <span className="block truncate text-xs text-ink-dim">{d.address}</span>
        </span>
        {meta && <span className="shrink-0 text-xs text-ink-dim">{meta}</span>}
      </button>
    </li>
  )
}
