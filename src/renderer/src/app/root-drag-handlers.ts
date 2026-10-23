import { computeDropTarget, isOwnPlace, overOwnPage } from '../canvas/layout'
import { countDroppableItems, isDroppableFile } from './drop-items'
import type { CanvasLayout, DropTarget } from '../canvas/layout'
import type { CanvasHandle } from '../components/Canvas'
import type { IncomingFile, PageRef } from './types'

const PAGE_MIME = 'application/x-pdfx-page'
const FILES_TYPE = 'Files'

// Holding Ctrl (Alt on macOS, as in Finder) while dropping a page copies it.
const isCopyDrag = (event: React.DragEvent): boolean =>
  window.api?.platform === 'darwin' ? event.altKey : event.ctrlKey

export interface RootDragDeps {
  layout: CanvasLayout
  canvasRef: React.RefObject<CanvasHandle | null>
  dragKind: 'internal' | 'external' | null
  draggingPage: PageRef | null
  dropTarget: DropTarget | null
  collapsedId: string | null
  externalCount: number
  dragDepth: React.MutableRefObject<number>
  setDragKind: (kind: 'internal' | 'external' | null) => void
  setExternalCount: (count: number) => void
  setCommitting: (committing: boolean) => void
  armDragWatchdog: () => void
  clearDrag: () => void
  updateDropTarget: (next: DropTarget | null) => void
  movePageInto: (source: PageRef, targetDocId: string, index: number) => void
  movePageToNewDoc: (source: PageRef, docIndex: number) => void
  copyPageInto: (source: PageRef, targetDocId: string, index: number) => void
  copyPageToNewDoc: (source: PageRef, docIndex: number) => void
  setCopying: (copying: boolean) => void
  // The pointer is over the page's own place: nothing moves yet.
  setHome: (home: boolean) => void
  onExternalDrop: (files: IncomingFile[], target: DropTarget | null) => void
}

export interface RootDragHandlers {
  onDragEnter: (event: React.DragEvent) => void
  onDragOver: (event: React.DragEvent) => void
  onDragLeave: (event: React.DragEvent) => void
  onDrop: (event: React.DragEvent) => void
}

export function createRootDragHandlers(deps: RootDragDeps): RootDragHandlers {
  const onDragEnter = (event: React.DragEvent): void => {
    if (event.dataTransfer.types.includes(PAGE_MIME)) return
    if (!event.dataTransfer.types.includes(FILES_TYPE)) return
    event.preventDefault()
    deps.dragDepth.current += 1
    if (deps.dragKind !== 'external') {
      deps.setExternalCount(countDroppableItems(event.dataTransfer.items))
      deps.setDragKind('external')
    }
  }

  const onDragOver = (event: React.DragEvent): void => {
    const internal = event.dataTransfer.types.includes(PAGE_MIME)
    if (!internal && !event.dataTransfer.types.includes(FILES_TYPE)) return
    event.preventDefault()
    const copy = internal && isCopyDrag(event)
    event.dataTransfer.dropEffect = internal && !copy ? 'move' : 'copy'
    if (internal) deps.setCopying(copy)
    else deps.armDragWatchdog()
    const w = deps.canvasRef.current?.clientToWorld(event.clientX, event.clientY)
    if (!w) return
    if (!internal) {
      deps.updateDropTarget(
        computeDropTarget(deps.layout, w.x, w.y, w.k, null, deps.externalCount <= 1)
      )
      return
    }
    const source = deps.draggingPage
    const target = internalTarget(w, copy)
    deps.setHome(!!source && isHome(w, target, copy))
    deps.updateDropTarget(target)
  }

  // Geometry as on screen: without the lifted page when moving.
  const internalTarget = (w: { x: number; y: number; k: number }, copy: boolean): DropTarget =>
    computeDropTarget(
      deps.layout,
      w.x,
      w.y,
      w.k,
      copy ? null : (deps.draggingPage?.pageId ?? null),
      true
    )

  const isHome = (w: { x: number; y: number }, target: DropTarget, copy: boolean): boolean => {
    const source = deps.draggingPage
    if (!source) return false
    if (overOwnPage(deps.layout, w.x, w.y, source.docId, source.pageId)) return true
    return !copy && isOwnPlace(deps.layout, target, source.docId, source.pageId)
  }

  const onDragLeave = (event: React.DragEvent): void => {
    if (event.dataTransfer.types.includes(PAGE_MIME)) return
    if (!event.dataTransfer.types.includes(FILES_TYPE)) return
    deps.dragDepth.current = Math.max(0, deps.dragDepth.current - 1)
    if (deps.dragDepth.current === 0) deps.clearDrag()
  }

  const onDrop = (event: React.DragEvent): void => {
    event.preventDefault()
    deps.setCommitting(true)
    const w = deps.canvasRef.current?.clientToWorld(event.clientX, event.clientY)
    const internal = event.dataTransfer.types.includes(PAGE_MIME)
    if (internal && deps.draggingPage) {
      const source = deps.draggingPage
      const copy = isCopyDrag(event)
      const target = w ? internalTarget(w, copy) : deps.dropTarget
      const home = w ? isHome(w, target!, copy) : false
      deps.clearDrag()
      if (home) return
      if (copy) {
        if (target?.kind === 'into') deps.copyPageInto(source, target.docId, target.index)
        else if (target?.kind === 'between') deps.copyPageToNewDoc(source, target.docIndex)
      } else if (target?.kind === 'into') deps.movePageInto(source, target.docId, target.index)
      else if (target?.kind === 'between') deps.movePageToNewDoc(source, target.docIndex)
      return
    }
    if (!event.dataTransfer.types.includes(FILES_TYPE)) {
      deps.clearDrag()
      return
    }
    const dropped = Array.from(event.dataTransfer.files)
    const paths = dropped.map((f) => window.api.getPathForFile(f))
    const target = w
      ? computeDropTarget(deps.layout, w.x, w.y, w.k, null, dropped.length <= 1)
      : deps.dropTarget
    deps.clearDrag()
    if (paths.length > 0 && paths.every(Boolean)) {
      void window.api.expandDropPaths(paths).then((files) => deps.onExternalDrop(files, target))
    } else {
      const supported = dropped.filter((f) => isDroppableFile(f.name, f.type))
      void Promise.all(
        supported.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }))
      ).then((files) => deps.onExternalDrop(files, target))
    }
  }

  return { onDragEnter, onDragOver, onDragLeave, onDrop }
}
