import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'

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
  const task = page.render({ canvas: off, viewport })
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

interface DetailGeometry {
  rect: DOMRect
  layoutW: number
  visLeft: number
  visTop: number
  visW: number
  visH: number
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
  const { rect, layoutW, visLeft, visTop, visW, visH } = geometry
  const d = dpr()
  const capFactor = Math.min(1, MAX_DETAIL / (visW * d), MAX_DETAIL / (visH * d))
  const renderScale = (rect.width / naturalWidth) * d * capFactor

  const page = await pdf.getPage(pageNumber)
  if (isCancelled()) return
  const viewport = page.getViewport({ scale: renderScale })
  const fx0 = (visLeft - rect.left) / rect.width
  const fy0 = (visTop - rect.top) / rect.height
  const backingW = Math.max(1, Math.round(visW * d * capFactor))
  const backingH = Math.max(1, Math.round(visH * d * capFactor))

  const off = document.createElement('canvas')
  off.width = backingW
  off.height = backingH
  const task = page.render({
    canvas: off,
    viewport,
    transform: [1, 0, 0, 1, -fx0 * viewport.width, -fy0 * viewport.height]
  })
  onTask(task)
  await task.promise
  if (isCancelled()) return

  detailCanvas.width = backingW
  detailCanvas.height = backingH
  detailCanvas.getContext('2d')!.drawImage(off, 0, 0)
  const effScale = rect.width / layoutW || 1
  detailCanvas.style.display = 'block'
  detailCanvas.style.left = `${(visLeft - rect.left) / effScale}px`
  detailCanvas.style.top = `${(visTop - rect.top) / effScale}px`
  detailCanvas.style.width = `${visW / effScale}px`
  detailCanvas.style.height = `${visH / effScale}px`
}
