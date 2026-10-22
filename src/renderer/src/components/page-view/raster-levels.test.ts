import { describe, expect, it } from 'vitest'
import { THUMB_LEVELS, nextLevel, pickLevel } from './raster-levels'

describe('raster levels', () => {
  it('draws small pages small and caps large ones', () => {
    expect(pickLevel(40, THUMB_LEVELS)).toBe(160)
    expect(pickLevel(280, THUMB_LEVELS)).toBe(640)
    expect(pickLevel(5000, THUMB_LEVELS)).toBe(1100)
  })

  it('goes up as soon as more detail is needed, down only when far too big', () => {
    expect(nextLevel(0, 100, THUMB_LEVELS)).toBe(160)
    expect(nextLevel(320, 300, THUMB_LEVELS)).toBe(640)
    expect(nextLevel(640, 200, THUMB_LEVELS)).toBe(640)
    expect(nextLevel(1100, 60, THUMB_LEVELS)).toBe(160)
  })
})
