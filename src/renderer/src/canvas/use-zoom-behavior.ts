import { useLayoutEffect, useRef, type RefObject } from 'react'
import { pointer, select } from 'd3-selection'
import { zoomIdentity, zoomTransform, type ZoomBehavior } from 'd3-zoom'
import { createZoomBehavior } from './create-zoom-behavior'
import { computeFitTransform } from './fit-transform'
import { WheelAnimator, interpretWheel } from './wheel-input'

export {
  MIN_SCALE,
  MAX_SCALE,
  PAN_MARGIN,
  FIT_MARGIN,
  TARGET_VISIBLE_DOCS,
  BUTTON_ZOOM_FACTOR
} from './zoom-constants'

interface Dims {
  contentWidth: number
  contentHeight: number
  slotHeight: number
}

interface ZoomBehaviorArgs {
  viewportRef: RefObject<HTMLDivElement | null>
  worldRef: RefObject<HTMLDivElement | null>
  overlayRef: RefObject<HTMLDivElement | null>
  userMovedRef: RefObject<boolean>
  dims: RefObject<Dims>
  onScaleChange?: (scale: number) => void
  onSettle?: () => void
}

export function useZoomBehavior({
  viewportRef,
  worldRef,
  overlayRef,
  userMovedRef,
  dims,
  onScaleChange,
  onSettle
}: ZoomBehaviorArgs): {
  zoomRef: RefObject<ZoomBehavior<HTMLDivElement, unknown> | null>
  fitTransform: () => ReturnType<typeof zoomIdentity.translate>
} {
  const zoomRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTick = useRef(0)
  const onScaleRef = useRef(onScaleChange)
  onScaleRef.current = onScaleChange
  const onSettleRef = useRef(onSettle)
  onSettleRef.current = onSettle

  const fitTransform = (): ReturnType<typeof zoomIdentity.translate> =>
    computeFitTransform(viewportRef.current!, dims.current!)

  useLayoutEffect(() => {
    const vp = viewportRef.current
    if (!vp) return

    const zoomBehavior = createZoomBehavior({
      vp,
      worldRef,
      overlayRef,
      userMovedRef,
      idleTimer,
      lastTick,
      onScaleRef,
      onSettleRef
    })

    zoomRef.current = zoomBehavior
    const sel = select(vp)
    sel.call(zoomBehavior)
    sel.on('dblclick.zoom', null)

    const animator = new WheelAnimator({
      zoomBy(factor, anchor) {
        const before = zoomTransform(vp).k
        zoomBehavior.scaleBy(sel, factor, anchor)
        return zoomTransform(vp).k / before
      },
      panBy(dx, dy) {
        const k = zoomTransform(vp).k
        zoomBehavior.translateBy(sel, -dx / k, -dy / k)
      }
    })

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const intent = interpretWheel(event, vp.clientHeight)
      if (intent.kind === 'zoom') {
        const anchor = pointer(event, vp) as [number, number]
        if (intent.smooth) animator.zoom(intent.factor, anchor)
        else zoomBehavior.scaleBy(sel, intent.factor, anchor)
      } else if (intent.smooth) {
        animator.pan(intent.dx, intent.dy)
      } else {
        const k = zoomTransform(vp).k
        zoomBehavior.translateBy(sel, -intent.dx / k, -intent.dy / k)
      }
    }
    // A grab ends any glide still in flight so the canvas doesn't drift
    // away from under the pointer.
    zoomBehavior.on('start.wheel', (event) => {
      if (event.sourceEvent && event.sourceEvent.type !== 'wheel') animator.stop()
    })
    vp.addEventListener('wheel', onWheel, { passive: false })

    const resize = new ResizeObserver(() => {
      zoomBehavior.extent([
        [0, 0],
        [vp.clientWidth, vp.clientHeight]
      ])
    })
    resize.observe(vp)

    return () => {
      vp.removeEventListener('wheel', onWheel)
      animator.stop()
      resize.disconnect()
      sel.on('.zoom', null)
      if (idleTimer.current) clearTimeout(idleTimer.current)
    }
  }, [])

  return { zoomRef, fitTransform }
}
