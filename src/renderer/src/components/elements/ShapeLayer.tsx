import { useRef, useState } from 'react'
import { shapePathData } from '../../elements/shapes'
import type { DrawStyle, ElementPoint, ShapeKind } from '../../elements/types'

interface ShapeLayerProps {
  shape: ShapeKind
  style: DrawStyle
  naturalWidth: number
  naturalHeight: number
  onCommit: (from: ElementPoint, to: ElementPoint) => void
}

// Drag from one corner (or end) to the other. Shift keeps lines at 45° steps
// and makes rectangles and ellipses square or round.
export function ShapeLayer({
  shape,
  style,
  naturalWidth,
  naturalHeight,
  onCommit
}: ShapeLayerProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ from: ElementPoint; to: ElementPoint } | null>(null)

  const pointFrom = (event: React.PointerEvent): ElementPoint | null => {
    const b = ref.current?.getBoundingClientRect()
    if (!b || b.width === 0 || b.height === 0) return null
    const clamp = (v: number): number => Math.min(1, Math.max(0, v))
    return {
      x: clamp((event.clientX - b.left) / b.width),
      y: clamp((event.clientY - b.top) / b.height)
    }
  }

  const constrain = (from: ElementPoint, to: ElementPoint, shift: boolean): ElementPoint => {
    if (!shift) return to
    // In points, so 45° and squares are true on the page.
    const dx = (to.x - from.x) * naturalWidth
    const dy = (to.y - from.y) * naturalHeight
    if (shape === 'line' || shape === 'arrow') {
      const step = Math.PI / 4
      const angle = Math.round(Math.atan2(dy, dx) / step) * step
      const len = Math.hypot(dx, dy)
      return {
        x: from.x + (Math.cos(angle) * len) / naturalWidth,
        y: from.y + (Math.sin(angle) * len) / naturalHeight
      }
    }
    const side = Math.max(Math.abs(dx), Math.abs(dy))
    return {
      x: from.x + (Math.sign(dx) * side) / naturalWidth,
      y: from.y + (Math.sign(dy) * side) / naturalHeight
    }
  }

  return (
    <div
      ref={ref}
      className="draw-layer"
      onPointerDown={(event) => {
        event.stopPropagation()
        const point = pointFrom(event)
        if (!point) return
        event.currentTarget.setPointerCapture(event.pointerId)
        setDrag({ from: point, to: point })
      }}
      onPointerMove={(event) => {
        if (!drag) return
        const point = pointFrom(event)
        if (point) setDrag({ from: drag.from, to: constrain(drag.from, point, event.shiftKey) })
      }}
      onPointerUp={(event) => {
        event.stopPropagation()
        if (drag) onCommit(drag.from, drag.to)
        setDrag(null)
      }}
      onPointerCancel={() => setDrag(null)}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {drag && (
        <svg
          viewBox={`0 0 ${naturalWidth} ${naturalHeight}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d={shapePathData(
              { shape, ...drag, strokeWidth: style.strokeWidth },
              naturalWidth,
              naturalHeight
            )}
            fill="none"
            stroke={style.color}
            strokeWidth={style.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="miter"
          />
        </svg>
      )}
    </div>
  )
}
