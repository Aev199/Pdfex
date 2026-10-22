import type { PDFDocumentProxy } from 'pdfjs-dist'

// pdf.js keeps every decoded image and parsed page of a document in its
// worker until the document is cleaned up: scrolling once through a
// 400-page scan leaves ~800 MB behind. Cleaning is only safe while nothing
// renders, so every page render goes through track(), and documents that
// drew many pages are cleaned once rendering has been idle for a moment.
// A document with only a few pages drawn (a large drawing being zoomed) is
// left alone: re-parsing it on every zoom step would cost more than it saves.

const IDLE_MS = 3000
const CLEANUP_AFTER_PAGES = 12

let active = 0
let timer: number | null = null
const drawn = new Map<PDFDocumentProxy, number>()
// Pages of each document currently in or near view.
const inView = new Map<PDFDocumentProxy, number>()

function schedule(): void {
  if (timer !== null) window.clearTimeout(timer)
  timer = window.setTimeout(sweep, IDLE_MS)
}

function sweep(): void {
  timer = null
  if (active > 0) {
    schedule()
    return
  }
  for (const [pdf, pages] of drawn) {
    // Few pages drawn and still on screen: keep its caches for the next zoom.
    if (pages < CLEANUP_AFTER_PAGES && (inView.get(pdf) ?? 0) > 0) continue
    drawn.delete(pdf)
    // Rejects if the document was destroyed meanwhile; nothing to free then.
    pdf.cleanup().catch(() => {})
  }
}

// Wrap any pdf.js page render.
export async function track<T>(pdf: PDFDocumentProxy, work: () => Promise<T>): Promise<T> {
  active++
  if (timer !== null) window.clearTimeout(timer)
  timer = null
  try {
    return await work()
  } finally {
    active--
    drawn.set(pdf, (drawn.get(pdf) ?? 0) + 1)
    schedule()
  }
}

// Report a page of `pdf` coming into (+1) or leaving (-1) view; a document
// with nothing left in view gives its caches back at the next idle moment.
export function viewing(pdf: PDFDocumentProxy, delta: 1 | -1): void {
  const count = Math.max(0, (inView.get(pdf) ?? 0) + delta)
  if (count > 0) inView.set(pdf, count)
  else {
    inView.delete(pdf)
    if (drawn.has(pdf)) schedule()
  }
}

// A destroyed document must not be cleaned later.
export function forget(pdf: PDFDocumentProxy): void {
  drawn.delete(pdf)
  inView.delete(pdf)
}
