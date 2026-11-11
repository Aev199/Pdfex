import { describe, expect, it } from 'vitest'
import { LAYOUT_DEFAULTS, layoutContinuous, pageAtY, pagesInBand, scalePoint } from './layout'

const a4 = { width: 595, height: 842 }
const docs = [{ pages: [a4, a4, a4] }, { pages: [{ width: 842, height: 595 }] }]
const opts = { viewportW: 1000, columns: 1 as const, zoom: 1, ...LAYOUT_DEFAULTS }

describe('continuous reader layout', () => {
  it('fits pages to the width, one under another, documents labelled', () => {
    const layout = layoutContinuous(docs, opts)
    expect(layout.pages).toHaveLength(4)
    expect(layout.labels).toHaveLength(2)
    const [first, second] = layout.pages
    expect(first.w).toBeCloseTo(1000 - 48)
    expect(first.h).toBeCloseTo((952 * 842) / 595)
    expect(second.y).toBeCloseTo(first.y + first.h + 16)
    expect(layout.width).toBe(1000)
  })

  it('puts two pages side by side and grows wider than the window when zoomed', () => {
    const spread = layoutContinuous(docs, { ...opts, columns: 2 })
    const [p0, p1, p2] = spread.pages
    expect(p1.y).toBe(p0.y)
    expect(p1.x).toBeGreaterThan(p0.x + p0.w)
    expect(p2.y).toBeGreaterThan(p0.y + p0.h)
    expect(pageAtY(spread, p1.y + 5)).toMatchObject({ pi: 0 })
    const zoomed = layoutContinuous(docs, { ...opts, zoom: 2 })
    expect(zoomed.width).toBeGreaterThan(1000)
  })

  it('finds the page under a line and keeps a point still across zoom', () => {
    const layout = layoutContinuous(docs, opts)
    const third = layout.pages[2]
    expect(pageAtY(layout, third.y + 10)).toMatchObject({ di: 0, pi: 2 })
    expect(pageAtY(layout, -50)).toMatchObject({ di: 0, pi: 0 })
    expect(pagesInBand(layout, third.y - 20, third.y + 5).map((p) => p.pi)).toEqual([1, 2])
    const zoomed = layoutContinuous(docs, { ...opts, zoom: 1.5 })
    const point = { x: third.x + third.w / 2, y: third.y + third.h / 4 }
    const moved = scalePoint(layout, zoomed, point.x, point.y)
    const twin = zoomed.pages[2]
    expect(moved.x).toBeCloseTo(twin.x + twin.w / 2)
    expect(moved.y).toBeCloseTo(twin.y + twin.h / 4)
  })
})
