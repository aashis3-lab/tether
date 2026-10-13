import { useSyncExternalStore } from 'react'
import { defaultEndTime } from './time'
import type { Contact } from './types'

/** A venue picked on the "Where are you going?" screen (becomes a pin). */
export interface Destination {
  name: string
  address: string
  lat: number
  lng: number
  /** Venue type for the icon (from OpenStreetMap), when known. */
  kind?: PlaceKind
}

export type PlaceKind = 'bar' | 'pub' | 'nightclub' | 'restaurant'

/**
 * The night being planned on Home (destination, end time, guardian) before
 * it's created. Kept in sessionStorage so hopping to the destination screen
 * and back, or a reload, doesn't lose it.
 */
export interface NightDraft {
  destinations: Destination[]
  endTime: string // ISO
  /** True once the end time was picked on the "When" step (else it tracks the default). */
  endTimePicked?: boolean
  guardian: Contact | null
  /** Optional party name; defaults to the first venue's name. */
  name?: string
}

const KEY = 'tether.nightDraft'
const listeners = new Set<() => void>()

function fresh(): NightDraft {
  return { destinations: [], endTime: defaultEndTime().toISOString(), guardian: null }
}

function read(): NightDraft {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw) {
      const d = JSON.parse(raw) as NightDraft
      // A stale end time (e.g. yesterday's draft) resets to the default.
      if (new Date(d.endTime).getTime() > Date.now()) return d
      return { ...d, endTime: fresh().endTime }
    }
  } catch {
    // ignore
  }
  return fresh()
}

let current = read()

export function updateDraft(patch: Partial<NightDraft>) {
  current = { ...current, ...patch }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // ignore
  }
  listeners.forEach((l) => l())
}

export function clearDraft() {
  current = fresh()
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
  listeners.forEach((l) => l())
}

export function useNightDraft(): NightDraft {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current
  )
}
