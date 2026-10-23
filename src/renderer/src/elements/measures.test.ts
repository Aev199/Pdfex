import { describe, expect, it } from 'vitest'
import {
  calibratedScale,
  convertScale,
  formatNumber,
  labelAnchor,
  measureLabel,
  measureStrokes,
  ratioScale,
  createMeasureElement
} from './measures'

// An A4 sheet in points.
const W = 595.28
const H = 841.89
const MM = 72 / 25.4 // points per millimetre

describe('measurements', () => {
  it('scales sheet millimetres by the drawing scale', () => {
    // 50 mm on the sheet at 1:100 is 5 m.
    const pts = [
      { x: 0.1, y: 0.5 },
      { x: 0.1 + (50 * MM) / W, y: 0.5 }
    ]
    expect(measureLabel('distance', pts, ratioScale(100, 'm'), W, H)).toBe('5,00 м')
    expect(measureLabel('distance', pts, ratioScale(1, 'mm'), W, H)).toBe('50,0 мм')
    expect(
      measureLabel(
        'path',
        [...pts, { x: pts[1].x, y: 0.5 + (20 * MM) / H }],
        ratioScale(100, 'm'),
        W,
        H
      )
    ).toBe('7,00 м')
  })

  it('measures areas in square units', () => {
    // A 40 x 30 mm rectangle at 1:100 is 4 x 3 m = 12 m².
    const x0 = 0.2
    const y0 = 0.3
    const x1 = x0 + (40 * MM) / W
    const y1 = y0 + (30 * MM) / H
    const square = [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 }
    ]
    expect(measureLabel('area', square, ratioScale(100, 'm'), W, H)).toBe('12,0 м²')
    const centre = labelAnchor('area', square, W, H)
    expect(centre.x).toBeCloseTo((x0 + x1) / 2, 6)
    expect(centre.y).toBeCloseTo((y0 + y1) / 2, 6)
  })

  it('calibrates from a known dimension and converts units', () => {
    const scale = calibratedScale(200, 6000, 'mm')
    expect(scale.perPoint).toBe(30)
    expect(convertScale(scale, 'm').perPoint).toBeCloseTo(0.03, 10)
    const pts = [
      { x: 0, y: 0 },
      { x: 100 / W, y: 0 }
    ]
    expect(measureLabel('distance', pts, scale, W, H)).toBe('3 000 мм')
  })

  it('formats numbers the Russian way', () => {
    expect(formatNumber(3.14159)).toBe('3,14')
    expect(formatNumber(42.25)).toBe('42,3')
    expect(formatNumber(1234567)).toBe('1 234 567')
  })

  it('refuses accidental clicks and adds dimension ticks', () => {
    const style = { color: '#e5322d', strokeWidth: 1 }
    expect(
      createMeasureElement(
        'distance',
        [
          { x: 0.5, y: 0.5 },
          { x: 0.5, y: 0.5 }
        ],
        1,
        W,
        H,
        style,
        ratioScale(100, 'm')
      )
    ).toBeNull()
    const el = createMeasureElement(
      'distance',
      [
        { x: 0.1, y: 0.5 },
        { x: 0.4, y: 0.5 }
      ],
      1,
      W,
      H,
      style,
      ratioScale(100, 'm')
    )!
    expect(measureStrokes(el, W, H)).toHaveLength(3)
  })
})
