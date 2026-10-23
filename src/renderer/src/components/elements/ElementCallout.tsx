import { shapePathData } from '../../elements/shapes'
import { calloutGeometry } from '../../elements/callouts'
import { TEXT_BASELINE, TEXT_FONT_FAMILIES, TEXT_LINE_HEIGHT, lookOf } from '../../elements/types'
import type { CalloutElement } from '../../elements/types'
import { lineSpans } from '../../elements/text-marks'

interface ElementCalloutProps {
  element: CalloutElement
  width: number
  height: number
  interactive: boolean
  hovered: boolean
  selected: boolean
  zoomScale: number
  offset: { dx: number; dy: number } | null
  onHover: (id: string | null) => void
  onDragStart: (id: string, clientX: number, clientY: number) => void
  onEdit: (id: string) => void
}

const CALLOUT_STROKE = 1
const OUTLINE_PADDING = 4

export function ElementCallout({
  element,
  width,
  height,
  interactive,
  hovered,
  selected,
  zoomScale,
  offset,
  onHover,
  onDragStart,
  onEdit
}: ElementCalloutProps): React.JSX.Element {
  const { frame, start } = calloutGeometry(element, width, height)
  const look = lookOf(element)
  const arrow = shapePathData(
    { shape: 'arrow', from: start, to: element.anchor, strokeWidth: CALLOUT_STROKE },
    width,
    height
  )
  const box = { x: frame.x * width, y: frame.y * height, w: frame.w * width, h: frame.h * height }
  const lineHeight = element.fontSize * TEXT_LINE_HEIGHT
  const outlined = hovered || selected
  return (
    <g transform={offset ? `translate(${offset.dx * width} ${offset.dy * height})` : undefined}>
      {outlined && (
        <rect
          className="element-outline"
          x={box.x}
          y={box.y}
          width={box.w}
          height={box.h}
          fill="none"
          strokeWidth={OUTLINE_PADDING / zoomScale}
        />
      )}
      <path d={arrow} fill="none" stroke={element.color} strokeWidth={CALLOUT_STROKE} />
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        fill="#ffffff"
        stroke={element.color}
        strokeWidth={CALLOUT_STROKE}
      />
      <text
        fill={element.color}
        fontSize={element.fontSize}
        fontFamily={TEXT_FONT_FAMILIES[look.font]}
        fontWeight={look.bold ? 'bold' : undefined}
        xmlSpace="preserve"
      >
        {lineSpans(element.text).map((line) => (
          <tspan
            key={line.start}
            x={element.origin.x * width}
            y={element.origin.y * height + TEXT_BASELINE * element.fontSize + line.row * lineHeight}
          >
            {line.text}
          </tspan>
        ))}
      </text>
      {interactive && (
        <>
          <path
            className="element-hit"
            d={arrow}
            fill="none"
            stroke="transparent"
            strokeWidth={8 / zoomScale}
            onPointerEnter={() => onHover(element.id)}
            onPointerLeave={() => onHover(null)}
            onPointerDown={(e) => {
              e.stopPropagation()
              onDragStart(element.id, e.clientX, e.clientY)
            }}
          />
          <rect
            className="element-hit"
            x={box.x}
            y={box.y}
            width={box.w}
            height={box.h}
            fill="transparent"
            style={{ cursor: selected ? 'move' : 'default' }}
            onPointerEnter={() => onHover(element.id)}
            onPointerLeave={() => onHover(null)}
            onPointerDown={(e) => {
              e.stopPropagation()
              onDragStart(element.id, e.clientX, e.clientY)
            }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              onEdit(element.id)
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </>
      )}
    </g>
  )
}
