import { useRef, useState } from 'react'
import type { ElementPoint, TextStyle } from '../../elements/types'
import { TextEditor } from './TextEditor'

interface CalloutLayerProps {
  style: TextStyle
  naturalWidth: number
  naturalHeight: number
  onCommit: (anchor: ElementPoint, origin: ElementPoint, text: string) => void
}

// Where the text goes when the tool is clicked without a drag, in points.
const DEFAULT_OFFSET = { x: 36, y: -44 }

// Press on the point to call out, drag to where the text should go, release
// and type. Enter makes a new line; a click outside or Esc finishes.
export function CalloutLayer({
  style,
  naturalWidth,
  naturalHeight,
  onCommit
}: CalloutLayerProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ anchor: ElementPoint; to: ElementPoint } | null>(null)
  const [typing, setTyping] = useState<{ anchor: ElementPoint; origin: ElementPoint } | null>(null)

  const pointFrom = (event: React.PointerEvent): ElementPoint | null => {
    const b = ref.current?.getBoundingClientRect()
    if (!b || b.width === 0 || b.height === 0) return null
    const clamp = (v: number): number => Math.min(1, Math.max(0, v))
    return {
      x: clamp((event.clientX - b.left) / b.width),
      y: clamp((event.clientY - b.top) / b.height)
    }
  }

  const scale = (): number => (ref.current?.clientHeight ?? naturalHeight) / naturalHeight

  return (
    <div
      ref={ref}
      className="draw-layer callout-layer"
      onPointerDown={(event) => {
        event.stopPropagation()
        if (event.target !== event.currentTarget) return
        if (typing) {
          setTyping(null)
          return
        }
        const point = pointFrom(event)
        if (!point) return
        event.currentTarget.setPointerCapture(event.pointerId)
        setDrag({ anchor: point, to: point })
      }}
      onPointerMove={(event) => {
        if (!drag) return
        const point = pointFrom(event)
        if (point) setDrag({ ...drag, to: point })
      }}
      onPointerUp={(event) => {
        event.stopPropagation()
        if (!drag) return
        const moved = Math.hypot(
          (drag.to.x - drag.anchor.x) * naturalWidth,
          (drag.to.y - drag.anchor.y) * naturalHeight
        )
        const origin =
          moved < 6
            ? {
                x: Math.min(0.95, drag.anchor.x + DEFAULT_OFFSET.x / naturalWidth),
                y: Math.max(0.02, drag.anchor.y + DEFAULT_OFFSET.y / naturalHeight)
              }
            : drag.to
        setDrag(null)
        setTyping({ anchor: drag.anchor, origin })
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {drag && (
        <svg
          viewBox={`0 0 ${naturalWidth} ${naturalHeight}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line
            x1={drag.anchor.x * naturalWidth}
            y1={drag.anchor.y * naturalHeight}
            x2={drag.to.x * naturalWidth}
            y2={drag.to.y * naturalHeight}
            stroke={style.color}
            strokeWidth={1}
          />
        </svg>
      )}
      {typing && (
        <TextEditor
          origin={typing.origin}
          scale={scale()}
          fontSize={style.fontSize}
          look={style}
          color={style.color}
          onCommit={(text) => {
            const done = typing
            setTyping(null)
            onCommit(done.anchor, done.origin, text)
          }}
          onCancel={() => setTyping(null)}
        />
      )}
    </div>
  )
}
