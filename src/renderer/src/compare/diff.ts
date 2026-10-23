// Comparing two revisions of a sheet, pixel by pixel: ink only in the old one
// is removed (red), only in the new one added (blue), in both unchanged
// (grey). A one-pixel tolerance keeps anti-aliasing and rounding from
// outlining every line.

// How dark each pixel is, 0 (white paper) to 255 (black ink).
export function darkness(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length / 4)
  for (let i = 0, p = 0; p < out.length; i += 4, p++) {
    const lum = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8
    // Transparent pixels are paper.
    out[p] = ((255 - lum) * rgba[i + 3]) / 255
  }
  return out
}

// The darkest value within one pixel of each pixel (3×3 maximum).
export function dilate(src: Uint8Array, w: number, h: number): Uint8Array {
  const row = new Uint8Array(src.length)
  for (let y = 0; y < h; y++) {
    const o = y * w
    for (let x = 0; x < w; x++) {
      let m = src[o + x]
      if (x > 0 && src[o + x - 1] > m) m = src[o + x - 1]
      if (x < w - 1 && src[o + x + 1] > m) m = src[o + x + 1]
      row[o + x] = m
    }
  }
  const out = new Uint8Array(src.length)
  for (let y = 0; y < h; y++) {
    const o = y * w
    for (let x = 0; x < w; x++) {
      let m = row[o + x]
      if (y > 0 && row[o - w + x] > m) m = row[o - w + x]
      if (y < h - 1 && row[o + w + x] > m) m = row[o + w + x]
      out[o + x] = m
    }
  }
  return out
}

export interface Revision {
  ink: Uint8Array
  // `ink` dilated by one pixel.
  near: Uint8Array
}

export const revision = (rgba: Uint8ClampedArray, w: number, h: number): Revision => {
  const ink = darkness(rgba)
  return { ink, near: dilate(ink, w, h) }
}

export interface DiffStats {
  // Pixels clearly removed or added.
  removed: number
  added: number
}

// A pixel counts as changed when this much ink is left after the tolerance.
const CHANGED = 72
const COMMON_GREY = 165

// Writes the overlay into `out` (RGBA, w×h). The new revision is shifted by
// (dx, dy) pixels to line it up with the old one.
export function diffImage(
  out: Uint8ClampedArray,
  w: number,
  h: number,
  older: Revision,
  newer: Revision,
  dx = 0,
  dy = 0
): DiffStats {
  let removed = 0
  let added = 0
  for (let y = 0; y < h; y++) {
    const ny = y - dy
    const rowInside = ny >= 0 && ny < h
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      const nx = x - dx
      const q = rowInside && nx >= 0 && nx < w ? ny * w + nx : -1
      const a = older.ink[p]
      const b = q >= 0 ? newer.ink[q] : 0
      const aNear = older.near[p]
      const bNear = q >= 0 ? newer.near[q] : 0
      const gone = a > bNear ? a - bNear : 0
      const fresh = b > aNear ? b - aNear : 0
      const common = Math.min(a, b, 255 - Math.max(gone, fresh))
      if (gone >= CHANGED) removed++
      if (fresh >= CHANGED) added++
      const c = (common * COMMON_GREY) >> 8
      const i = p * 4
      out[i] = 255 - c - ((fresh * 230) >> 8)
      out[i + 1] = 255 - c - ((gone * 230) >> 8) - ((fresh * 150) >> 8)
      out[i + 2] = 255 - c - ((gone * 230) >> 8)
      out[i + 3] = 255
    }
  }
  return { removed, added }
}
