import { useEffect, useState, type RefObject } from 'react'

/** Live height of an element in px (0 until mounted), e.g. for map padding. */
export function useElementHeight(ref: RefObject<HTMLElement>, dep?: unknown) {
  const [h, setH] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setH(el.offsetHeight)
    const ro = new ResizeObserver(() => setH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, dep])
  return h
}
