import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { select } from 'd3-selection'
import { zoomIdentity } from 'd3-zoom'
import type { CanvasView } from '../app/workspaces'
import { useZoomBehavior, PAN_MARGIN } from '../canvas/use-zoom-behavior'
import { createCanvasHandle } from '../canvas/canvas-handle'

export interface CanvasHandle {
  zoomIn(): void
  zoomOut(): void
  reset(): void
  clientToWorld(clientX: number, clientY: number): { x: number; y: number; k: number } | null
  getView(): CanvasView | null
}

interface CanvasProps {
  contentWidth: number
  contentHeight: number
  slotHeight: number
  dragging?: boolean
  // Where to put the camera when content first appears (a workspace coming
  // back into view); fits the content when absent.
  initialView?: CanvasView | null
  onScaleChange?: (scale: number) => void
  onSettle?: () => void
  onBackgroundClick?: () => void
  children: React.ReactNode
  overlay?: React.ReactNode
}

export const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas(
  {
    contentWidth,
    contentHeight,
    slotHeight,
    dragging,
    initialView,
    onScaleChange,
    onSettle,
    onBackgroundClick,
    children,
    overlay
  },
  ref
) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const userMovedRef = useRef(false)
  const hadContentRef = useRef(false)
  const dims = useRef({ contentWidth, contentHeight, slotHeight })
  dims.current = { contentWidth, contentHeight, slotHeight }
  const draggingRef = useRef(dragging)
  const initialViewRef = useRef(initialView ?? null)
  draggingRef.current = dragging

  const { zoomRef, animatorRef, fitTransform } = useZoomBehavior({
    viewportRef,
    worldRef,
    overlayRef,
    userMovedRef,
    dims,
    onScaleChange,
    onSettle
  })

  useLayoutEffect(() => {
    const vp = viewportRef.current
    const zoomBehavior = zoomRef.current
    if (!vp || !zoomBehavior) return
    zoomBehavior.extent([
      [0, 0],
      [vp.clientWidth, vp.clientHeight]
    ])
    const mx = contentWidth * PAN_MARGIN
    const my = contentHeight * PAN_MARGIN
    zoomBehavior.translateExtent([
      [-mx, -my],
      [contentWidth + mx, contentHeight + my]
    ])
    const hasContent = contentWidth > 1 && contentHeight > 1
    if (hasContent && !hadContentRef.current && !draggingRef.current) {
      const start = initialViewRef.current
      initialViewRef.current = null
      select(vp).call(
        zoomBehavior.transform,
        start ? zoomIdentity.translate(start.x, start.y).scale(start.k) : fitTransform()
      )
    }
    hadContentRef.current = hasContent
  }, [contentWidth, contentHeight])

  useImperativeHandle(ref, () => createCanvasHandle({ viewportRef, zoomRef, animatorRef, fitTransform }))

  return (
    <div
      className="canvas-viewport"
      ref={viewportRef}
      onClick={(event) => {
        const target = event.target as Element
        if (
          !target.closest('.page') &&
          !target.closest('button') &&
          !target.closest('.doc-header')
        ) {
          onBackgroundClick?.()
        }
      }}
    >
      <div className="canvas-world" ref={worldRef}>
        {children}
      </div>
      <div className="canvas-overlay" ref={overlayRef}>
        {overlay}
      </div>
    </div>
  )
})
