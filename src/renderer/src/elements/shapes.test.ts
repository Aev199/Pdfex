import { describe, expect, it } from 'vitest'
import { createShapeElement, shapePathData, shapeSegments } from './shapes'
import { elementHit } from './erase'
import type { InkElement } from './types'

const style = { color: '#e5322d', strokeWidth: 2 }
const A4 = { w: 595, h: 842 }

describe('shapes', () => {
  it('ignores a click without a drag', () => {
    expect(
      createShapeElement('rect', { x: 0.5, y: 0.5 }, { x: 0.501, y: 0.5 }, 1, A4.w, A4.h, style)
    ).toBeNull()
  })

  it('draws a closed rectangle whatever the drag direction', () => {
    const rect = createShapeElement(
      'rect',
      { x: 0.6, y: 0.4 },
      { x: 0.2, y: 0.1 },
      1,
      A4.w,
      A4.h,
      style
    )!
    const segs = shapeSegments(rect, A4.w, A4.h)
    expect(segs[0]).toEqual({ kind: 'move', to: { x: 0.2, y: 0.1 } })
    expect(segs.at(-1)).toEqual({ kind: 'close' })
    expect(rect.bbox.x).toBeLessThan(0.2)
    expect(rect.bbox.x + rect.bbox.w).toBeGreaterThan(0.6)
  })

  it('gives an arrow a symmetric head at the end point', () => {
    const arrow = createShapeElement(
      'arrow',
      { x: 0.1, y: 0.5 },
      { x: 0.5, y: 0.5 },
      1,
      A4.w,
      A4.h,
      style
    )!
    const segs = shapeSegments(arrow, A4.w, A4.h)
    const legs = segs.filter((s) => s.kind === 'move').slice(1)
    const left = (legs[0] as { to: { x: number; y: number } }).to
    const right = (segs.at(-1) as { to: { x: number; y: number } }).to
    expect(left.x).toBeCloseTo(right.x, 6)
    expect(left.y - 0.5).toBeCloseTo(-(right.y - 0.5), 6)
    expect(left.x).toBeLessThan(0.5)
  })

  it('builds an ellipse from four curves', () => {
    const ellipse = createShapeElement(
      'ellipse',
      { x: 0.2, y: 0.2 },
      { x: 0.4, y: 0.3 },
      1,
      A4.w,
      A4.h,
      style
    )!
    expect(shapePathData(ellipse, A4.w, A4.h).match(/C /g)).toHaveLength(4)
  })
})

describe('eraser hits', () => {
  const line = createShapeElement(
    'line',
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.1 },
    1,
    A4.w,
    A4.h,
    style
  )!
  const rect = createShapeElement(
    'rect',
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.8 },
    1,
    A4.w,
    A4.h,
    style
  )!
  const ink: InkElement = {
    id: 'i',
    kind: 'ink',
    number: 1,
    color: '#000',
    strokeWidth: 1.6,
    points: [
      { x: 0.1, y: 0.9 },
      { x: 0.3, y: 0.9 }
    ],
    bbox: { x: 0.08, y: 0.88, w: 0.24, h: 0.04 }
  }

  it('touches a stroke within the radius and not beyond', () => {
    expect(elementHit(line, { x: 0.5, y: 0.1 + 4 / A4.h }, 6, A4.w, A4.h)).toBe(true)
    expect(elementHit(line, { x: 0.5, y: 0.1 + 20 / A4.h }, 6, A4.w, A4.h)).toBe(false)
    expect(elementHit(ink, { x: 0.2, y: 0.9 }, 6, A4.w, A4.h)).toBe(true)
  })

  it('erases a rectangle by its outline, not its empty middle', () => {
    expect(elementHit(rect, { x: 0.5, y: 0.5 }, 6, A4.w, A4.h)).toBe(false)
    expect(elementHit(rect, { x: 0.8, y: 0.5 }, 6, A4.w, A4.h)).toBe(true)
  })
})
