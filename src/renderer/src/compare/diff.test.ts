import { describe, expect, it } from 'vitest'
import { diffImage, revision } from './diff'

// A w×h white RGBA image with black pixels at the given points.
function image(w: number, h: number, black: [number, number][]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4).fill(255)
  for (const [x, y] of black) data.fill(0, (y * w + x) * 4, (y * w + x) * 4 + 3)
  return data
}

const pixel = (out: Uint8ClampedArray, w: number, x: number, y: number): number[] =>
  Array.from(out.slice((y * w + x) * 4, (y * w + x) * 4 + 3))

describe('revision diff', () => {
  it('colours removed red, added blue and kept grey', () => {
    const w = 12
    const h = 4
    const older = revision(
      image(w, h, [
        [1, 1],
        [5, 1]
      ]),
      w,
      h
    )
    const newer = revision(
      image(w, h, [
        [5, 1],
        [9, 1]
      ]),
      w,
      h
    )
    const out = new Uint8ClampedArray(w * h * 4)
    const stats = diffImage(out, w, h, older, newer)
    expect(stats).toEqual({ removed: 1, added: 1 })
    const [r1, g1, b1] = pixel(out, w, 1, 1)
    expect(r1).toBeGreaterThan(200)
    expect(g1).toBeLessThan(60)
    expect(b1).toBeLessThan(60)
    const [r9, g9, b9] = pixel(out, w, 9, 1)
    expect(b9).toBeGreaterThan(200)
    expect(r9).toBeLessThan(60)
    expect(g9).toBeLessThan(g1 + 120)
    const [r5, g5, b5] = pixel(out, w, 5, 1)
    expect(r5).toBe(g5)
    expect(g5).toBe(b5)
    expect(r5).toBeLessThan(150)
    expect(pixel(out, w, 0, 0)).toEqual([255, 255, 255])
  })

  it('tolerates a one-pixel shift and lines up with a nudge', () => {
    const w = 10
    const h = 3
    const older = revision(image(w, h, [[3, 1]]), w, h)
    const shifted = revision(image(w, h, [[4, 1]]), w, h)
    const out = new Uint8ClampedArray(w * h * 4)
    expect(diffImage(out, w, h, older, shifted)).toEqual({ removed: 0, added: 0 })
    const far = revision(image(w, h, [[7, 1]]), w, h)
    expect(diffImage(out, w, h, older, far)).toEqual({ removed: 1, added: 1 })
    expect(diffImage(out, w, h, older, far, -4, 0)).toEqual({ removed: 0, added: 0 })
  })
})
