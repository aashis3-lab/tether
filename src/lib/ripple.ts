/**
 * Material touch ripple for every button and link. The ripple is drawn in a
 * fixed overlay shaped like the pressed element (same box and corner radius),
 * so it never changes the element's own layout or styles.
 */
export function installRipple() {
  const SELECTOR = 'button:not(:disabled):not([data-no-ripple]), a[href], [role="button"], [data-ripple]'

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return
      const el = (e.target as Element | null)?.closest?.(SELECTOR) as HTMLElement | null
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const style = getComputedStyle(el)

      const host = document.createElement('span')
      host.className = 'm3-ripple-host'
      Object.assign(host.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        borderRadius: style.borderRadius,
        color: style.color,
      })
      const size = Math.hypot(rect.width, rect.height) * 2
      const dot = document.createElement('span')
      dot.className = 'm3-ripple'
      Object.assign(dot.style, {
        width: `${size}px`,
        height: `${size}px`,
        left: `${e.clientX - rect.left - size / 2}px`,
        top: `${e.clientY - rect.top - size / 2}px`,
      })
      host.appendChild(dot)
      document.body.appendChild(host)
      window.setTimeout(() => host.remove(), 500)
    },
    { passive: true }
  )
}
