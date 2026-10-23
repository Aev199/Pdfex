import { useRef, useState } from 'react'
import { elementHit } from '../../elements/erase'
import type { ElementPoint, PageElement } from '../../elements/types'

interface EraseLayerProps {
  elements: PageElement[]
  naturalWidth: number
  naturalHeight: number
  onErase: (ids: string[]) => void
}

// Sweep over pen strokes, shapes or text boxes to remove them; everything
// touched in one sweep goes in one undo step.
const RADIUS_POINTS = 6

export function EraseLayer({
  elements,
  naturalWidth,
  naturalHeight,
  onErase
}: EraseLayerProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [hits, setHits] = useState<Set<string> | null>(null)

  const pointFrom = (event: React.PointerEvent): ElementPoint | null => {
    const b = ref.current?.getBoundingClientRect()
    if (!b || b.width === 0 || b.height === 0) return null
    return { x: (event.clientX - b.left) / b.width, y: (event.clientY - b.top) / b.height }
  }

  const sweep = (event: React.PointerEvent, current: Set<string>): Set<string> => {
    const point = pointFrom(event)
    if (!point) return current
    let next = current
    for (const element of elements) {
      if (current.has(element.id)) continue
      if (elementHit(element, point, RADIUS_POINTS, naturalWidth, naturalHeight)) {
        if (next === current) next = new Set(current)
        next.add(element.id)
      }
    }
    return next
  }

  return (
    <div
      ref={ref}
      className="draw-layer erase-layer"
      onPointerDown={(event) => {
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        setHits(sweep(event, new Set()))
      }}
      onPointerMove={(event) => {
        if (hits) setHits(sweep(event, hits))
      }}
      onPointerUp={(event) => {
        event.stopPropagation()
        if (hits && hits.size > 0) onErase([...hits])
        setHits(null)
      }}
      onPointerCancel={() => setHits(null)}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {hits && hits.size > 0 && (
        <svg
          viewBox={`0 0 ${naturalWidth} ${naturalHeight}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {elements
            .filter((e) => hits.has(e.id))
            .map((e) => (
              <rect
                key={e.id}
                className="erase-hit"
                x={e.bbox.x * naturalWidth}
                y={e.bbox.y * naturalHeight}
                width={e.bbox.w * naturalWidth}
                height={e.bbox.h * naturalHeight}
              />
            ))}
        </svg>
      )}
    </div>
  )
}
