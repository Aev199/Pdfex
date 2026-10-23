import { useEffect } from 'react'
import { ARROW_PAN, clamp, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from './geometry'
import type { View } from './geometry'
import { getSettings } from '../../app/settings-store'
import { WheelAnimator, interpretWheel } from '../../canvas/wheel-input'
import type { FullViewControls } from './use-full-view-controls'

interface InputOptions extends FullViewControls {
  scrollRef: React.RefObject<HTMLDivElement | null>
  zoomedRef: React.MutableRefObject<boolean>
  viewRef: React.MutableRefObject<View>
  phaseRef: React.MutableRefObject<'opening' | 'open' | 'closing'>
  editingRef: React.MutableRefObject<boolean>
  finishEdit: () => void
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
}

export function useFullViewInput(opts: InputOptions): void {
  const { scrollRef, zoomedRef, viewRef, phaseRef, editingRef, finishEdit } = opts
  const { resetView, applyZoom, panBy, navByKey, runClose } = opts

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) return
      if (event.key === 'Escape') {
        if (editingRef.current) finishEdit()
        else runClose()
        return
      }
      if (phaseRef.current !== 'open') return
      if (zoomedRef.current) {
        if (event.key === 'ArrowLeft') panBy(ARROW_PAN, 0)
        else if (event.key === 'ArrowRight') panBy(-ARROW_PAN, 0)
        else if (event.key === 'ArrowUp') panBy(0, ARROW_PAN)
        else if (event.key === 'ArrowDown') panBy(0, -ARROW_PAN)
        else return
        event.preventDefault()
        return
      }
      if (event.key === 'ArrowRight') navByKey('x', 1)
      else if (event.key === 'ArrowLeft') navByKey('x', -1)
      else if (event.key === 'ArrowDown') navByKey('y', 1)
      else if (event.key === 'ArrowUp') navByKey('y', -1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [runClose, navByKey, panBy, finishEdit])

  useEffect(() => {
    return window.api.onZoom((action) => {
      if (phaseRef.current !== 'open') return
      if (action === 'in') applyZoom((z) => z * ZOOM_STEP)
      else if (action === 'out') applyZoom((z) => z / ZOOM_STEP)
      else resetView()
    })
  }, [applyZoom, resetView])

  useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    const animator = new WheelAnimator({
      zoomBy(factor, anchor) {
        const before = viewRef.current.zoom
        const after = clamp(before * factor, MIN_ZOOM, MAX_ZOOM)
        applyZoom((z) => z * factor, { x: anchor[0], y: anchor[1] })
        return after / before
      },
      panBy(dx, dy) {
        panBy(-dx, -dy)
      }
    })
    const onWheel = (event: WheelEvent): void => {
      if (phaseRef.current !== 'open') {
        event.preventDefault()
        return
      }
      const intent = interpretWheel(event, sc.clientHeight, getSettings().wheel === 'zoom')
      if (intent.kind === 'zoom') {
        event.preventDefault()
        if (intent.smooth) animator.zoom(intent.factor, [event.clientX, event.clientY])
        else applyZoom((z) => z * intent.factor, { x: event.clientX, y: event.clientY })
        return
      }
      if (zoomedRef.current) {
        event.preventDefault()
        if (intent.smooth) animator.pan(intent.dx, intent.dy)
        else panBy(-intent.dx, -intent.dy)
        return
      }
      if (editingRef.current && Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
        event.preventDefault()
        panBy(0, -event.deltaY)
      }
    }
    sc.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      sc.removeEventListener('wheel', onWheel)
      animator.stop()
    }
  }, [applyZoom, panBy])
}
