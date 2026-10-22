import { useCallback, useEffect, useState } from 'react'
import { safeFileName } from './useExport'
import type { ContextMenuItem } from '../components/ContextMenu'
import type { DocEntry, PageEntry } from '../types'
import type { ExternalApp, OpenAction, OpenSource } from '../../../preload'

// "Open with", "Show in Explorer" and drag-out to Explorer, ported from
// PDFx Plus for Windows. The original file is handed over when it is exactly
// what the user sees; anything assembled or annotated is exported first.

export type OpenTarget =
  | { kind: 'page'; docId: string; pageId: string }
  | { kind: 'doc'; docId: string }

// The one file behind the target, for showing it in its folder.
function revealPath(pages: PageEntry[]): string | null {
  const paths = new Set(pages.map((p) => p.source.path).filter((p): p is string => !!p))
  return paths.size === 1 ? [...paths][0] : null
}

// The original file, but only when its content is identical to what we would
// export: an unmodified PDF whose pages are all there, in order, unannotated.
function originPath(pages: PageEntry[], hasEdits: (page: PageEntry) => boolean): string | null {
  if (pages.length === 0) return null
  const source = pages[0].source
  if (!source.pristine || !source.path) return null
  if (!pages.every((p) => p.source === source && !hasEdits(p))) return null
  if (pages.length !== source.pdf.numPages) return null
  if (!pages.every((p, i) => p.pageIndex === i)) return null
  return source.path
}

// Windows needs a non-empty drag image for a native file drag.
function dragOutIcon(): string {
  const canvas = document.createElement('canvas')
  canvas.width = 28
  canvas.height = 36
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#9a9aa2'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(1, 1, 26, 34, 3)
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = '#c4c4cc'
  for (const y of [10, 16, 22, 28]) {
    ctx.beginPath()
    ctx.moveTo(6, y)
    ctx.lineTo(22, y)
    ctx.stroke()
  }
  return canvas.toDataURL('image/png')
}

export function useOpenWith(
  docsRef: React.RefObject<DocEntry[]>,
  buildPagesPdf: (pages: PageEntry[]) => Promise<Uint8Array>,
  hasEdits: (page: PageEntry) => boolean,
  setBusy: (busy: boolean) => void,
  flash: (message: string) => void
) {
  const [apps, setApps] = useState<ExternalApp[]>([])

  useEffect(() => {
    let alive = true
    window.api
      .listExternalApps()
      .then((found) => alive && setApps(found))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const resolve = useCallback(
    (target: OpenTarget): { doc: DocEntry; pages: PageEntry[]; name: string } | null => {
      const doc = docsRef.current.find((d) => d.id === target.docId)
      if (!doc) return null
      if (target.kind === 'doc') return { doc, pages: doc.pages, name: doc.name }
      const index = doc.pages.findIndex((p) => p.id === target.pageId)
      if (index === -1) return null
      return { doc, pages: [doc.pages[index]], name: `${doc.name} p${index + 1}` }
    },
    [docsRef]
  )

  const sourceFor = useCallback(
    async (pages: PageEntry[], name: string, action: OpenAction): Promise<OpenSource> => {
      const direct = action.type === 'explorer' ? revealPath(pages) : originPath(pages, hasEdits)
      if (direct) return { path: direct }
      return { bytes: await buildPagesPdf(pages), name: `${safeFileName(name)}.pdf` }
    },
    [buildPagesPdf, hasEdits]
  )

  const run = useCallback(
    async (target: OpenTarget, action: OpenAction): Promise<void> => {
      const found = resolve(target)
      if (!found) return
      setBusy(true)
      try {
        await window.api.openExternal(action, await sourceFor(found.pages, found.name, action))
      } catch (error) {
        console.error('Open with failed', error)
        flash('Could not open the file')
      } finally {
        setBusy(false)
      }
    },
    [resolve, sourceFor, setBusy, flash]
  )

  const openWithSubmenu = useCallback(
    (target: OpenTarget): ContextMenuItem[] => {
      const items: ContextMenuItem[] = apps.map((app) => ({
        label: app.name,
        onClick: () => void run(target, { type: 'app', path: app.path })
      }))
      if (apps.length > 0) items.push({ separator: true })
      items.push({ label: 'Choose app…', onClick: () => void run(target, { type: 'pick' }) })
      items.push({ label: 'Default app', onClick: () => void run(target, { type: 'default' }) })
      return items
    },
    [apps, run]
  )

  // Only offered when there is a real file behind the target.
  const revealItem = useCallback(
    (target: OpenTarget): ContextMenuItem[] => {
      const found = resolve(target)
      if (!found || !revealPath(found.pages)) return []
      return [{ label: 'Show in Explorer', onClick: () => void run(target, { type: 'explorer' }) }]
    },
    [resolve, run]
  )

  const startDocDragOut = useCallback(
    (docId: string) => {
      const found = resolve({ kind: 'doc', docId })
      if (!found || found.pages.length === 0) return
      void (async () => {
        try {
          const source = await sourceFor(found.pages, found.name, { type: 'default' })
          window.api.dragOut(source, dragOutIcon())
        } catch (error) {
          console.error('Drag out failed', error)
          flash('Could not drag the document out')
        }
      })()
    },
    [resolve, sourceFor, flash]
  )

  return { openWithSubmenu, revealItem, startDocDragOut }
}
