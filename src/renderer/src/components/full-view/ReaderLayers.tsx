import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useTextLayer } from './edit/SelectableTextLayer'

// What a plain PDF reader offers on the open page: select and copy text,
// follow links.

// Selecting starts only on text, so dragging blank paper still pans a
// zoomed page; Ctrl+C copies through the browser as usual.
export function CopyTextLayer({
  pdf,
  pageNumber,
  naturalHeight
}: {
  pdf: PDFDocumentProxy
  pageNumber: number
  naturalHeight: number
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useTextLayer(ref, pdf, pageNumber, naturalHeight)
  return (
    <div
      ref={ref}
      className="find-layer edit-select-layer copy-text-layer"
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) e.stopPropagation()
      }}
      onDoubleClick={(e) => {
        if (e.target !== e.currentTarget) e.stopPropagation()
      }}
    />
  )
}

interface LinkBox {
  left: number
  top: number
  width: number
  height: number
  url?: string
  dest?: unknown
}

async function pageIndexOf(pdf: PDFDocumentProxy, dest: unknown): Promise<number | null> {
  try {
    const explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest
    if (!Array.isArray(explicit) || explicit.length === 0) return null
    const target = explicit[0]
    return typeof target === 'number' ? target : await pdf.getPageIndex(target)
  } catch {
    return null
  }
}

// Web links open in the browser (the main process only lets http(s) and
// mailto out); links inside the file go to that page.
export function LinkLayer({
  pdf,
  pageNumber,
  onGoToSourcePage
}: {
  pdf: PDFDocumentProxy
  pageNumber: number
  onGoToSourcePage: (pageIndex: number) => void
}): React.JSX.Element | null {
  const [links, setLinks] = useState<LinkBox[]>([])

  useEffect(() => {
    let alive = true
    void (async () => {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      const annotations = await page.getAnnotations({ intent: 'display' })
      const boxes: LinkBox[] = []
      for (const a of annotations) {
        if (a.subtype !== 'Link' || (!a.url && !a.dest)) continue
        const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(a.rect)
        boxes.push({
          left: (Math.min(x1, x2) / viewport.width) * 100,
          top: (Math.min(y1, y2) / viewport.height) * 100,
          width: (Math.abs(x2 - x1) / viewport.width) * 100,
          height: (Math.abs(y2 - y1) / viewport.height) * 100,
          url: a.url ?? undefined,
          dest: a.dest ?? undefined
        })
      }
      if (alive) setLinks(boxes)
    })().catch(() => {})
    return () => {
      alive = false
    }
  }, [pdf, pageNumber])

  if (links.length === 0) return null
  return (
    <div className="link-layer">
      {links.map((link, i) => (
        <a
          key={i}
          className="pdf-link"
          href={link.url ?? '#'}
          title={link.url ?? 'Go to page'}
          style={{
            left: `${link.left}%`,
            top: `${link.top}%`,
            width: `${link.width}%`,
            height: `${link.height}%`
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (link.url) window.open(link.url, '_blank')
            else
              void pageIndexOf(pdf, link.dest).then((index) => {
                if (index !== null) onGoToSourcePage(index)
              })
          }}
        />
      ))}
    </div>
  )
}
