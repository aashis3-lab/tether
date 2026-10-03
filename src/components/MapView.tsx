import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng, Member, Pin } from '@/lib/types'
import { hasLocation } from '@/lib/geo'

// MapTiler raster tiles in a dark style to match the app theme. {r} becomes
// "@2x" on high-DPI screens. Without a key, maps show a fallback message.
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY
const MAPTILER_STYLE = 'dataviz-dark'
const TILE_URL = `https://api.maptiler.com/maps/${MAPTILER_STYLE}/256/{z}/{x}/{y}{r}.png?key=${MAPTILER_KEY}`
const TILE_ATTRIB = '&copy; MapTiler &copy; OpenStreetMap contributors'

const STATUS_COLOR: Record<string, string> = {
  together: '#3dd68c',
  home: '#3dd68c',
  heading_home: '#a9a3b5',
  separated: '#ffb020',
  left_alone: '#ffb020',
  needs_help: '#ff3b3b',
}

function memberIcon(m: Member, isMe: boolean, avatar?: string | null) {
  const color = STATUS_COLOR[m.status] ?? '#3dd68c'
  const initial = m.name.trim().charAt(0).toUpperCase() || '?'
  const inner = avatar
    ? `<img src="${avatar.replace(/"/g, '&quot;')}" style="width:100%;height:100%;object-fit:cover;border-radius:9999px" />`
    : initial
  return L.divIcon({
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    html: `<div style="width:40px;height:40px;border-radius:9999px;overflow:hidden;background:${
      isMe ? '#ff4d8d' : '#1b1824'
    };border:3px solid ${color};color:#fff;display:flex;align-items:center;justify-content:center;font:700 15px Inter,system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.5)">${inner}</div>`,
  })
}

const pinIcon = L.divIcon({
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  html: '<div style="font-size:26px;line-height:28px">📍</div>',
})

const escapeHtml = (t: string) =>
  t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

// Venue-type glyphs (24x24 stroke paths) drawn inside the pin.
const KIND_PATH: Record<string, string> = {
  bar: 'M5 4h14l-7 8-7-8ZM12 12v8M8 20h8',
  pub: 'M6 7h10v13H6ZM16 10h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M9.5 11v6M12.5 11v6',
  nightclub: 'M9 18V6l11-2v12M6.5 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM17.5 18.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  restaurant: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-1.7 0-3 2-3 5s1.3 4 3 4v9',
}

/** Teardrop map pin with a venue-type icon and the name underneath. */
function venuePin(name: string, kind?: string | null) {
  const glyph = KIND_PATH[kind ?? ''] ?? 'M12 9.5a2.5 2.5 0 1 0 0 .01'
  return L.divIcon({
    className: '',
    iconSize: [36, 46],
    iconAnchor: [18, 46],
    html: `<div style="position:relative;width:36px;height:46px">
      <svg width="36" height="46" viewBox="0 0 36 46" style="filter:drop-shadow(0 3px 6px rgba(0,0,0,.6))">
        <defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4f8b"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient></defs>
        <path d="M18 45C18 45 3 28.5 3 17.5a15 15 0 0 1 30 0C33 28.5 18 45 18 45Z" fill="url(#pg)" stroke="#0f0e11" stroke-width="1.5"/>
        <circle cx="18" cy="17.5" r="11" fill="#fff"/>
        <g transform="translate(9.6 9.1) scale(0.7)" fill="none" stroke="#e8336f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${glyph}"/></g>
      </svg>
      <div style="position:absolute;top:48px;left:50%;transform:translateX(-50%);width:max-content;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:rgba(15,14,17,.92);color:#fff;font:600 12px Inter,system-ui,sans-serif;padding:3px 8px;border-radius:7px">${escapeHtml(name)}</div>
    </div>`,
  })
}

/** Pink "4 accounted for" chip at the group's center. */
function groupChip(n: number) {
  return L.divIcon({
    className: '',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html: `<div style="transform:translate(-50%,-50%);width:max-content;white-space:nowrap;background:#ff4f8b;color:#fff;font:700 14px Inter,system-ui,sans-serif;padding:6px 12px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.4)">${n} accounted for</div>`,
  })
}

const homeIcon = L.divIcon({
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  html: '<div style="font-size:24px;line-height:28px">🏠</div>',
})

/**
 * 'auto': refit whenever the points meaningfully move (small static maps).
 * 'once': fit when points first appear and when `signal` changes ("recenter"),
 *         so a full-screen map you're panning doesn't jump around.
 */
function FitTo({
  points,
  mode,
  signal,
  bottomPad,
}: {
  points: LatLng[]
  mode: 'auto' | 'once'
  signal: number
  bottomPad: number
}) {
  const map = useMap()
  const pointsKey = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|')
  const key = mode === 'auto' ? pointsKey : `${signal}:${points.length > 0}`
  useEffect(() => {
    if (points.length === 0) return
    const pad = { paddingTopLeft: [40, 140] as [number, number], paddingBottomRight: [40, bottomPad + 40] as [number, number] }
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 16)
      if (bottomPad) map.panBy([0, bottomPad / 2], { animate: false })
    } else map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { ...pad, maxZoom: 17 })
    // Refit only when `key` changes (see modes above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map])
  return null
}

/**
 * Long-press (touch) or right-click (mouse) to drop a pin. Leaflet has no
 * reliable long-press on iOS, so this watches pointer events directly.
 */
function LongPress({ onLongPress }: { onLongPress: (p: LatLng) => void }) {
  const map = useMap()
  const cb = useRef(onLongPress)
  cb.current = onLongPress
  useEffect(() => {
    const el = map.getContainer()
    let timer: number | undefined
    let start: { x: number; y: number } | null = null
    const at = (e: MouseEvent) => {
      const ll = map.mouseEventToLatLng(e)
      return { lat: ll.lat, lng: ll.lng }
    }
    const clear = () => {
      window.clearTimeout(timer)
      timer = undefined
      start = null
    }
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return
      start = { x: e.clientX, y: e.clientY }
      const p = at(e)
      timer = window.setTimeout(() => {
        clear()
        navigator.vibrate?.(30)
        cb.current(p)
      }, 550)
    }
    const move = (e: PointerEvent) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) clear()
    }
    const context = (e: MouseEvent) => {
      e.preventDefault()
      if ((e as PointerEvent).pointerType && (e as PointerEvent).pointerType !== 'mouse') return
      cb.current(at(e))
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', clear)
    el.addEventListener('pointercancel', clear)
    el.addEventListener('contextmenu', context)
    map.on('dragstart zoomstart', clear)
    return () => {
      clear()
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', clear)
      el.removeEventListener('pointercancel', clear)
      el.removeEventListener('contextmenu', context)
      map.off('dragstart zoomstart', clear)
    }
  }, [map])
  return null
}

/** Hands the Leaflet map to the parent (e.g. to read the center). */
function Ready({ onReady }: { onReady: (m: L.Map) => void }) {
  const map = useMap()
  useEffect(() => onReady(map), [map, onReady])
  return null
}

function TapHandler({ onTap }: { onTap: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onTap({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  return null
}

/** Leaflet resizes poorly when its container changes size (e.g. expand). */
function InvalidateOnResize() {
  const map = useMap()
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(map.getContainer())
    return () => ro.disconnect()
  }, [map])
  return null
}

export function MapView({
  members = [],
  pins = [],
  home,
  myMemberId,
  center,
  onTap,
  interactive = true,
  className = '',
  fitKey,
  showGroupChip = false,
  fitMode = 'auto',
  recenterSignal = 0,
  bottomPad = 0,
  onLongPress,
  onPinClick,
  onReady,
  avatars,
}: {
  members?: Member[]
  pins?: (Pick<Pin, 'name' | 'lat' | 'lng' | 'radius_m'> & { id?: string; kind?: Pin['kind'] })[]
  home?: LatLng | null
  myMemberId?: string
  center?: LatLng | null
  onTap?: (p: LatLng) => void
  interactive?: boolean
  className?: string
  fitKey?: string
  /** Show a "N accounted for" chip at the center of everyone with the group. */
  showGroupChip?: boolean
  fitMode?: 'auto' | 'once'
  /** Bump to recenter on everyone (fitMode 'once'). */
  recenterSignal?: number
  /** Pixels covered at the bottom (e.g. a bottom sheet) to keep points clear of. */
  bottomPad?: number
  onLongPress?: (p: LatLng) => void
  onPinClick?: (pinId: string) => void
  onReady?: (m: L.Map) => void
  /** member id -> picture URL for markers. */
  avatars?: Record<string, string | null>
}) {
  const located = members.filter(hasLocation)
  const fitPoints: LatLng[] = [...located, ...pins]
  if (fitPoints.length === 0 && center) fitPoints.push(center)
  const start = fitPoints[0] ?? center ?? { lat: 40.7128, lng: -74.006 }

  return (
    <MapContainer
      key={fitKey}
      center={[start.lat, start.lng]}
      zoom={15}
      zoomControl={false}
      attributionControl={false}
      dragging={interactive}
      touchZoom={interactive}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      className={`h-full w-full ${className}`}
      style={{ background: '#0f0e11' }}
    >
      {MAPTILER_KEY ? (
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIB} />
      ) : (
        <div className="pointer-events-none absolute inset-0 z-[450] flex items-center justify-center p-4 text-center">
          <p className="rounded-xl2 bg-black/70 px-4 py-3 text-sm text-ink-dim">
            Map unavailable: add <span className="font-mono text-ink">VITE_MAPTILER_KEY</span> to .env and restart the dev
            server.
          </p>
        </div>
      )}
      <FitTo points={fitPoints} mode={fitMode} signal={recenterSignal} bottomPad={bottomPad} />
      {onLongPress && <LongPress onLongPress={onLongPress} />}
      {onReady && <Ready onReady={onReady} />}
      <InvalidateOnResize />
      {onTap && <TapHandler onTap={onTap} />}
      {pins.map((p, i) => (
        <div key={p.id ?? i}>
          {/* Venue area: a faint, thin disc. */}
          <Circle
            center={[p.lat, p.lng]}
            radius={p.radius_m}
            pathOptions={{ color: '#ff8a3d', weight: 1, opacity: 0.3, fillOpacity: 0.04 }}
          />
          <Marker
            position={[p.lat, p.lng]}
            icon={p.name ? venuePin(p.name, p.kind) : pinIcon}
            eventHandlers={onPinClick && p.id ? { click: () => onPinClick(p.id!) } : undefined}
          />
        </div>
      ))}
      {home && <Marker position={[home.lat, home.lng]} icon={homeIcon} />}
      {showGroupChip && (() => {
        const together = located.filter((m) => m.status === 'together')
        if (together.length < 2) return null
        const c = {
          lat: together.reduce((t, m) => t + m.lat, 0) / together.length,
          lng: together.reduce((t, m) => t + m.lng, 0) / together.length,
        }
        return <Marker position={[c.lat, c.lng]} icon={groupChip(together.length)} zIndexOffset={2000} />
      })()}
      {located
        // With the group chip on, members who are together are represented by it.
        .filter((m) => !(showGroupChip && m.status === 'together' && located.filter((x) => x.status === 'together').length >= 2))
        .map((m) => (
        <Marker
          key={m.id}
          position={[m.lat, m.lng]}
          icon={memberIcon(m, m.id === myMemberId, avatars?.[m.id])}
          zIndexOffset={m.id === myMemberId ? 1000 : 0}
        />
      ))}
    </MapContainer>
  )
}
