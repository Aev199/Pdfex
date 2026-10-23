export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface Size {
  w: number
  h: number
}

export interface View {
  zoom: number
  x: number
  y: number
}

export type Phase = 'opening' | 'open' | 'closing'

export const isMac = window.api.platform === 'darwin'
export const MIN_ZOOM = 1
// High enough to read dimension text on A1–A0 drawings fitted to the screen.
export const MAX_ZOOM = 32
export const ZOOM_STEP = 1.4
export const DOUBLE_CLICK_ZOOM = 2.5
export const ARROW_PAN = 80
export const EDIT_PAN_ALLOWANCE = 64
export const GAP = 24
export const TRANSITION_MS = 340

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

export function fitInto(pw: number, ph: number, vp: Size): Size {
  const f = Math.min(vp.w / pw, vp.h / ph)
  return { w: pw * f, h: ph * f }
}

export function flipTo(fit: Size, vp: Size, rect: Rect): string {
  const left = (vp.w - fit.w) / 2
  const top = (vp.h - fit.h) / 2
  return `translate(${rect.left - left}px, ${rect.top - top}px) scale(${rect.width / fit.w})`
}

// The reader is one vertical strip: every page of every document, one
// screen tall, GAP apart (also between documents), snapped page by page.
export function slideTop(sc: HTMLElement, di: number, pi: number): number | null {
  const docEl = sc.children[di] as HTMLElement | undefined
  const slide = docEl?.children[pi] as HTMLElement | undefined
  return docEl && slide ? docEl.offsetTop + slide.offsetTop : null
}

// The page at a scroll position, from the uniform pitch of the strip.
export function pageAtScroll(
  scrollTop: number,
  pageHeight: number,
  pageCounts: number[]
): { di: number; pi: number } {
  let index = Math.max(0, Math.round(scrollTop / (pageHeight + GAP)))
  for (let di = 0; di < pageCounts.length; di++) {
    if (index < pageCounts[di]) return { di, pi: index }
    index -= pageCounts[di]
  }
  const di = Math.max(0, pageCounts.length - 1)
  return { di, pi: Math.max(0, (pageCounts[di] ?? 1) - 1) }
}

// The page `dir` steps away, crossing into the next or previous document.
export function stepPage(
  pageCounts: number[],
  di: number,
  pi: number,
  dir: 1 | -1
): { di: number; pi: number } {
  if (dir > 0) {
    if (pi + 1 < pageCounts[di]) return { di, pi: pi + 1 }
    return di + 1 < pageCounts.length ? { di: di + 1, pi: 0 } : { di, pi }
  }
  if (pi > 0) return { di, pi: pi - 1 }
  return di > 0 ? { di: di - 1, pi: pageCounts[di - 1] - 1 } : { di, pi }
}
