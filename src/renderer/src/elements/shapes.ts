import { bboxOfPoints } from './geometry'
import type { DrawStyle, ElementPoint, ShapeElement, ShapeKind } from './types'

// Shapes are stored by their two defining points in page fractions (0..1),
// like ink. Their outline is generated here once, as path segments in page
// fractions, for both the on-screen SVG and the exported PDF.

export type ShapeSegment =
  | { kind: 'move'; to: ElementPoint }
  | { kind: 'line'; to: ElementPoint }
  | { kind: 'cubic'; c1: ElementPoint; c2: ElementPoint; to: ElementPoint }
  | { kind: 'close' }

// Bezier handle length for a quarter ellipse.
const KAPPA = 0.5522847498
const BBOX_PAD_POINTS = 9
// Smaller drags are taken as an accidental click.
const MIN_SIZE_POINTS = 3

// Arrowhead legs in points, growing with the line width.
const headLength = (strokeWidth: number): number => Math.max(9, strokeWidth * 4.5)
const HEAD_ANGLE = Math.PI / 7

export function shapeSegments(
  shape: Pick<ShapeElement, 'shape' | 'from' | 'to' | 'strokeWidth'>,
  pageWidth: number,
  pageHeight: number
): ShapeSegment[] {
  const { from, to } = shape
  switch (shape.shape) {
    case 'line':
      return [
        { kind: 'move', to: from },
        { kind: 'line', to }
      ]
    case 'arrow': {
      // Work in points so the head keeps its shape on any page proportion.
      const ax = from.x * pageWidth
      const ay = from.y * pageHeight
      const bx = to.x * pageWidth
      const by = to.y * pageHeight
      const angle = Math.atan2(by - ay, bx - ax)
      const len = Math.min(headLength(shape.strokeWidth), Math.hypot(bx - ax, by - ay) * 0.6)
      const leg = (side: 1 | -1): ElementPoint => ({
        x: (bx - len * Math.cos(angle - side * HEAD_ANGLE)) / pageWidth,
        y: (by - len * Math.sin(angle - side * HEAD_ANGLE)) / pageHeight
      })
      return [
        { kind: 'move', to: from },
        { kind: 'line', to },
        { kind: 'move', to: leg(1) },
        { kind: 'line', to },
        { kind: 'line', to: leg(-1) }
      ]
    }
    case 'rect': {
      const x0 = Math.min(from.x, to.x)
      const x1 = Math.max(from.x, to.x)
      const y0 = Math.min(from.y, to.y)
      const y1 = Math.max(from.y, to.y)
      return [
        { kind: 'move', to: { x: x0, y: y0 } },
        { kind: 'line', to: { x: x1, y: y0 } },
        { kind: 'line', to: { x: x1, y: y1 } },
        { kind: 'line', to: { x: x0, y: y1 } },
        { kind: 'close' }
      ]
    }
    case 'ellipse': {
      const cx = (from.x + to.x) / 2
      const cy = (from.y + to.y) / 2
      const rx = Math.abs(to.x - from.x) / 2
      const ry = Math.abs(to.y - from.y) / 2
      const kx = rx * KAPPA
      const ky = ry * KAPPA
      const p = (x: number, y: number): ElementPoint => ({ x, y })
      return [
        { kind: 'move', to: p(cx + rx, cy) },
        { kind: 'cubic', c1: p(cx + rx, cy + ky), c2: p(cx + kx, cy + ry), to: p(cx, cy + ry) },
        { kind: 'cubic', c1: p(cx - kx, cy + ry), c2: p(cx - rx, cy + ky), to: p(cx - rx, cy) },
        { kind: 'cubic', c1: p(cx - rx, cy - ky), c2: p(cx - kx, cy - ry), to: p(cx, cy - ry) },
        { kind: 'cubic', c1: p(cx + kx, cy - ry), c2: p(cx + rx, cy - ky), to: p(cx + rx, cy) },
        { kind: 'close' }
      ]
    }
  }
}

const round = (v: number): number => Math.round(v * 100) / 100

export function shapePathData(
  shape: Pick<ShapeElement, 'shape' | 'from' | 'to' | 'strokeWidth'>,
  width: number,
  height: number
): string {
  const at = (p: ElementPoint): string => `${round(p.x * width)} ${round(p.y * height)}`
  return shapeSegments(shape, width, height)
    .map((s) =>
      s.kind === 'move'
        ? `M ${at(s.to)}`
        : s.kind === 'line'
          ? `L ${at(s.to)}`
          : s.kind === 'cubic'
            ? `C ${at(s.c1)} ${at(s.c2)} ${at(s.to)}`
            : 'Z'
    )
    .join(' ')
}

export function createShapeElement(
  shape: ShapeKind,
  from: ElementPoint,
  to: ElementPoint,
  number: number,
  pageWidth: number,
  pageHeight: number,
  style: DrawStyle
): ShapeElement | null {
  const size = Math.hypot((to.x - from.x) * pageWidth, (to.y - from.y) * pageHeight)
  if (size < MIN_SIZE_POINTS) return null
  const corners = [from, to]
  const pad =
    BBOX_PAD_POINTS + style.strokeWidth + (shape === 'arrow' ? headLength(style.strokeWidth) : 0)
  return {
    id: crypto.randomUUID(),
    kind: 'shape',
    number,
    shape,
    color: style.color,
    strokeWidth: style.strokeWidth,
    from,
    to,
    bbox: bboxOfPoints(corners, pad / pageWidth, pad / pageHeight)
  }
}

// Every point of the element's outline, for hit tests (the eraser).
export function shapePolyline(
  shape: ShapeElement,
  pageWidth: number,
  pageHeight: number
): ElementPoint[][] {
  const lines: ElementPoint[][] = []
  let current: ElementPoint[] = []
  let start: ElementPoint | null = null
  for (const s of shapeSegments(shape, pageWidth, pageHeight)) {
    if (s.kind === 'move') {
      if (current.length > 1) lines.push(current)
      current = [s.to]
      start = s.to
    } else if (s.kind === 'line') {
      current.push(s.to)
    } else if (s.kind === 'cubic') {
      const p0 = current[current.length - 1]
      for (let i = 1; i <= 8; i++) {
        const t = i / 8
        const u = 1 - t
        current.push({
          x:
            u * u * u * p0.x + 3 * u * u * t * s.c1.x + 3 * u * t * t * s.c2.x + t * t * t * s.to.x,
          y: u * u * u * p0.y + 3 * u * u * t * s.c1.y + 3 * u * t * t * s.c2.y + t * t * t * s.to.y
        })
      }
    } else if (start) {
      current.push(start)
    }
  }
  if (current.length > 1) lines.push(current)
  return lines
}
