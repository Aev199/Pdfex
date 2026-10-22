import { shapePolyline } from './shapes'
import type { ElementPoint, PageElement } from './types'

// Distance in points from p to the segment a-b (all in page fractions,
// scaled by the page size so the test is true on non-square pages).
function segmentDistance(
  p: ElementPoint,
  a: ElementPoint,
  b: ElementPoint,
  w: number,
  h: number
): number {
  const px = p.x * w
  const py = p.y * h
  const ax = a.x * w
  const ay = a.y * h
  const dx = b.x * w - ax
  const dy = b.y * h - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

const nearLine = (
  p: ElementPoint,
  line: ElementPoint[],
  reach: number,
  w: number,
  h: number
): boolean => {
  if (line.length === 1) return segmentDistance(p, line[0], line[0], w, h) <= reach
  for (let i = 1; i < line.length; i++) {
    if (segmentDistance(p, line[i - 1], line[i], w, h) <= reach) return true
  }
  return false
}

// Whether the eraser at `p` (radius in points) touches the element: the
// stroke itself for pen and shapes, the box for text.
export function elementHit(
  element: PageElement,
  p: ElementPoint,
  radius: number,
  pageWidth: number,
  pageHeight: number
): boolean {
  const b = element.bbox
  const rx = radius / pageWidth
  const ry = radius / pageHeight
  if (p.x < b.x - rx || p.x > b.x + b.w + rx || p.y < b.y - ry || p.y > b.y + b.h + ry) return false
  if (element.kind === 'text') return true
  const reach = radius + element.strokeWidth / 2
  if (element.kind === 'ink') return nearLine(p, element.points, reach, pageWidth, pageHeight)
  return shapePolyline(element, pageWidth, pageHeight).some((line) =>
    nearLine(p, line, reach, pageWidth, pageHeight)
  )
}
