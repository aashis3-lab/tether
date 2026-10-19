import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export type SheetSnap = 'collapsed' | 'half' | 'full'

const HANDLE_PX = 22
const DRAG_THRESHOLD_PX = 6

/**
 * Find My-style draggable sheet over a full-screen map.
 *  - `header` is pinned at the top and visible in every state (collapsed shows
 *    only the handle + header).
 *  - `children` scroll underneath it in half / full.
 *  - Drag the handle/header to resize; release snaps to the nearest state.
 *    A short tap on the handle cycles collapsed → half → full → collapsed.
 */
export function BottomSheet({
  snap,
  onSnap,
  header,
  children,
  onHeight,
}: {
  snap: SheetSnap
  onSnap: (s: SheetSnap) => void
  header: ReactNode
  children: ReactNode
  /** Current visible height in px (for map padding / floating buttons). */
  onHeight?: (px: number) => void
}) {
  const headerRef = useRef<HTMLDivElement>(null)
  const safeRef = useRef<HTMLDivElement>(null)
  const [headerH, setHeaderH] = useState(150)
  const [vh, setVh] = useState(() => window.innerHeight)
  const [dragH, setDragH] = useState<number | null>(null)
  const drag = useRef<{ startY: number; startH: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)

  // Track header size (it changes between compact/roomy) and the viewport.
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeaderH(el.offsetHeight))
    ro.observe(el)
    setHeaderH(el.offsetHeight)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    const onResize = () => setVh(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const safe = safeRef.current?.offsetHeight ?? 0
  const heights: Record<SheetSnap, number> = {
    collapsed: HANDLE_PX + headerH + safe + 8,
    half: Math.max(HANDLE_PX + headerH + 180, Math.round(vh * 0.52)),
    full: Math.round(vh * 0.9),
  }
  const height = dragH ?? heights[snap]

  useEffect(() => {
    onHeight?.(height)
  }, [height, onHeight])

  const nearest = useCallback(
    (h: number): SheetSnap =>
      (Object.entries(heights) as [SheetSnap, number][]).reduce((best, cur) =>
        Math.abs(cur[1] - h) < Math.abs(best[1] - h) ? cur : best
      )[0],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [heights.collapsed, heights.half, heights.full]
  )

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { startY: e.clientY, startH: height, moved: false }
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    const dy = d.startY - e.clientY
    if (!d.moved && Math.abs(dy) < DRAG_THRESHOLD_PX) return
    if (!d.moved) {
      d.moved = true
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
    setDragH(Math.min(heights.full, Math.max(heights.collapsed - 20, d.startH + dy)))
  }
  function onPointerUp() {
    const d = drag.current
    drag.current = null
    if (d?.moved && dragH != null) {
      suppressClick.current = true
      onSnap(nearest(dragH))
    }
    setDragH(null)
  }

  const cycle = () => onSnap(snap === 'collapsed' ? 'half' : snap === 'half' ? 'full' : 'collapsed')

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[900] flex justify-center">
      <div
        className={`pointer-events-auto flex w-full max-w-app flex-col overflow-hidden rounded-t-[28px] bg-surface-low shadow-[0_-2px_12px_rgb(0_0_0/0.12)] ${
          dragH == null ? 'transition-[height] duration-300 ease-[cubic-bezier(0.2,0,0,1)]' : ''
        }`}
        style={{ height }}
      >
        {/* Drag zone: handle + pinned header. */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClickCapture={(e) => {
            if (suppressClick.current) {
              suppressClick.current = false
              e.stopPropagation()
              e.preventDefault()
            }
          }}
          style={{ touchAction: 'none' }}
          className="shrink-0"
        >
          <button
            aria-label={snap === 'full' ? 'Collapse' : 'Expand'}
            onClick={cycle}
            className="flex w-full items-center justify-center"
            style={{ height: HANDLE_PX }}
          >
            <span className="h-1 w-8 rounded-full bg-outline/50" />
          </button>
          <div ref={headerRef} className="px-4">
            {header}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
          {children}
        </div>
        <div ref={safeRef} aria-hidden="true" className="pointer-events-none absolute h-[env(safe-area-inset-bottom)] w-0" />
      </div>
    </div>
  )
}
