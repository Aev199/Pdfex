import { bboxOfPoints } from './geometry'
import type {
  DrawStyle,
  ElementPoint,
  MeasureElement,
  MeasureMode,
  MeasureScale,
  MeasureUnit
} from './types'

// Lengths and areas on drawings. Points are page fractions (0..1) like every
// other element; lengths are worked out in PDF points and then scaled.

const MM_PER_POINT = 25.4 / 72
const UNIT_MM: Record<MeasureUnit, number> = { mm: 1, cm: 10, m: 1000 }
export const UNIT_LABELS: Record<MeasureUnit, string> = { mm: 'мм', cm: 'см', m: 'м' }

export const SCALE_RATIOS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]

export const ratioScale = (ratio: number, unit: MeasureUnit): MeasureScale => ({
  perPoint: (MM_PER_POINT * ratio) / UNIT_MM[unit],
  unit,
  label: `1:${ratio}`
})

// The scale that makes a line of `points` on the sheet `real` units long.
export const calibratedScale = (points: number, real: number, unit: MeasureUnit): MeasureScale => ({
  perPoint: real / points,
  unit,
  label: 'calibrated'
})

// The same scale in another unit.
export function convertScale(scale: MeasureScale, unit: MeasureUnit): MeasureScale {
  return {
    ...scale,
    perPoint: (scale.perPoint * UNIT_MM[scale.unit]) / UNIT_MM[unit],
    unit
  }
}

const toPoints = (p: ElementPoint, w: number, h: number): ElementPoint => ({
  x: p.x * w,
  y: p.y * h
})

// Length of the polyline in PDF points.
export function polylinePoints(
  points: ElementPoint[],
  w: number,
  h: number,
  closed = false
): number {
  let total = 0
  const list = closed && points.length > 2 ? [...points, points[0]] : points
  for (let i = 1; i < list.length; i++) {
    const a = toPoints(list[i - 1], w, h)
    const b = toPoints(list[i], w, h)
    total += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return total
}

// Enclosed area in square PDF points (shoelace).
export function polygonPoints(points: ElementPoint[], w: number, h: number): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = toPoints(points[i], w, h)
    const b = toPoints(points[(i + 1) % points.length], w, h)
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

export function measureValue(
  mode: MeasureMode,
  points: ElementPoint[],
  scale: MeasureScale,
  w: number,
  h: number
): number {
  if (mode === 'area') return polygonPoints(points, w, h) * scale.perPoint * scale.perPoint
  return polylinePoints(points, w, h) * scale.perPoint
}

export function formatNumber(value: number): string {
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return value
    .toFixed(digits)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

export function measureLabel(
  mode: MeasureMode,
  points: ElementPoint[],
  scale: MeasureScale,
  w: number,
  h: number
): string {
  const value = measureValue(mode, points, scale, w, h)
  return `${formatNumber(value)} ${UNIT_LABELS[scale.unit]}${mode === 'area' ? '²' : ''}`
}

export const elementLabel = (el: MeasureElement, w: number, h: number): string =>
  measureLabel(el.mode, el.points, el.scale, w, h)

// Where the label sits: over the middle of the longest segment, or at the
// centre of an area.
export function labelAnchor(
  mode: MeasureMode,
  points: ElementPoint[],
  w: number,
  h: number
): ElementPoint {
  if (mode === 'area' && points.length > 2) {
    let cx = 0
    let cy = 0
    let a = 0
    for (let i = 0; i < points.length; i++) {
      const p = toPoints(points[i], w, h)
      const q = toPoints(points[(i + 1) % points.length], w, h)
      const cross = p.x * q.y - q.x * p.y
      a += cross
      cx += (p.x + q.x) * cross
      cy += (p.y + q.y) * cross
    }
    if (Math.abs(a) > 1e-6) return { x: cx / (3 * a) / w, y: cy / (3 * a) / h }
    const avg = points.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 })
    return { x: avg.x / points.length, y: avg.y / points.length }
  }
  let best = 0
  let at = points[0] ?? { x: 0, y: 0 }
  for (let i = 1; i < points.length; i++) {
    const len = Math.hypot((points[i].x - points[i - 1].x) * w, (points[i].y - points[i - 1].y) * h)
    if (len >= best) {
      best = len
      at = { x: (points[i].x + points[i - 1].x) / 2, y: (points[i].y + points[i - 1].y) / 2 }
    }
  }
  return at
}

// Label text size, its padding and the end ticks, in PDF points: like
// dimension text in CAD, 9 pt on A4 and growing with the sheet (about 22 pt
// on A0), so labels read on large drawings without looming over small ones.
export function labelMetrics(w: number, h: number): { size: number; pad: number; tick: number } {
  const size = Math.max(9, Math.max(w, h) / 150)
  return { size, pad: size * 0.28, tick: size * 0.55 }
}

const MIN_LENGTH_POINTS = 3
const BBOX_PAD_POINTS = 12
// Room for the label beyond the line, roughly.
const LABEL_ROOM_POINTS = 60

export function createMeasureElement(
  mode: MeasureMode,
  points: ElementPoint[],
  number: number,
  w: number,
  h: number,
  style: DrawStyle,
  scale: MeasureScale
): MeasureElement | null {
  const needed = mode === 'area' ? 3 : 2
  if (points.length < needed) return null
  if (polylinePoints(points, w, h) < MIN_LENGTH_POINTS) return null
  if (mode === 'area' && polygonPoints(points, w, h) < MIN_LENGTH_POINTS * MIN_LENGTH_POINTS)
    return null
  const label = labelAnchor(mode, points, w, h)
  const box = bboxOfPoints(points, BBOX_PAD_POINTS / w, BBOX_PAD_POINTS / h)
  const { size } = labelMetrics(w, h)
  const room = bboxOfPoints([label], (LABEL_ROOM_POINTS * size) / 9 / w, (size * 2) / h)
  const x = Math.min(box.x, room.x)
  const y = Math.min(box.y, room.y)
  return {
    id: crypto.randomUUID(),
    kind: 'measure',
    number,
    mode,
    points,
    color: style.color,
    strokeWidth: Math.min(style.strokeWidth, 2),
    scale,
    bbox: {
      x,
      y,
      w: Math.max(box.x + box.w, room.x + room.w) - x,
      h: Math.max(box.y + box.h, room.y + room.h) - y
    }
  }
}

// The strokes of a measurement in page fractions: the line itself and, for
// lengths, short ticks across both ends like a dimension line.
export function measureStrokes(
  el: Pick<MeasureElement, 'mode' | 'points'>,
  w: number,
  h: number
): ElementPoint[][] {
  const pts = el.points
  if (pts.length < 2) return []
  if (el.mode === 'area') return [[...pts, pts[0]]]
  const { tick: TICK } = labelMetrics(w, h)
  const tick = (a: ElementPoint, b: ElementPoint): ElementPoint[] => {
    const dx = (b.x - a.x) * w
    const dy = (b.y - a.y) * h
    const len = Math.hypot(dx, dy) || 1
    const nx = (-dy / len) * TICK
    const ny = (dx / len) * TICK
    return [
      { x: a.x - nx / w, y: a.y - ny / h },
      { x: a.x + nx / w, y: a.y + ny / h }
    ]
  }
  return [pts, tick(pts[0], pts[1]), tick(pts[pts.length - 1], pts[pts.length - 2])]
}

// Characters a measurement label may use, to pick export fonts before the
// labels themselves are known.
export const LABEL_CHARACTERS = '0123456789,.  мсм²'
