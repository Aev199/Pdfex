import { useEffect, useRef, useState } from 'react'
import { measureLabel } from '../../elements/measures'
import { measurePathData, MeasureLabel } from './ElementMeasure'
import type { DrawStyle, ElementPoint, MeasureMode, MeasureScale } from '../../elements/types'

interface MeasureLayerProps {
  // 'calibrate' draws one length to set the scale from.
  mode: MeasureMode | 'calibrate'
  style: DrawStyle
  scale: MeasureScale
  naturalWidth: number
  naturalHeight: number
  // Page size in points, for the running label.
  pageWidth: number
  pageHeight: number
  onCommit: (points: ElementPoint[]) => void
}

// A length is one drag (Shift keeps 45° steps). A polyline or an area is a
// click per point: double-click or Enter finishes, Backspace takes back the
// last point, Esc drops it all.
export function MeasureLayer({
  mode,
  style,
  scale,
  naturalWidth,
  naturalHeight,
  pageWidth,
  pageHeight,
  onCommit
}: MeasureLayerProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [points, setPoints] = useState<ElementPoint[]>([])
  const [hover, setHover] = useState<ElementPoint | null>(null)
  const [dragging, setDragging] = useState(false)
  const single = mode === 'distance' || mode === 'calibrate'

  const pointFrom = (event: { clientX: number; clientY: number }): ElementPoint | null => {
    const b = ref.current?.getBoundingClientRect()
    if (!b || b.width === 0 || b.height === 0) return null
    const clamp = (v: number): number => Math.min(1, Math.max(0, v))
    return {
      x: clamp((event.clientX - b.left) / b.width),
      y: clamp((event.clientY - b.top) / b.height)
    }
  }

  const snap = (from: ElementPoint | undefined, to: ElementPoint, shift: boolean): ElementPoint => {
    if (!shift || !from) return to
    const dx = (to.x - from.x) * naturalWidth
    const dy = (to.y - from.y) * naturalHeight
    const step = Math.PI / 4
    const angle = Math.round(Math.atan2(dy, dx) / step) * step
    const len = Math.hypot(dx, dy)
    return {
      x: from.x + (Math.cos(angle) * len) / naturalWidth,
      y: from.y + (Math.sin(angle) * len) / naturalHeight
    }
  }

  const finish = (list: ElementPoint[]): void => {
    setPoints([])
    setHover(null)
    if (list.length >= 2) onCommit(list)
  }

  const stateRef = useRef({ points, finish })
  stateRef.current = { points, finish }
  useEffect(() => {
    if (single) return
    const onKey = (event: KeyboardEvent): void => {
      const { points: list, finish: done } = stateRef.current
      if (list.length === 0) return
      if (event.key === 'Enter') {
        event.preventDefault()
        done(list)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setPoints([])
      } else if (event.key === 'Backspace') {
        event.preventDefault()
        setPoints(list.slice(0, -1))
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [single])

  const preview = hover && points.length > 0 && !single ? [...points, hover] : points
  const previewMode: MeasureMode = mode === 'calibrate' ? 'distance' : mode
  return (
    <div
      ref={ref}
      className="draw-layer measure-layer"
      onPointerDown={(event) => {
        event.stopPropagation()
        const point = pointFrom(event)
        if (!point) return
        if (single) {
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragging(true)
          setPoints([point, point])
        } else {
          setPoints((list) => [...list, snap(list[list.length - 1], point, event.shiftKey)])
        }
      }}
      onPointerMove={(event) => {
        const point = pointFrom(event)
        if (!point) return
        if (single) {
          if (dragging) setPoints((list) => [list[0], snap(list[0], point, event.shiftKey)])
        } else {
          setHover(snap(points[points.length - 1], point, event.shiftKey))
        }
      }}
      onPointerUp={(event) => {
        event.stopPropagation()
        if (single && dragging) {
          setDragging(false)
          finish(points)
        }
      }}
      onPointerCancel={() => {
        setDragging(false)
        setPoints([])
      }}
      onDoubleClick={(event) => {
        event.stopPropagation()
        // The double-click's second press added a point on top of the last.
        if (!single) finish(points.slice(0, -1))
      }}
    >
      {preview.length >= 2 && (
        <svg
          viewBox={`0 0 ${naturalWidth} ${naturalHeight}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d={measurePathData({ mode: previewMode, points: preview }, naturalWidth, naturalHeight)}
            fill={previewMode === 'area' ? style.color : 'none'}
            fillOpacity={0.12}
            stroke={style.color}
            strokeWidth={Math.min(style.strokeWidth, 2)}
            strokeDasharray={mode === 'calibrate' ? '4 3' : undefined}
          />
          {mode !== 'calibrate' && (
            <MeasureLabel
              element={{ mode: previewMode, points: preview, color: style.color }}
              width={naturalWidth}
              height={naturalHeight}
              text={measureLabel(previewMode, preview, scale, pageWidth, pageHeight)}
            />
          )}
        </svg>
      )}
    </div>
  )
}
