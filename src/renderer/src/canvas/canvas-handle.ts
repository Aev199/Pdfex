import { select } from 'd3-selection'
import { zoomTransform, type zoomIdentity, type ZoomBehavior } from 'd3-zoom'
import { BUTTON_ZOOM_FACTOR } from './use-zoom-behavior'
import type { RefObject } from 'react'
import type { CanvasHandle } from '../components/Canvas'
import type { WheelAnimator } from './wheel-input'

interface CanvasHandleArgs {
  viewportRef: RefObject<HTMLDivElement | null>
  zoomRef: RefObject<ZoomBehavior<HTMLDivElement, unknown> | null>
  animatorRef: RefObject<WheelAnimator | null>
  fitTransform: () => ReturnType<typeof zoomIdentity.translate>
}

const center = (vp: HTMLDivElement): [number, number] => [vp.clientWidth / 2, vp.clientHeight / 2]

export function createCanvasHandle({
  viewportRef,
  zoomRef,
  animatorRef,
  fitTransform
}: CanvasHandleArgs): CanvasHandle {
  // Button and keyboard zoom glide like a wheel notch instead of jumping.
  const zoomBy = (factor: number): void => {
    const vp = viewportRef.current
    if (!vp || !zoomRef.current) return
    if (animatorRef.current) animatorRef.current.zoom(factor, center(vp))
    else zoomRef.current.scaleBy(select(vp), factor, center(vp))
  }
  return {
    zoomIn() {
      zoomBy(BUTTON_ZOOM_FACTOR)
    },
    zoomOut() {
      zoomBy(1 / BUTTON_ZOOM_FACTOR)
    },
    reset() {
      const vp = viewportRef.current
      if (!vp || !zoomRef.current) return
      animatorRef.current?.stop()
      zoomRef.current.transform(select(vp), fitTransform())
    },
    clientToWorld(clientX, clientY) {
      const vp = viewportRef.current
      if (!vp) return null
      const rect = vp.getBoundingClientRect()
      const t = zoomTransform(vp)
      return { x: t.invertX(clientX - rect.left), y: t.invertY(clientY - rect.top), k: t.k }
    }
  }
}
