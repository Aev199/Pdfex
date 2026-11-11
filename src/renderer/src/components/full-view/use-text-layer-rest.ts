import { useEffect, useLayoutEffect, useRef } from 'react'
import type { View } from './geometry'

// A drawing can carry thousands of text items, and the reader lays a span
// over each one so text can be selected. While the page is zoomed or panned
// the browser re-composes every one of those spans on every frame, which
// costs several frames' worth of time each; the page itself is a bitmap and
// moves for free. So heavy text layers are not painted while the view moves.
//
// Painting them again is itself a long step, so it does not happen the
// moment the view stops (the next wheel notch would wait for it) but when
// the pointer moves on, or after a short rest.

// Layers with fewer children than this cost nothing worth hiding.
const HEAVY_CHILDREN = 1500
// The view counts as still this long after its last change.
const STILL_MS = 180
// Text comes back by itself this long after the last change.
const REST_MS = 900
// Pointer travel that counts as moving on, in pixels.
const POINTER_SLACK = 4

const HIDDEN = 'resting'

export function useTextLayerRest(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  view: View
): void {
  const hidden = useRef<HTMLElement[]>([])
  const movedAt = useRef(0)
  const timer = useRef<number | null>(null)
  const pointerFrom = useRef<{ x: number; y: number } | null>(null)
  const mounted = useRef(false)

  const show = useRef((): void => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    for (const layer of hidden.current) delete layer.dataset[HIDDEN]
    hidden.current = []
  }).current

  // Before the moved frame is painted.
  useLayoutEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    const sc = scrollRef.current
    if (!sc) return
    movedAt.current = performance.now()
    pointerFrom.current = null
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(show, REST_MS)
    if (hidden.current.length > 0) return
    for (const layer of sc.querySelectorAll<HTMLElement>('.find-layer')) {
      if (layer.childElementCount < HEAVY_CHILDREN) continue
      layer.dataset[HIDDEN] = ''
      hidden.current.push(layer)
    }
  }, [view])

  useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    const onMove = (event: PointerEvent): void => {
      if (hidden.current.length === 0 || event.buttons !== 0) return
      if (performance.now() - movedAt.current < STILL_MS) return
      const from = pointerFrom.current ?? (pointerFrom.current = { x: event.x, y: event.y })
      if (Math.hypot(event.x - from.x, event.y - from.y) >= POINTER_SLACK) show()
    }
    sc.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      sc.removeEventListener('pointermove', onMove)
      show()
    }
  }, [])
}
