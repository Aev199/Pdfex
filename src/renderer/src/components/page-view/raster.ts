import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { layerConfig } from '../../pdfx/layers'

export const MAX_DETAIL = 4096

export const dpr = (): number => Math.min(window.devicePixelRatio || 1, 2)

export const logRenderError =
  (label: string) =>
  (error: unknown): void => {
    if ((error as Error)?.name !== 'RenderingCancelledException') {
      console.error(label, error)
    }
  }

interface BaseParams {
  pdf: PDFDocumentProxy
  pageNumber: number
  naturalWidth: number
  naturalHeight: number
  // Long side of the raster in device pixels.
  longSide: number
  // Drop pdf.js's decoded images and parsed content for this page once drawn.
  // Worth it for small thumbnails (a scan keeps megabytes per page decoded);
  // not for a large page being looked at, which the next detail pass reuses.
  cleanupAfter: boolean
  baseRef: React.RefObject<HTMLCanvasElement | null>
  isCancelled: () => boolean
  onTask: (task: RenderTask) => void
  onReady: () => void
}

export async function renderBase({
  pdf,
  pageNumber,
  naturalWidth,
  naturalHeight,
  longSide,
  cleanupAfter,
  baseRef,
  isCancelled,
  onTask,
  onReady
}: BaseParams): Promise<void> {
  const page = await pdf.getPage(pageNumber)
  if (isCancelled()) return
  const scale = longSide / Math.max(naturalWidth, naturalHeight)
  const viewport = page.getViewport({ scale })
  const off = document.createElement('canvas')
  off.width = Math.max(1, Math.floor(viewport.width))
  off.height = Math.max(1, Math.floor(viewport.height))
  const task = page.render({
    canvas: off,
    viewport,
    optionalContentConfigPromise: layerConfig(pdf)
  })
  onTask(task)
  try {
    await task.promise
  } finally {
    if (cleanupAfter) page.cleanup()
  }
  if (isCancelled()) return
  const canvas = baseRef.current
  if (!canvas) return
  canvas.width = off.width
  canvas.height = off.height
  canvas.getContext('2d')!.drawImage(off, 0, 0)
  onReady()
}

// The visible part of a page, in the page's own (unturned) layout pixels.
export interface DetailGeometry {
  // Page box size in layout pixels.
  layoutW: number
  layoutH: number
  // Screen pixels per layout pixel (the canvas zoom).
  screenScale: number
  // Visible box within the page, layout pixels.
  x0: number
  y0: number
  x1: number
  y1: number
}

// Map the on-screen visible rectangle of a page box that may be turned by
// `rotation` (clockwise) back into the box's own coordinates.
export function visibleGeometry(
  rect: { left: number; top: number; width: number; height: number },
  layoutW: number,
  layoutH: number,
  rotation: number
): DetailGeometry | null {
  const visLeft = Math.max(0, rect.left)
  const visTop = Math.max(0, rect.top)
  const visRight = Math.min(window.innerWidth, rect.left + rect.width)
  const visBottom = Math.min(window.innerHeight, rect.top + rect.height)
  if (visRight <= visLeft || visBottom <= visTop || layoutW <= 0 || layoutH <= 0) return null
  const su0 = (visLeft - rect.left) / rect.width
  const su1 = (visRight - rect.left) / rect.width
  const sv0 = (visTop - rect.top) / rect.height
  const sv1 = (visBottom - rect.top) / rect.height
  const toLocal = (u: number, v: number): [number, number] =>
    rotation === 90
      ? [v, 1 - u]
      : rotation === 180
        ? [1 - u, 1 - v]
        : rotation === 270
          ? [1 - v, u]
          : [u, v]
  const [a, b] = [toLocal(su0, sv0), toLocal(su1, sv1)]
  const sideways = rotation === 90 || rotation === 270
  return {
    layoutW,
    layoutH,
    screenScale: (sideways ? rect.height : rect.width) / layoutW,
    x0: Math.min(a[0], b[0]) * layoutW,
    y0: Math.min(a[1], b[1]) * layoutH,
    x1: Math.max(a[0], b[0]) * layoutW,
    y1: Math.max(a[1], b[1]) * layoutH
  }
}

interface DetailParams {
  pdf: PDFDocumentProxy
  pageNumber: number
  naturalWidth: number
  geometry: DetailGeometry
  detailCanvas: HTMLCanvasElement
  isCancelled: () => boolean
  onTask: (task: RenderTask) => void
}

export async function renderDetail({
  pdf,
  pageNumber,
  naturalWidth,
  geometry,
  detailCanvas,
  isCancelled,
  onTask
}: DetailParams): Promise<void> {
  const { layoutW, layoutH, screenScale, x0, y0, x1, y1 } = geometry
  const d = dpr()
  const visW = (x1 - x0) * screenScale
  const visH = (y1 - y0) * screenScale
  const capFactor = Math.min(1, MAX_DETAIL / (visW * d), MAX_DETAIL / (visH * d))
  const renderScale = ((layoutW * screenScale) / naturalWidth) * d * capFactor

  const page = await pdf.getPage(pageNumber)
  if (isCancelled()) return
  const viewport = page.getViewport({ scale: renderScale })
  const backingW = Math.max(1, Math.round(visW * d * capFactor))
  const backingH = Math.max(1, Math.round(visH * d * capFactor))

  const off = document.createElement('canvas')
  off.width = backingW
  off.height = backingH
  const task = page.render({
    canvas: off,
    viewport,
    optionalContentConfigPromise: layerConfig(pdf),
    transform: [1, 0, 0, 1, -(x0 / layoutW) * viewport.width, -(y0 / layoutH) * viewport.height]
  })
  onTask(task)
  await task.promise
  if (isCancelled()) return

  detailCanvas.width = backingW
  detailCanvas.height = backingH
  detailCanvas.getContext('2d')!.drawImage(off, 0, 0)
  detailCanvas.style.display = 'block'
  detailCanvas.style.left = `${x0}px`
  detailCanvas.style.top = `${y0}px`
  detailCanvas.style.width = `${x1 - x0}px`
  detailCanvas.style.height = `${y1 - y0}px`
}
