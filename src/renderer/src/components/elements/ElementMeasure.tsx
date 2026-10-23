import { elementLabel, labelAnchor, labelMetrics, measureStrokes } from '../../elements/measures'
import { measureLineWidth } from '../../elements/measure'
import type { MeasureElement } from '../../elements/types'

interface ElementMeasureProps {
  element: MeasureElement
  width: number
  height: number
  interactive: boolean
  hovered: boolean
  selected: boolean
  zoomScale: number
  offset: { dx: number; dy: number } | null
  onHover: (id: string | null) => void
  onDragStart: (id: string, clientX: number, clientY: number) => void
}

const HIT_PADDING = 8
const OUTLINE_PADDING = 4

// The outline of a measurement and its end ticks, as SVG path data in points.
export function measurePathData(
  element: Pick<MeasureElement, 'mode' | 'points'>,
  width: number,
  height: number
): string {
  return measureStrokes(element, width, height)
    .map(
      (line) =>
        line.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * width} ${p.y * height}`).join(' ') +
        (element.mode === 'area' ? ' Z' : '')
    )
    .join(' ')
}

export function MeasureLabel({
  element,
  width,
  height,
  text
}: {
  element: Pick<MeasureElement, 'mode' | 'points' | 'color'>
  width: number
  height: number
  text: string
}): React.JSX.Element {
  const at = labelAnchor(element.mode, element.points, width, height)
  const { size, pad } = labelMetrics(width, height)
  const textWidth = measureLineWidth(text, size)
  const x = at.x * width
  const y = at.y * height
  return (
    <g className="measure-label">
      <rect
        x={x - textWidth / 2 - pad}
        y={y - size / 2 - pad}
        width={textWidth + pad * 2}
        height={size + pad * 2}
        rx={2}
        fill="#ffffff"
        fillOpacity={0.9}
        stroke={element.color}
        strokeWidth={0.6}
      />
      <text
        x={x}
        y={y + size * 0.36}
        textAnchor="middle"
        fontSize={size}
        fontFamily="Helvetica, Arial, sans-serif"
        fill={element.color}
      >
        {text}
      </text>
    </g>
  )
}

export function ElementMeasure({
  element,
  width,
  height,
  interactive,
  hovered,
  selected,
  zoomScale,
  offset,
  onHover,
  onDragStart
}: ElementMeasureProps): React.JSX.Element {
  const d = measurePathData(element, width, height)
  const outlined = hovered || selected
  return (
    <g transform={offset ? `translate(${offset.dx * width} ${offset.dy * height})` : undefined}>
      {outlined && (
        <path
          className="element-outline"
          d={d}
          fill="none"
          strokeWidth={element.strokeWidth + OUTLINE_PADDING / zoomScale}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <path
        d={d}
        fill={element.mode === 'area' ? element.color : 'none'}
        fillOpacity={element.mode === 'area' ? 0.12 : undefined}
        stroke={element.color}
        strokeWidth={element.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <MeasureLabel
        element={element}
        width={width}
        height={height}
        text={elementLabel(element, width, height)}
      />
      {interactive && (
        <path
          className="element-hit"
          d={d}
          fill={element.mode === 'area' ? 'transparent' : 'none'}
          stroke="transparent"
          strokeWidth={element.strokeWidth + HIT_PADDING / zoomScale}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ cursor: selected ? 'move' : 'default' }}
          onPointerEnter={() => onHover(element.id)}
          onPointerLeave={() => onHover(null)}
          onPointerDown={(e) => {
            e.stopPropagation()
            onDragStart(element.id, e.clientX, e.clientY)
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </g>
  )
}
