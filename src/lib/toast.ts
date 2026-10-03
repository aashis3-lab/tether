import { useSyncExternalStore } from 'react'

/**
 * Tiny global toast queue so any code path can surface an error (or a
 * success) without plumbing state through components.
 */
export interface Toast {
  id: number
  kind: 'error' | 'success'
  text: string
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(text: string, kind: Toast['kind'] = 'error') {
  const t = { id: nextId++, kind, text }
  toasts = [...toasts.slice(-2), t]
  emit()
  window.setTimeout(() => dismissToast(t.id), kind === 'error' ? 7000 : 3000)
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => toasts
  )
}

/** Human-readable message from a Supabase/JS error. */
export function errorText(e: unknown): string {
  if (!e) return 'Something went wrong.'
  if (typeof e === 'string') return e
  const m = (e as { message?: string }).message ?? String(e)
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'No connection. Check your signal and try again.'
  if (/JWT|not authenticated/i.test(m)) return 'Your sign-in expired. Reload the app.'
  return m
}

/**
 * Run a Supabase call; on error show a toast with `label` and return false.
 * Use for every user-triggered write so nothing fails silently.
 */
export async function attempt<T extends { error: unknown }>(label: string, p: PromiseLike<T>): Promise<T | null> {
  try {
    const r = await p
    if (r.error) {
      toast(`${label}: ${errorText(r.error)}`)
      return null
    }
    return r
  } catch (e) {
    toast(`${label}: ${errorText(e)}`)
    return null
  }
}

/** Same as `attempt` for plain async functions that throw. */
export async function tryOrToast<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch (e) {
    toast(`${label}: ${errorText(e)}`)
    return null
  }
}
