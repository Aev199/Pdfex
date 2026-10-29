import { useCallback, useEffect, useRef, useState } from 'react'
import { createRootDragHandlers } from './root-drag-handlers'
import type { CanvasLayout, DropTarget } from '../canvas/layout'
import type { CanvasHandle } from '../components/Canvas'
import type { IncomingFile, PageRef } from './types'

const DRAG_WATCHDOG_MS = 1000

interface DragControllerDeps {
  layout: CanvasLayout
  canvasRef: React.RefObject<CanvasHandle | null>
  movePageInto: (source: PageRef, targetDocId: string, index: number) => void
  movePageToNewDoc: (source: PageRef, docIndex: number) => void
  copyPageInto: (source: PageRef, targetDocId: string, index: number) => void
  copyPageToNewDoc: (source: PageRef, docIndex: number) => void
  moveGroupInto: (refs: PageRef[], grabbedId: string, targetDocId: string, index: number) => void
  moveGroupToNewDoc: (refs: PageRef[], grabbed: PageRef, docIndex: number) => void
  copyGroupInto: (refs: PageRef[], targetDocId: string, index: number) => void
  copyGroupToNewDoc: (refs: PageRef[], grabbed: PageRef, docIndex: number) => void
  onExternalDrop: (files: IncomingFile[], target: DropTarget | null) => void
}

export function useDragController(deps: DragControllerDeps) {
  const [dragKind, setDragKind] = useState<'internal' | 'external' | null>(null)
  const [draggingPage, setDraggingPage] = useState<PageRef | null>(null)
  // Every selected page when the grabbed one is part of a selection.
  const [group, setGroup] = useState<PageRef[] | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [collapsedId, setCollapsedId] = useState<string | null>(null)
  const [externalCount, setExternalCount] = useState(0)
  const [committing, setCommitting] = useState(false)
  // A copy drag leaves the dragged page in place instead of collapsing it.
  const [copying, setCopying] = useState(false)
  // Over the page's own place: the page stays put, nothing makes room.
  const [home, setHome] = useState(true)
  const dragDepth = useRef(0)
  const dragWatchdog = useRef<ReturnType<typeof setTimeout> | null>(null)

  const updateDropTarget = useCallback((next: DropTarget | null) => {
    setDropTarget((prev) => {
      if (prev === next) return prev
      if (!prev || !next || prev.kind !== next.kind) return next
      if (prev.kind === 'into' && next.kind === 'into') {
        return prev.docId === next.docId && prev.index === next.index ? prev : next
      }
      if (prev.kind === 'between' && next.kind === 'between') {
        return prev.docIndex === next.docIndex ? prev : next
      }
      return next
    })
  }, [])

  const clearDrag = useCallback(() => {
    if (dragWatchdog.current) {
      clearTimeout(dragWatchdog.current)
      dragWatchdog.current = null
    }
    dragDepth.current = 0
    setDragKind(null)
    setDraggingPage(null)
    setGroup(null)
    setDropTarget(null)
    setExternalCount(0)
    setCollapsedId(null)
    setCopying(false)
    setHome(true)
  }, [])

  const armDragWatchdog = useCallback(() => {
    if (dragWatchdog.current) clearTimeout(dragWatchdog.current)
    dragWatchdog.current = setTimeout(() => {
      dragWatchdog.current = null
      clearDrag()
    }, DRAG_WATCHDOG_MS)
  }, [clearDrag])

  const startPageDrag = useCallback((docId: string, pageId: string, selection?: PageRef[]) => {
    setDragKind('internal')
    setDraggingPage({ docId, pageId })
    setGroup(selection && selection.length > 1 ? selection : null)
  }, [])

  useEffect(() => {
    window.addEventListener('dragend', clearDrag)
    return () => window.removeEventListener('dragend', clearDrag)
  }, [clearDrag])

  useEffect(() => {
    if (!committing) return
    const id = requestAnimationFrame(() => setCommitting(false))
    return () => cancelAnimationFrame(id)
  }, [committing])

  useEffect(() => {
    if (!draggingPage) return
    const id = requestAnimationFrame(() => setCollapsedId(draggingPage.pageId))
    return () => cancelAnimationFrame(id)
  }, [draggingPage])

  const handlers = createRootDragHandlers({
    layout: deps.layout,
    canvasRef: deps.canvasRef,
    dragKind,
    draggingPage,
    group,
    dropTarget,
    collapsedId: copying || home ? null : collapsedId,
    externalCount,
    dragDepth,
    setDragKind,
    setExternalCount,
    setCommitting,
    armDragWatchdog,
    clearDrag,
    updateDropTarget,
    movePageInto: deps.movePageInto,
    movePageToNewDoc: deps.movePageToNewDoc,
    copyPageInto: deps.copyPageInto,
    copyPageToNewDoc: deps.copyPageToNewDoc,
    moveGroupInto: deps.moveGroupInto,
    moveGroupToNewDoc: deps.moveGroupToNewDoc,
    copyGroupInto: deps.copyGroupInto,
    copyGroupToNewDoc: deps.copyGroupToNewDoc,
    setCopying,
    setHome,
    onExternalDrop: deps.onExternalDrop
  })

  return {
    dragKind,
    draggingPage,
    dropTarget: dragKind === 'internal' && home ? null : dropTarget,
    collapsedId: copying || home ? null : collapsedId,
    // The lifted page while it still stands in its place.
    liftedId: dragKind === 'internal' && (home || copying) ? (draggingPage?.pageId ?? null) : null,
    // Several pages travel together (they are shown lifted).
    draggingGroup: dragKind === 'internal' && group !== null,
    externalCount,
    committing,
    startPageDrag,
    clearDrag,
    handlers
  }
}
