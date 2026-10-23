import { memo, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { dpr, logRenderError, renderBase, renderDetail, visibleGeometry } from './page-view/raster'
import { FULL_LEVELS, THUMB_LEVELS, nextLevel } from './page-view/raster-levels'
import { enqueueRender } from './page-view/render-queue'
import { track, viewing } from '../pdfx/pdf-activity'
import { FindHighlight } from './find-highlight'
import type { OcrWord } from '../ocr/types'

interface PageViewProps {
  pdf: PDFDocumentProxy
  pageNumber: number
  naturalWidth: number
  naturalHeight: number
  version: number
  eager?: boolean
  detail?: boolean
  highlightQuery?: string
  ocrWords?: OcrWord[]
}

// Pages this far outside the window start rendering, so scrolling rarely
// meets a blank page.
const LOAD_MARGIN = '400px'
// Rasters of pages that stay out of range this long are freed; scrolling
// back renders them again (from the small step first, so it is quick).
const UNLOAD_AFTER_MS = 4000
// Rasters this small are thumbnails on a zoomed-out board.
const SMALL_LEVEL = 320

const visibleNow = (el: Element): boolean => {
  const r = el.getBoundingClientRect()
  return r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight
}

const freeCanvas = (canvas: HTMLCanvasElement | null): void => {
  if (!canvas) return
  canvas.width = 0
  canvas.height = 0
}

function PageViewImpl({
  pdf,
  pageNumber,
  naturalWidth,
  naturalHeight,
  version,
  eager = false,
  detail = true,
  highlightQuery,
  ocrWords
}: PageViewProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLCanvasElement>(null)
  const detailRef = useRef<HTMLCanvasElement>(null)
  const [near, setNear] = useState(eager)
  const [baseReady, setBaseReady] = useState(false)
  // Long side of the raster on screen now (0: none) and the one wanted.
  const levelRef = useRef(0)
  const [level, setLevel] = useState(0)
  const levels = eager ? FULL_LEVELS : THUMB_LEVELS

  // In range or not; leaving range for a while frees the rasters.
  useEffect(() => {
    if (eager) {
      setNear(true)
      return
    }
    const el = rootRef.current
    if (!el) return
    let unloadTimer: number | null = null
    const observer = new IntersectionObserver(
      (entries) => {
        const inRange = entries.some((e) => e.isIntersecting)
        if (unloadTimer) window.clearTimeout(unloadTimer)
        unloadTimer = null
        if (inRange) {
          setNear(true)
        } else {
          unloadTimer = window.setTimeout(() => setNear(false), UNLOAD_AFTER_MS)
        }
      },
      { rootMargin: LOAD_MARGIN }
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (unloadTimer) window.clearTimeout(unloadTimer)
    }
  }, [eager])

  useEffect(() => {
    if (!near) return
    viewing(pdf, 1)
    return () => viewing(pdf, -1)
  }, [near, pdf])

  useEffect(() => {
    if (near) return
    freeCanvas(baseRef.current)
    freeCanvas(detailRef.current)
    // And what pdf.js keeps decoded for drawing it.
    if (levelRef.current > 0) {
      void pdf
        .getPage(pageNumber)
        .then((page) => page.cleanup())
        .catch(() => {})
    }
    if (detailRef.current) detailRef.current.style.display = 'none'
    levelRef.current = 0
    setLevel(0)
    setBaseReady(false)
  }, [near])

  // Pick the raster size from the size on screen whenever the camera settles.
  useEffect(() => {
    if (!near) return
    const root = rootRef.current
    if (!root) return
    const rect = root.getBoundingClientRect()
    const onScreen = Math.max(rect.width, rect.height) * dpr()
    if (onScreen <= 0) return
    const next = nextLevel(levelRef.current, onScreen, levels)
    if (next !== levelRef.current) setLevel(next)
  }, [near, version, levels])

  useEffect(() => {
    if (!near || level === 0) return
    const root = rootRef.current
    if (!root) return
    let cancelled = false
    let task: RenderTask | null = null
    enqueueRender({
      priority: eager ? -1 : visibleNow(root) ? 0 : 1,
      cancelled: () => cancelled,
      run: () =>
        track(pdf, () =>
          renderBase({
            pdf,
            pageNumber,
            naturalWidth,
            naturalHeight,
            longSide: level,
            cleanupAfter: !eager && (level <= SMALL_LEVEL || !visibleNow(root)),
            baseRef,
            isCancelled: () => cancelled,
            onTask: (t) => (task = t),
            onReady: () => {
              levelRef.current = level
              setBaseReady(true)
            }
          })
        ).catch(logRenderError(`Failed to render page ${pageNumber}`))
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [near, level, pdf, pageNumber, naturalWidth, naturalHeight, eager])

  useEffect(() => {
    if (!near || !baseReady) return
    const root = rootRef.current
    const detailCanvas = detailRef.current
    if (!root || !detailCanvas) return
    if (!detail) {
      detailCanvas.style.display = 'none'
      return
    }

    const rotation = Number(
      (root.closest('.page-rotor') as HTMLElement | null)?.dataset.rotation ?? 0
    )
    const geometry = visibleGeometry(
      root.getBoundingClientRect(),
      root.offsetWidth,
      root.offsetHeight,
      rotation
    )
    const baseDevicePx = (levelRef.current / Math.max(naturalWidth, naturalHeight)) * naturalWidth
    if (!geometry || root.offsetWidth * geometry.screenScale * dpr() <= baseDevicePx * 1.05) {
      detailCanvas.style.display = 'none'
      freeCanvas(detailCanvas)
      return
    }

    let cancelled = false
    let task: RenderTask | null = null
    enqueueRender({
      priority: -1,
      cancelled: () => cancelled,
      run: () =>
        track(pdf, () =>
          renderDetail({
            pdf,
            pageNumber,
            naturalWidth,
            geometry,
            detailCanvas,
            isCancelled: () => cancelled,
            onTask: (t) => (task = t)
          })
        ).catch(logRenderError(`Failed to render detail for page ${pageNumber}`))
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [near, baseReady, level, version, detail, pdf, pageNumber, naturalWidth, naturalHeight])

  return (
    <div className="pageview" ref={rootRef}>
      <canvas ref={baseRef} className={baseReady ? 'pageview-base ready' : 'pageview-base'} />
      <canvas ref={detailRef} className="pageview-detail" style={{ display: 'none' }} />
      {near && highlightQuery ? (
        <FindHighlight
          pdf={pdf}
          pageNumber={pageNumber}
          naturalHeight={naturalHeight}
          query={highlightQuery}
          ocrWords={ocrWords}
        />
      ) : null}
    </div>
  )
}

export const PageView = memo(PageViewImpl)
