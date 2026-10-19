import { googleAvailable, googleGeocode, googlePlaceName, googleReverse } from './google'
import { approximateLocation } from './places'
import type { LatLng } from './types'

const EARTH_RADIUS_M = 6_371_000

/** Great-circle distance in meters. */
export function distanceM(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

export function centroid(points: LatLng[]): LatLng | null {
  if (points.length === 0) return null
  const sum = points.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), {
    lat: 0,
    lng: 0,
  })
  return { lat: sum.lat / points.length, lng: sum.lng / points.length }
}

/** "200 ft" under ~0.1 mi, otherwise "0.3 mi". US units per the spec's copy. */
export function formatDistance(m: number): string {
  const feet = m * 3.28084
  if (feet < 528) return `${Math.max(10, Math.round(feet / 10) * 10)} ft`
  const miles = m / 1609.34
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`
}

export function hasLocation<T extends { lat: number | null; lng: number | null }>(
  x: T
): x is T & LatLng {
  return x.lat != null && x.lng != null
}

/**
 * Free-text address -> coordinates. Google Geocoding when a key is set,
 * biased to `near` (or, without it, your rough IP location) so "707 S Third
 * St" lands in your town; otherwise OpenStreetMap Nominatim.
 */
export async function geocode(address: string, near?: LatLng | null): Promise<LatLng | null> {
  if (googleAvailable) return googleGeocode(address, near ?? (await approximateLocation()))
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
    encodeURIComponent(address)
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    const rows = (await res.json()) as { lat: string; lon: string }[]
    if (!rows.length) return null
    return { lat: Number(rows[0].lat), lng: Number(rows[0].lon) }
  } catch {
    return null
  }
}

export function getCurrentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Location is not available on this device'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err.message)),
      { enableHighAccuracy: true, timeout: 15_000 }
    )
  })
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  return `${Math.round(m / 60)} hr ago`
}

/** Compass direction from a to b, e.g. "NE". */
export function compass(a: LatLng, b: LatLng): string {
  const toRad = (d: number) => (d * Math.PI) / 180
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat))
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng))
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8]
}

export function mapsLink(p: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`
}

/** Best-effort street address for a point (Google, else Nominatim). */
export async function reverseGeocode(p: LatLng): Promise<string | null> {
  if (googleAvailable) return googleReverse(p)
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&lat=${p.lat}&lon=${p.lng}`,
      { headers: { Accept: 'application/json' } }
    )
    const row = (await res.json()) as { display_name?: string }
    return row.display_name ?? null
  } catch {
    return null
  }
}

/** Short place label for a point, e.g. "Illini Union" or "W Green St". */
export async function placeName(p: LatLng): Promise<string | null> {
  if (googleAvailable) return googlePlaceName(p)
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&lat=${p.lat}&lon=${p.lng}`,
      { headers: { Accept: 'application/json' } }
    )
    const row = (await res.json()) as {
      name?: string
      address?: { road?: string; house_number?: string; neighbourhood?: string; suburb?: string }
    }
    if (row.name) return row.name
    const a = row.address
    if (a?.road) return a.house_number ? `${a.house_number} ${a.road}` : a.road
    return a?.neighbourhood ?? a?.suburb ?? null
  } catch {
    return null
  }
}
