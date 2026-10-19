import { useEffect, useState } from 'react'

/** Appearance preference, stored on this device only. Light by default. */
export type ThemePref = 'light' | 'dark' | 'system'

const KEY = 'tether.theme'
const listeners = new Set<() => void>()
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    // Storage blocked (private mode): fall back to the default.
  }
  return 'light'
}

function resolved(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'system') return media?.matches ? 'dark' : 'light'
  return pref
}

/** Puts the current theme on <html> and the browser chrome color. */
export function applyTheme() {
  const mode = resolved(getThemePref())
  const root = document.documentElement
  if (mode === 'dark') root.setAttribute('data-theme', 'dark')
  else root.removeAttribute('data-theme')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#191113' : '#fff8f9')
}

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    // Not persisted; still applies for this visit.
  }
  applyTheme()
  listeners.forEach((l) => l())
}

/** Call once at startup: applies the theme and follows the OS when set to "system". */
export function initTheme() {
  applyTheme()
  media?.addEventListener('change', () => {
    if (getThemePref() === 'system') {
      applyTheme()
      listeners.forEach((l) => l())
    }
  })
}

/** Current preference plus the resolved light/dark mode, kept in sync. */
export function useTheme() {
  const [pref, setPref] = useState(getThemePref)
  const [, bump] = useState(0)
  useEffect(() => {
    const l = () => {
      setPref(getThemePref())
      bump((n) => n + 1)
    }
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return { pref, mode: resolved(pref), setPref: setThemePref }
}
