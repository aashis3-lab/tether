import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { errorText, toast } from '@/lib/toast'
import { distanceM } from '@/lib/geo'
import { isSecure, watchLocationPermission } from '@/lib/device'
import type { LatLng } from '@/lib/types'

// Push a location update when we've moved this far, or this long has passed,
// whichever comes first. Keeps write volume sane on a jittery GPS.
const MIN_MOVE_M = 10
const MAX_INTERVAL_MS = 30_000
// A fix worse than this is ignored if we have a recent better one (cell/wifi
// fallback can jump hundreds of meters indoors).
const POOR_ACCURACY_M = 150
const FRESH_MS = 60_000

export type GpsStatus = 'starting' | 'ok' | 'searching' | 'denied' | 'insecure' | 'unsupported'

interface BatteryManager extends EventTarget {
  level: number
}

/**
 * While mounted, watches the device's GPS (and battery, where the browser
 * exposes it) and writes them to the caller's session_members row.
 *
 * Device realities handled here:
 *  - watchPosition often goes quiet when you stand still, so a heartbeat
 *    re-reads position every 30s and pushes it anyway (keeps last_updated fresh).
 *  - iOS can silently kill the watch while the page is in the background, so it
 *    is restarted and an immediate fix is pushed whenever the page is visible again.
 *  - Timeouts / no-signal are "searching", not "location off"; only a real
 *    permission denial is reported as denied.
 */
export function useLocationReporter(memberId: string | undefined, enabled = true, onPushed?: () => void) {
  const [position, setPosition] = useState<LatLng | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [status, setStatus] = useState<GpsStatus>('starting')
  const [restartKey, setRestartKey] = useState(0)
  const lastSent = useRef<{ pos: LatLng; at: number } | null>(null)
  const lastFix = useRef<{ accuracy: number; at: number } | null>(null)
  const battery = useRef<number | null>(null)
  const lastErrorToast = useRef(0)
  const onPushedRef = useRef(onPushed)
  onPushedRef.current = onPushed

  const retry = useCallback(() => setRestartKey((k) => k + 1), [])

  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> }
    if (!nav.getBattery) return
    let mgr: BatteryManager | null = null
    const onChange = () => {
      if (mgr) battery.current = Math.round(mgr.level * 100)
    }
    nav.getBattery().then((b) => {
      mgr = b
      onChange()
      b.addEventListener('levelchange', onChange)
    })
    return () => mgr?.removeEventListener('levelchange', onChange)
  }, [])

  // Re-enabled in browser/OS settings -> start again without a reload.
  useEffect(() => watchLocationPermission((s) => s === 'granted' && retry()), [retry])

  useEffect(() => {
    if (!memberId || !enabled) return
    if (!isSecure) {
      setStatus('insecure')
      return
    }
    if (!('geolocation' in navigator)) {
      setStatus('unsupported')
      return
    }

    let watchId: number | null = null

    const push = (here: LatLng, force: boolean) => {
      const now = Date.now()
      const prev = lastSent.current
      if (!force && prev && distanceM(prev.pos, here) < MIN_MOVE_M && now - prev.at < MAX_INTERVAL_MS) return
      lastSent.current = { pos: here, at: now }
      // last_updated is set explicitly so a stationary heartbeat (same
      // coordinates) still counts as a fresh check-in for the group.
      const patch: Record<string, number | string> = { lat: here.lat, lng: here.lng, last_updated: new Date().toISOString() }
      if (battery.current != null) patch.battery_level = battery.current
      void supabase
        .from('session_members')
        .update(patch)
        .eq('id', memberId)
        .then(({ error }) => {
          if (error) {
            // Say so (at most once a minute) instead of silently going stale.
            if (Date.now() - lastErrorToast.current > 60_000) {
              lastErrorToast.current = Date.now()
              toast(`Couldn't share your location: ${errorText(error)}`)
            }
            return
          }
          onPushedRef.current?.()
        })
    }

    const onFix = (pos: GeolocationPosition, force = false) => {
      const acc = pos.coords.accuracy
      const prev = lastFix.current
      if (acc > POOR_ACCURACY_M && prev && prev.accuracy < acc && Date.now() - prev.at < FRESH_MS) return
      lastFix.current = { accuracy: acc, at: Date.now() }
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      setPosition(here)
      setAccuracy(Math.round(acc))
      setStatus('ok')
      push(here, force)
    }

    const onError = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) {
        setStatus('denied')
        stopWatch()
      } else {
        // Timeout / no signal: keep trying, but say so.
        setStatus((s) => (s === 'ok' && lastFix.current && Date.now() - lastFix.current.at < FRESH_MS ? s : 'searching'))
      }
    }

    const opts: PositionOptions = { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 }

    const startWatch = () => {
      stopWatch()
      watchId = navigator.geolocation.watchPosition((p) => onFix(p), onError, opts)
    }
    const stopWatch = () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
      watchId = null
    }
    const freshFix = () =>
      navigator.geolocation.getCurrentPosition((p) => onFix(p, true), onError, { ...opts, maximumAge: 15_000 })

    startWatch()
    freshFix()

    // Heartbeat while visible: push even if we haven't moved.
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      const prev = lastSent.current
      if (!prev || Date.now() - prev.at >= MAX_INTERVAL_MS) freshFix()
    }, MAX_INTERVAL_MS / 2)

    // Back from background / lock screen: restart the watch and report now.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      startWatch()
      freshFix()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      stopWatch()
      window.clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [memberId, enabled, restartKey])

  const error =
    status === 'denied'
      ? 'Location is off. Your group can’t see you.'
      : status === 'insecure'
        ? 'Location needs a secure (https) link.'
        : status === 'unsupported'
          ? 'Location is not available on this device.'
          : null

  return { position, accuracy, status, error, retry }
}
