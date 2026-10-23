// Page rasters come in a few fixed sizes (long side, device pixels) chosen
// from how big the page is on screen: a page shown 40 px tall on a zoomed-out
// board is not drawn at 1100 px. Fixed steps mean a slow zoom doesn't
// re-render on every settle, and a 400-page scan seen whole costs a few MB
// instead of a gigabyte. Above the largest step, the visible part is drawn
// sharp separately (renderDetail).

export const THUMB_LEVELS = [160, 320, 640, 1100]
export const FULL_LEVELS = [320, 640, 1100, 1600]

// Rendering a bit above the on-screen size keeps a page sharp while the
// camera keeps moving between settles.
const HEADROOM = 1.35

export function pickLevel(displayLongPx: number, levels: number[]): number {
  const wanted = displayLongPx * HEADROOM
  return levels.find((l) => l >= wanted) ?? levels[levels.length - 1]
}

// Change the raster when the page needs more detail, or when it is now far
// smaller on screen than its raster (to give memory back); not on every step.
export function nextLevel(current: number, displayLongPx: number, levels: number[]): number {
  const wanted = pickLevel(displayLongPx, levels)
  if (current === 0 || wanted > current) return wanted
  return wanted * 4 <= current ? wanted : current
}
