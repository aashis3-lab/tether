import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng, Member, Pin } from '@/lib/types'
import { hasLocation } from '@/lib/geo'
import { memberStatusLabel } from '@/lib/activities'
import { useTheme } from '@/lib/theme'

// MapTiler raster tiles, Google Maps-like streets in light mode and their
// dark variant in dark mode. {r} becomes "@2x" on high-DPI screens. Without a
// key, maps show a fallback message.
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY
const tileUrl = (mode: 'light' | 'dark') =>
  `https://api.maptiler.com/maps/${mode === 'dark' ? 'streets-v2-dark' : 'streets-v2'}/256/{z}/{x}/{y}{r}.png?key=${MAPTILER_KEY}`
const TILE_ATTRIB = '&copy; MapTiler &copy; OpenStreetMap contributors'

// Ring colors follow the app's color meanings: green OK, amber away, red help.
const STATUS_COLOR: Record<string, string> = {
  together: '#34c778',
  home: '#34c778',
  heading_home: '#1a73e8',
  separated: '#f29900',
  left_alone: '#f29900',
  needs_help: '#d93025',
}

const AVATAR_PX = 36
// Width reserved per person when several stand at the same spot.
const SLOT_PX = 52
// After you drag the map yourself, auto-fit waits this long.
const USER_HOLD_MS = 20_000

const FONT = "'Google Sans','Google Sans Flex',Roboto,Inter,system-ui,sans-serif"

/**
 * Small avatar pin with the first name underneath (plus the status when it
 * isn't "with group"). `dx` shifts it sideways (px) so people standing
 * together sit side by side. `highlight` adds a pulsing ring (open alert).
 */
function memberIcon(m: Member, avatar: string | null | undefined, label: string, dx: number, highlight: boolean) {
  const color = STATUS_COLOR[m.status] ?? STATUS_COLOR.together
  const words = m.name.trim().split(/\s+/)
  const initials = words.slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || '?'
  const inner = avatar ? `<img src="${escapeHtml(avatar)}" style="width:100%;height:100%;object-fit:cover" />` : initials
  const showStatus = m.status !== 'together'
  const pulse = highlight
    ? `<span style="position:absolute;left:50%;top:${AVATAR_PX / 2}px;width:${AVATAR_PX + 8}px;height:${AVATAR_PX + 8}px;margin:-${AVATAR_PX / 2 + 4}px 0 0 -${AVATAR_PX / 2 + 4}px;border-radius:9999px;background:${color};animation:tether-pulse 1.4s ease-out infinite"></span>`
    : ''
  return L.divIcon({
    className: '',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html: `<div style="position:absolute;left:${dx}px;top:0;transform:translate(-50%,-${AVATAR_PX / 2}px);display:flex;flex-direction:column;align-items:center;width:${SLOT_PX}px">
      ${pulse}
      <div style="position:relative;width:${AVATAR_PX}px;height:${AVATAR_PX}px;flex-shrink:0;border-radius:9999px;overflow:hidden;background:linear-gradient(135deg,#ff4f8b,#ff8a3d);border:2.5px solid #fff;outline:2.5px solid ${color};color:#fff;display:flex;align-items:center;justify-content:center;font:600 13px ${FONT};box-shadow:0 2px 6px rgba(0,0,0,.35)">${inner}</div>
      <div style="margin-top:5px;width:max-content;max-width:${SLOT_PX + 48}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;background:rgb(var(--c-surface-lowest) / .95);color:rgb(var(--c-on-surface));font:500 11px/1.3 ${FONT};padding:2px 7px;border-radius:9999px;box-shadow:0 1px 3px rgba(0,0,0,.25)">${escapeHtml(words[0])}${
        showStatus ? `<span style="color:${color === STATUS_COLOR.together ? 'inherit' : color}"> · ${escapeHtml(label)}</span>` : ''
      }</div>
    </div>`,
  })
}

/** Your own spot: a Google Maps-style blue dot with a soft halo. */
const meIcon = L.divIcon({
  className: '',
  iconSize: [0, 0],
  iconAnchor: [0, 0],
  html: `<div style="position:absolute;transform:translate(-50%,-50%);width:44px;height:44px;border-radius:9999px;background:rgb(var(--c-me) / .18);display:flex;align-items:center;justify-content:center">
    <div style="width:18px;height:18px;border-radius:9999px;background:rgb(var(--c-me));border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>
  </div>`,
})

type Located = Member & LatLng

/**
 * People whose avatars would overlap on screen at the current zoom are drawn
 * as one tidy row at their average spot (west to east), so every face and
 * label stays readable.
 */
function layoutMembers(map: L.Map, ms: Located[]): { m: Located; at: LatLng; dx: number }[] {
  const pt = (m: LatLng) => map.latLngToLayerPoint([m.lat, m.lng])
  const clusters: Located[][] = []
  for (const m of ms) {
    const p = pt(m)
    const c = clusters.find((cl) =>
      cl.some((x) => {
        const q = pt(x)
        return Math.abs(q.x - p.x) < SLOT_PX * Math.max(1, cl.length) && Math.abs(q.y - p.y) < AVATAR_PX + 24
      })
    )
    if (c) c.push(m)
    else clusters.push([m])
  }
  return clusters.flatMap((c) => {
    const at = { lat: c.reduce((t, m) => t + m.lat, 0) / c.length, lng: c.reduce((t, m) => t + m.lng, 0) / c.length }
    return [...c]
      .sort((a, b) => a.lng - b.lng || a.id.localeCompare(b.id))
      .map((m, i) => ({ m, at: c.length > 1 ? at : m, dx: (i - (c.length - 1) / 2) * SLOT_PX }))
  })
}

/** Member avatars, re-laid out whenever the zoom changes. */
function MemberMarkers({
  members,
  myMemberId,
  avatars,
  highlightIds,
  onMemberClick,
}: {
  members: Located[]
  myMemberId?: string
  avatars?: Record<string, string | null>
  highlightIds?: string[]
  onMemberClick?: (memberId: string) => void
}) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  const me = members.find((m) => m.id === myMemberId)
  // `zoom` is read so the layout recomputes when it changes.
  const placed = zoom != null ? layoutMembers(map, members.filter((m) => m.id !== myMemberId)) : []
  return (
    <>
      {me && (
        <Marker
          key={me.id}
          position={[me.lat, me.lng]}
          icon={meIcon}
          zIndexOffset={500}
          eventHandlers={onMemberClick ? { click: () => onMemberClick(me.id) } : undefined}
        />
      )}
      {placed.map(({ m, at, dx }) => {
        const hot = highlightIds?.includes(m.id) ?? false
        return (
          <Marker
            key={m.id}
            position={[at.lat, at.lng]}
            icon={memberIcon(m, avatars?.[m.id], memberStatusLabel(m), dx, hot)}
            zIndexOffset={m.status === 'needs_help' || hot ? 3000 : 1000}
            eventHandlers={onMemberClick ? { click: () => onMemberClick(m.id) } : undefined}
          />
        )
      })}
    </>
  )
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
    iconSize: [30, 38],
    iconAnchor: [15, 38],
    html: `<div style="position:relative;width:30px;height:38px">
      <svg width="30" height="38" viewBox="0 0 36 46" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">
        <defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4f8b"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient></defs>
        <path d="M18 45C18 45 3 28.5 3 17.5a15 15 0 0 1 30 0C33 28.5 18 45 18 45Z" fill="url(#pg)" stroke="#fff" stroke-width="2"/>
        <circle cx="18" cy="17.5" r="11" fill="#fff"/>
        <g transform="translate(9.6 9.1) scale(0.7)" fill="none" stroke="#e8336f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${glyph}"/></g>
      </svg>
      <div style="position:absolute;top:40px;left:50%;transform:translateX(-50%);width:max-content;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgb(var(--c-primary-ink));font:600 12px ${FONT};text-shadow:0 0 3px rgb(var(--c-surface-lowest)),0 0 3px rgb(var(--c-surface-lowest)),0 0 2px rgb(var(--c-surface-lowest))">${escapeHtml(name)}</div>
    </div>`,
  })
}

/** Pink "4 accounted for" chip at the group's center. */
function groupChip(n: number) {
  return L.divIcon({
    className: '',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html: `<div style="transform:translate(-50%,-50%);width:max-content;white-space:nowrap;background:rgb(var(--c-primary));color:#fff;font:500 13px ${FONT};padding:5px 12px;border-radius:9999px;box-shadow:0 2px 6px rgba(0,0,0,.3)">${n} accounted for</div>`,
  })
}

const homeIcon = L.divIcon({
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  html: `<div style="width:28px;height:28px;border-radius:9999px;background:rgb(var(--c-surface-lowest));color:rgb(var(--c-primary-ink));display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.35)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5Z"/></svg></div>`,
})

/**
 * 'auto': refit whenever the points meaningfully move, the covered area
 *         changes, or `signal` changes. After you drag the map yourself it
 *         holds still for USER_HOLD_MS, then refits.
 * 'once': fit when points first appear and when `signal` changes ("recenter"),
 *         so a full-screen map you're panning doesn't jump around.
 */
function FitTo({
  points,
  mode,
  signal,
  bottomPad,
  topPad,
  paused,
}: {
  points: LatLng[]
  mode: 'auto' | 'once'
  signal: number
  bottomPad: number
  topPad: number
  paused: boolean
}) {
  const map = useMap()
  const [heldUntil, setHeldUntil] = useState(0)
  useEffect(() => {
    if (mode !== 'auto') return
    const onDrag = () => setHeldUntil(Date.now() + USER_HOLD_MS)
    map.on('dragstart', onDrag)
    return () => {
      map.off('dragstart', onDrag)
    }
  }, [map, mode])
  // Release the hold when it runs out; a recenter tap releases it right away.
  useEffect(() => {
    if (!heldUntil) return
    const t = window.setTimeout(() => setHeldUntil(0), Math.max(0, heldUntil - Date.now()))
    return () => window.clearTimeout(t)
  }, [heldUntil])
  useEffect(() => setHeldUntil(0), [signal])

  const pointsKey = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|')
  const key =
    mode === 'auto'
      ? `${signal}:${pointsKey}:${Math.round(bottomPad / 40)}:${Math.round(topPad / 40)}:${heldUntil > 0}:${paused}`
      : `${signal}:${points.length > 0}`
  useEffect(() => {
    if (points.length === 0 || paused || heldUntil > 0) return
    // Extra room so the big avatar labels stay on screen.
    const pad = {
      paddingTopLeft: [56, topPad + 40] as [number, number],
      paddingBottomRight: [56, bottomPad + 72] as [number, number],
    }
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 17, { animate: false })
      map.panBy([0, (bottomPad - topPad) / 2], { animate: false })
    } else map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { ...pad, maxZoom: 18 })
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
  topPad = 140,
  fitPaused = false,
  onMemberClick,
  onLongPress,
  onPinClick,
  onReady,
  avatars,
  highlightIds,
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
  /** Pixels covered at the top (e.g. the summary bar). */
  topPad?: number
  /** Stop auto-fitting (e.g. while picking a spot on the map). */
  fitPaused?: boolean
  /** Tap a person's avatar. */
  onMemberClick?: (memberId: string) => void
  onLongPress?: (p: LatLng) => void
  onPinClick?: (pinId: string) => void
  onReady?: (m: L.Map) => void
  /** member id -> picture URL for markers. */
  avatars?: Record<string, string | null>
  /** Members to draw with a pulsing ring (e.g. an open separation alert). */
  highlightIds?: string[]
}) {
  const { mode } = useTheme()
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
      style={{ background: 'rgb(var(--c-surface-high))' }}
    >
      {MAPTILER_KEY ? (
        <TileLayer key={mode} url={tileUrl(mode)} attribution={TILE_ATTRIB} />
      ) : (
        <div className="pointer-events-none absolute inset-0 z-[450] flex items-center justify-center p-4 text-center">
          <p className="rounded-xl bg-surface-lowest/90 px-4 py-3 text-base text-ink-dim shadow-e1">
            {import.meta.env.DEV ? (
              <>
                Map unavailable: add <span className="font-mono text-ink">VITE_MAPTILER_KEY</span> to .env and restart the
                dev server.
              </>
            ) : (
              'Map unavailable right now.'
            )}
          </p>
        </div>
      )}
      <FitTo points={fitPoints} mode={fitMode} signal={recenterSignal} bottomPad={bottomPad} topPad={topPad} paused={fitPaused} />
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
            pathOptions={{ color: '#ff4f8b', weight: 1, opacity: 0.35, fillOpacity: 0.06 }}
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
      <MemberMarkers
        // With the group chip on, members who are together are represented by it.
        members={located.filter(
          (m) => !(showGroupChip && m.status === 'together' && located.filter((x) => x.status === 'together').length >= 2)
        )}
        myMemberId={myMemberId}
        avatars={avatars}
        highlightIds={highlightIds}
        onMemberClick={onMemberClick}
      />
    </MapContainer>
  )
}
