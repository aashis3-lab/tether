import type { Destination, PlaceKind } from './nightDraft'
import { supabase } from './supabase'
import type { LatLng } from './types'

// Place search via MapTiler Geocoding (same key as the map tiles).
const KEY = import.meta.env.VITE_MAPTILER_KEY

interface Feature {
  text: string
  place_name: string
  center: [number, number]
}

function toDestination(f: Feature): Destination {
  // place_name is "Name, street, city, …"; show the part after the name.
  const rest = f.place_name.startsWith(f.text) ? f.place_name.slice(f.text.length).replace(/^,\s*/, '') : f.place_name
  return { name: f.text, address: rest, lat: f.center[1], lng: f.center[0] }
}

async function geocode(query: string, near: LatLng | null, extra = ''): Promise<Destination[]> {
  if (!KEY || !query.trim()) return []
  const prox = near ? `&proximity=${near.lng},${near.lat}` : ''
  const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${KEY}${extra.includes('limit=') ? '' : '&limit=6'}${prox}${extra}`
  try {
    const res = await fetch(url)
    const data = (await res.json()) as { features?: Feature[] }
    return (data.features ?? []).map(toDestination)
  } catch {
    return []
  }
}

/** Address / venue search biased to where you are, closest first. */
export async function searchPlaces(query: string, near: LatLng | null) {
  const res = await geocode(query, near, '&autocomplete=true&limit=10')
  return near ? res.sort((x, y) => distM(near, x) - distM(near, y)) : res
}

// ---------------------------------------------------------------------------
// Nearby venues: MapTiler right away, OpenStreetMap Overpass merged in
// ---------------------------------------------------------------------------

const KINDS: PlaceKind[] = ['bar', 'pub', 'nightclub', 'restaurant']
const MIN_RESULTS = 20
const MAX_RESULTS = 40
const CACHE_MS = 10 * 60_000
// Public Overpass mirrors, tried in order until one answers.
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
const MIRROR_TIMEOUT_MS = 9000

interface OsmElement {
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

function distM(a: LatLng, b: LatLng) {
  const r = (d: number) => (d * Math.PI) / 180
  const h =
    Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

/** Merge lists, dropping the same place seen twice (same name within 60 m). */
function mergeSorted(near: LatLng, ...lists: Destination[][]): Destination[] {
  const out: Destination[] = []
  for (const d of lists.flat()) {
    const dupe = out.find((x) => x.name.toLowerCase() === d.name.toLowerCase() && distM(x, d) < 60)
    if (dupe) {
      dupe.kind ??= d.kind
      if (!dupe.address && d.address) dupe.address = d.address
    } else out.push({ ...d })
  }
  return out.sort((a, b) => distM(near, a) - distM(near, b)).slice(0, MAX_RESULTS)
}

const cacheKey = (near: LatLng) => `tether.nearby.${near.lat.toFixed(3)},${near.lng.toFixed(3)}`

function readCache(near: LatLng): Destination[] | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(near))
    if (!raw) return null
    const { at, list } = JSON.parse(raw) as { at: number; list: Destination[] }
    return Date.now() - at < CACHE_MS ? list : null
  } catch {
    return null
  }
}

function writeCache(near: LatLng, list: Destination[]) {
  try {
    sessionStorage.setItem(cacheKey(near), JSON.stringify({ at: Date.now(), list }))
  } catch {
    // ignore
  }
}

/** MapTiler POI search for each venue type, near you. Fast, sometimes sparse. */
async function mapTilerNearby(near: LatLng): Promise<Destination[]> {
  const queries: [string, PlaceKind][] = [
    ['bar', 'bar'],
    ['pub', 'pub'],
    ['nightclub', 'nightclub'],
    ['restaurant', 'restaurant'],
  ]
  const lists = await Promise.all(
    queries.map(async ([q, kind]) => (await geocode(q, near, '&types=poi&limit=10')).map((d) => ({ ...d, kind })))
  )
  // Only keep things actually nearby (MapTiler can return far-away matches).
  return lists.flat().filter((d) => distM(near, d) < 8000)
}

/** Overpass via our Edge Function (Overpass rejects browser user agents). */
async function overpassViaServer(near: LatLng, radius: number): Promise<Destination[] | null> {
  try {
    const { data, error } = await supabase.functions.invoke('evaluate-session', {
      body: { nearby: { lat: near.lat, lng: near.lng, radius } },
    })
    if (error || !data?.places) return null
    return (data.places as Destination[]).map((d) => ({
      ...d,
      kind: (KINDS as string[]).includes(d.kind ?? '') ? d.kind : undefined,
    }))
  } catch {
    return null
  }
}

async function overpassNearby(near: LatLng, radius: number): Promise<Destination[]> {
  const viaServer = await overpassViaServer(near, radius)
  if (viaServer && viaServer.length) return viaServer
  const sel = `["amenity"~"^(${KINDS.join('|')})$"]["name"](around:${radius},${near.lat},${near.lng})`
  const q = `[out:json][timeout:15];(node${sel};way${sel};);out center 150;`
  for (const url of OVERPASS_MIRRORS) {
    const ctrl = new AbortController()
    const t = window.setTimeout(() => ctrl.abort(), MIRROR_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(q),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: ctrl.signal,
      })
      if (!res.ok) continue
      const data = (await res.json()) as { elements?: OsmElement[] }
      const out: Destination[] = []
      for (const el of data.elements ?? []) {
        const lat = el.lat ?? el.center?.lat
        const lng = el.lon ?? el.center?.lon
        const tg = el.tags ?? {}
        if (lat == null || lng == null || !tg.name) continue
        const street = [tg['addr:housenumber'], tg['addr:street']].filter(Boolean).join(' ')
        out.push({
          name: tg.name,
          address: street || tg['addr:city'] || '',
          lat,
          lng,
          kind: (KINDS as string[]).includes(tg.amenity) ? (tg.amenity as PlaceKind) : undefined,
        })
      }
      return out
    } catch {
      // timeout / network: try the next mirror
    } finally {
      window.clearTimeout(t)
    }
  }
  return []
}

/**
 * Real bars, pubs, nightclubs and restaurants near `near`, closest first.
 * Calls `onUpdate` as sources arrive (cache, then MapTiler, then Overpass),
 * so the list is never empty for long. Widens to 4 km if under 20 results.
 */
export async function nearbyPlacesLive(near: LatLng | null, onUpdate: (list: Destination[]) => void): Promise<Destination[]> {
  if (!near) return []
  const cached = readCache(near)
  if (cached) onUpdate(cached)

  let current: Destination[] = cached ?? []
  const push = (more: Destination[]) => {
    current = mergeSorted(near, current, more)
    onUpdate(current)
  }

  const [mt, op] = [mapTilerNearby(near), overpassNearby(near, 2000)]
  void mt.then(push)
  const osm = await op
  push(osm)
  await mt
  if (current.length < MIN_RESULTS) push(await overpassNearby(near, 4000))
  writeCache(near, current)
  return current
}

/** One-shot version for callers that just want the final list. */
export function nearbyPlaces(near: LatLng | null): Promise<Destination[]> {
  return nearbyPlacesLive(near, () => undefined)
}

// ---------------------------------------------------------------------------
// Recent destinations (this device only)
// ---------------------------------------------------------------------------

const RECENT_KEY = 'tether.recentDestinations'

export function recentDestinations(): Destination[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as Destination[]
  } catch {
    return []
  }
}

export function rememberDestinations(ds: Destination[]) {
  const merged = [...ds, ...recentDestinations()].filter(
    (d, i, all) => all.findIndex((x) => x.name === d.name && x.address === d.address) === i
  )
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(merged.slice(0, 5)))
  } catch {
    // ignore
  }
}

export const placesAvailable = Boolean(KEY)
