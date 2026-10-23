import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { innerWidth: 1000, innerHeight: 800, devicePixelRatio: 1 })
const { visibleGeometry } = await import('./raster')

// A 100x200 layout box shown at 4x zoom; the window shows only part of it.
describe('visibleGeometry', () => {
  it('maps the visible part of an unturned page', () => {
    const g = visibleGeometry({ left: -200, top: 0, width: 400, height: 800 }, 100, 200, 0)!
    expect(g.screenScale).toBe(4)
    expect([g.x0, g.y0, g.x1, g.y1]).toEqual([50, 0, 100, 200])
  })

  it('maps back through a quarter turn', () => {
    // Turned 90° clockwise the box is 800 wide and 400 tall on screen; the
    // page's top half has turned to the right, the half that is on screen.
    const g = visibleGeometry({ left: -400, top: 0, width: 800, height: 400 }, 100, 200, 90)!
    expect(g.screenScale).toBe(4)
    expect([g.x0, g.y0, g.x1, g.y1]).toEqual([0, 0, 100, 100])
  })

  it('returns nothing when the page is off screen', () => {
    expect(visibleGeometry({ left: 2000, top: 0, width: 100, height: 100 }, 100, 100, 0)).toBeNull()
  })
})
