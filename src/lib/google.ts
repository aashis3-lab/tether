import type { Destination, PlaceKind } from './nightDraft'
import type { LatLng } from './types'

/**
 * Google Maps Platform: Places API (New) for venue search and nearby
 * suggestions, Geocoding API for addresses. Called straight from the browser
 * (both allow CORS), with a key restricted by HTTP referrer in Google Cloud.
 * Field masks keep each call to the fields we show (and the cheapest SKU).
 */
export const GOOGLE_KEY = (import.meta.env.VITE_GOOGLE_MAPS_KEY ?? '').trim()
export const googleAvailable = Boolean(GOOGLE_KEY)

const PLACES = 'https://places.googleapis.com/v1'
const GEOCODE = 'https://maps.googleapis.com/maps/api/geocode/json'
const FIELDS = 'places.displayName,places.shortFormattedAddress,places.formattedAddress,places.location,places.primaryType'
// Search bias: a soft circle around you (results outside can still appear).
const BIAS_RADIUS_M = 30_000

interface GPlace {
  displayName?: { text: string }
  shortFormattedAddress?: string
  formattedAddress?: string
  location?: { latitude: number; longitude: number }
  primaryType?: string
}

function kindOf(type?: string): PlaceKind | undefined {
  if (!type) return undefined
  if (type === 'night_club') return 'nightclub'
  if (type === 'pub') return 'pub'
  if (type === 'bar' || type === 'wine_bar' || type === 'cocktail_bar') return 'bar'
  if (type.endsWith('restaurant')) return 'restaurant'
  return undefined
}

function toDestination(p: GPlace): Destination | null {
  if (!p.location || !p.displayName?.text) return null
  return {
    name: p.displayName.text,
    address: p.shortFormattedAddress ?? p.formattedAddress ?? '',
    lat: p.location.latitude,
    lng: p.location.longitude,
    kind: kindOf(p.primaryType),
  }
}

async function placesPost(path: string, body: unknown): Promise<GPlace[]> {
  try {
    const res = await fetch(`${PLACES}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_KEY, 'X-Goog-FieldMask': FIELDS },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as { places?: GPlace[]; error?: { message: string } }
    if (data.error && import.meta.env.DEV) console.warn('[tether] Google Places:', data.error.message)
    return data.places ?? []
  } catch {
    return []
  }
}

const circle = (near: LatLng, radius: number) => ({
  circle: { center: { latitude: near.lat, longitude: near.lng }, radius },
})

/** Venues and addresses matching what you typed, biased to `near`. */
export async function googleSearch(query: string, near: LatLng | null): Promise<Destination[]> {
  if (!query.trim()) return []
  const places = await placesPost('places:searchText', {
    textQuery: query,
    pageSize: 10,
    ...(near ? { locationBias: circle(near, BIAS_RADIUS_M) } : { regionCode: 'us' }),
  })
  return places.map(toDestination).filter((d): d is Destination => d !== null)
}

/** Bars, pubs, nightclubs and restaurants around `near`, closest first. */
export async function googleNearby(near: LatLng, radius = 2000): Promise<Destination[]> {
  const places = await placesPost('places:searchNearby', {
    includedTypes: ['bar', 'pub', 'night_club', 'restaurant'],
    maxResultCount: 20,
    rankPreference: 'DISTANCE',
    locationRestriction: circle(near, radius),
  })
  return places.map(toDestination).filter((d): d is Destination => d !== null)
}

interface GeoResult {
  formatted_address: string
  geometry: { location: { lat: number; lng: number } }
  address_components: { long_name: string; short_name: string; types: string[] }[]
}

async function geocodeGet(params: string): Promise<GeoResult[]> {
  try {
    const res = await fetch(`${GEOCODE}?${params}&key=${GOOGLE_KEY}`)
    const data = (await res.json()) as { results?: GeoResult[]; status: string; error_message?: string }
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS' && import.meta.env.DEV)
      console.warn('[tether] Google Geocoding:', data.status, data.error_message)
    return data.results ?? []
  } catch {
    return []
  }
}

/** Address -> coordinates, biased to a ~40 km box around `near` when given (else US). */
export async function googleGeocode(address: string, near?: LatLng | null): Promise<LatLng | null> {
  const bounds = near ? `&bounds=${near.lat - 0.36},${near.lng - 0.48}|${near.lat + 0.36},${near.lng + 0.48}` : ''
  const [hit] = await geocodeGet(`address=${encodeURIComponent(address)}&region=us${bounds}`)
  return hit ? { lat: hit.geometry.location.lat, lng: hit.geometry.location.lng } : null
}

/** Coordinates -> full street address. */
export async function googleReverse(p: LatLng): Promise<string | null> {
  const [hit] = await geocodeGet(`latlng=${p.lat},${p.lng}`)
  return hit?.formatted_address ?? null
}

/** Coordinates -> short label: a named place, else "123 Main St". */
export async function googlePlaceName(p: LatLng): Promise<string | null> {
  const near = await placesPost('places:searchNearby', {
    maxResultCount: 1,
    rankPreference: 'DISTANCE',
    locationRestriction: circle(p, 30),
  })
  if (near[0]?.displayName?.text) return near[0].displayName.text
  const [hit] = await geocodeGet(`latlng=${p.lat},${p.lng}`)
  if (!hit) return null
  const part = (t: string) => hit.address_components.find((c) => c.types.includes(t))?.short_name
  const road = part('route')
  if (road) return [part('street_number'), road].filter(Boolean).join(' ')
  return part('neighborhood') ?? part('locality') ?? null
}
