import type { PageEntry } from '../types'
import { track } from '../pdfx/pdf-activity'
import { layerConfig } from '../pdfx/layers'

// Both revisions are drawn onto sheets of one size: the older page's shape,
// as large as a pixel budget allows (about 100 dpi on an A1 drawing).
const MAX_PIXELS = 8_000_000
const MAX_SIDE = 4096

export interface Sheets {
  w: number
  h: number
  older: HTMLCanvasElement
  newer: HTMLCanvasElement
  // The pages differ in shape, so the newer one was fitted onto the older.
  reshaped: boolean
}

const turn = (page: PageEntry, own: number): number => (own + (page.rotation ?? 0)) % 360

async function pdfPage(page: PageEntry) {
  const p = await page.source.pdf.getPage(page.pageIndex + 1)
  const base = p.getViewport({ scale: 1, rotation: turn(page, p.rotate) })
  return { p, base }
}

async function draw(page: PageEntry, w: number, h: number): Promise<HTMLCanvasElement> {
  const { p, base } = await pdfPage(page)
  const scale = Math.min(w / base.width, h / base.height)
  const viewport = p.getViewport({ scale, rotation: turn(page, p.rotate) })
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  // Centred when the shapes differ.
  const ox = Math.round((w - viewport.width) / 2)
  const oy = Math.round((h - viewport.height) / 2)
  await track(
    page.source.pdf,
    () =>
      p.render({
        canvas,
        canvasContext: ctx,
        viewport,
        transform: ox || oy ? [1, 0, 0, 1, ox, oy] : undefined,
        background: '#ffffff',
        optionalContentConfigPromise: layerConfig(page.source.pdf)
      }).promise
  )
  return canvas
}

export async function renderSheets(older: PageEntry, newer: PageEntry): Promise<Sheets> {
  const a = (await pdfPage(older)).base
  const b = (await pdfPage(newer)).base
  const fit = Math.min(
    MAX_SIDE / Math.max(a.width, a.height),
    Math.sqrt(MAX_PIXELS / (a.width * a.height))
  )
  const w = Math.max(1, Math.floor(a.width * fit))
  const h = Math.max(1, Math.floor(a.height * fit))
  const [oldCanvas, newCanvas] = await Promise.all([draw(older, w, h), draw(newer, w, h)])
  return {
    w,
    h,
    older: oldCanvas,
    newer: newCanvas,
    reshaped: Math.abs(a.width / a.height - b.width / b.height) > 0.01
  }
}

export const pixels = (canvas: HTMLCanvasElement): Uint8ClampedArray =>
  canvas
    .getContext('2d', { willReadFrequently: true })!
    .getImageData(0, 0, canvas.width, canvas.height).data
