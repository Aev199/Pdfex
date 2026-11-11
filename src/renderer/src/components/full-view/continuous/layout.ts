// The reader's scrolling layouts: every page of every document one after
// another, fitted to the window's width (one column) or two side by side
// (spread), then scaled by the zoom. Positions are computed here rather than
// left to CSS so that only the pages in view are mounted, the page under the
// middle of the window is found without measuring, and zooming can keep the
// point under the pointer still.

export type ReaderLayout = 'page' | 'scroll' | 'spread'

export interface LayoutPage {
  di: number
  pi: number
  x: number
  y: number
  w: number
  h: number
}

export interface LayoutLabel {
  di: number
  x: number
  y: number
}

export interface ContinuousLayout {
  pages: LayoutPage[]
  labels: LayoutLabel[]
  width: number
  height: number
}

export interface LayoutOptions {
  viewportW: number
  columns: 1 | 2
  zoom: number
  // Room above the first page (the toolbar) and around everything.
  top: number
  pad: number
  gap: number
  // A document's name sits above its pages when there are several.
  labelH: number
}

export const LAYOUT_DEFAULTS = { top: 72, pad: 24, gap: 16, labelH: 30 }

export function layoutContinuous(
  docs: { pages: { width: number; height: number }[] }[],
  opts: LayoutOptions
): ContinuousLayout {
  const { viewportW, columns, zoom, top, pad, gap, labelH } = opts
  const fitW = Math.max(80, (viewportW - 2 * pad - (columns - 1) * gap) / columns)
  const pageW = fitW * zoom
  const rowW = columns * pageW + (columns - 1) * gap
  const width = Math.max(viewportW, rowW + 2 * pad)
  const left = (width - rowW) / 2
  const pages: LayoutPage[] = []
  const labels: LayoutLabel[] = []
  let y = top
  docs.forEach((doc, di) => {
    if (docs.length > 1) {
      labels.push({ di, x: left, y })
      y += labelH
    }
    for (let start = 0; start < doc.pages.length; start += columns) {
      let rowH = 0
      for (let c = 0; c < columns && start + c < doc.pages.length; c++) {
        const p = doc.pages[start + c]
        const h = (pageW * p.height) / p.width
        pages.push({ di, pi: start + c, x: left + c * (pageW + gap), y, w: pageW, h })
        rowH = Math.max(rowH, h)
      }
      // Pages of a row share its top; a shorter one sits at it.
      y += rowH + gap
    }
    y += gap * 2
  })
  return { pages, labels, width, height: y - gap * 2 + pad }
}

// The page under the line `y` (content coordinates), or the nearest.
export function pageAtY(layout: ContinuousLayout, y: number): LayoutPage | null {
  const { pages } = layout
  if (pages.length === 0) return null
  let lo = 0
  let hi = pages.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (pages[mid].y <= y) lo = mid
    else hi = mid - 1
  }
  // Of a row of two, the left one.
  while (lo > 0 && pages[lo - 1].y === pages[lo].y) lo--
  return pages[lo]
}

// Pages that touch the band [top, bottom] (content coordinates).
export function pagesInBand(layout: ContinuousLayout, top: number, bottom: number): LayoutPage[] {
  return layout.pages.filter((p) => p.y + p.h >= top && p.y <= bottom)
}

// Where a content point goes when the zoom changes: everything scales about
// the layout's left edge and top margin.
export function scalePoint(
  before: ContinuousLayout,
  after: ContinuousLayout,
  x: number,
  y: number
): { x: number; y: number } {
  const anchor = pageAtY(before, y)
  if (!anchor) return { x, y }
  const twin = after.pages.find((p) => p.di === anchor.di && p.pi === anchor.pi)
  if (!twin) return { x, y }
  const fx = (x - anchor.x) / anchor.w
  const fy = (y - anchor.y) / anchor.h
  return { x: twin.x + fx * twin.w, y: twin.y + fy * twin.h }
}
