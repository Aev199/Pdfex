import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { computeLayout } from './canvas/layout'
import { Toolbar } from './components/Toolbar'
import { FullView } from './components/FullView'
import { CollectionCanvas } from './components/CollectionCanvas'
import type { CanvasHandle } from './components/Canvas'
import { useCollection } from './app/useCollection'
import { createZoomStore } from './app/zoom-store'
import { useFullView } from './app/useFullView'
import { useMarks } from './app/useMarks'
import { useComments } from './app/useComments'
import { rotateKey } from './app/rotate-keys'
import { lastPosition, rememberPosition } from './app/reading-positions'
import { CompareView } from './components/compare/CompareView'
import type { ComparePage } from './components/compare/CompareView'
import { useFormValues } from './app/useFormValues'
import { useElements } from './app/useElements'
import { ACTIONS, useUndoStack } from './app/undo'
import { flipPages } from './canvas/flip-pages'
import { useExport } from './app/useExport'
import { useImport } from './app/useImport'
import { usePaste } from './app/usePaste'
import { useDragController } from './app/useDragController'
import { useKeyboardShortcuts } from './app/useKeyboardShortcuts'
import { useFind } from './app/useFind'
import { useSearchIndex } from './search/useSearchIndex'
import { FindProvider } from './search/FindContext'
import { FindBar } from './components/FindBar'
import { useAiBridge } from './app/ai-bridge/useAiBridge'
import { useAiChat } from './ai/useAiChat'
import { resolveAiConfig } from './ai/provider'
import { computeAiFocus } from './ai/focus'
import { useAiActivity } from './ai/activity/useAiActivity'
import { withActivity } from './ai/activity/tracker'
import { AiActivityProvider } from './ai/activity/context'
import { AiChatPanel } from './components/ai/AiChatPanel'
import { ExportPicker } from './components/ExportPicker'
import { StatusRibbon } from './components/StatusRibbon'
import { useDocInfo } from './app/useDocInfo'
import { useOpenWith } from './app/useOpenWith'
import { usePrint } from './app/usePrint'
import { clipboardAnnotations, rememberClipboardAnnotations } from './app/useClipboard'
import { useContextMenu } from './app/context-menu'
import { useSourceWatch } from './app/useSourceWatch'
import { NoticeBar } from './components/NoticeBar'
import type { Notice } from './components/NoticeBar'
import { relinkPages } from './app/session'
import { loadSource, fileMeta } from './pdfx/source'
import type { MissingDoc } from './app/workspaces'
import type { ContextMenuItem } from './components/ContextMenu'
import type { DocsUpdate } from './app/useCollection'
import type { Workspace, WorkspaceSnapshot } from './app/workspaces'
import type { PageRef } from './app/types'

const TOAST_MS = 4000

// What the tab shell can ask of the mounted workspace.
export interface WorkspaceViewHandle {
  // Everything needed to bring this workspace back exactly as it is now.
  snapshot(): WorkspaceSnapshot
  // Take documents out (to move them to another workspace).
  removeDocs(docIds: string[]): void
  updateDocs(update: DocsUpdate): void
  flash(message: string): void
}

interface WorkspaceViewProps {
  initial: WorkspaceSnapshot
  handleRef: React.Ref<WorkspaceViewHandle>
  tabBar: React.ReactNode
  workspaces: Workspace[]
  activeWorkspaceId: string
  onMoveDocsToTab: (docIds: string[], targetId: string | null) => void
  // Document updates that arrive after this view was switched away from.
  onDetachedUpdate: (update: DocsUpdate) => void
  // Something worth autosaving changed.
  onChange: () => void
  // A .pdfxs session file was opened.
  onOpenSession: (path: string) => void
}

export function WorkspaceView({
  initial,
  handleRef,
  tabBar,
  workspaces,
  activeWorkspaceId,
  onMoveDocsToTab,
  onDetachedUpdate,
  onChange,
  onOpenSession
}: WorkspaceViewProps): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  // Zoom ticks arrive ~11x/s while zooming; keep them out of App state so
  // only the toolbar's percentage re-renders.
  const zoomStore = useMemo(createZoomStore, [])
  const [renderVersion, setRenderVersion] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const canvasRef = useRef<CanvasHandle | null>(null)

  const flash = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
  }, [])

  const undoStack = useUndoStack(initial.undo)
  const markState = useMarks(undoStack.push, initial.marks)
  const formState = useFormValues(initial.formValues)
  const elementState = useElements(undoStack.push, initial.elements, initial.nextElementNumber)
  const commentState = useComments(initial.comments)
  const collection = useCollection(flash, undoStack.push, initial, onDetachedUpdate)
  const [missing, setMissing] = useState<MissingDoc[]>(initial.missing)
  const missingRef = useRef(missing)
  missingRef.current = missing

  useImperativeHandle(
    handleRef,
    () => ({
      snapshot: () => ({
        docs: collection.docsRef.current,
        marks: markState.marksRef.current,
        elements: elementState.elementsRef.current,
        comments: commentState.commentsRef.current,
        formValues: formState.valuesRef.current,
        nextElementNumber: elementState.nextNumberRef.current,
        undo: undoStack.snapshot(),
        view: canvasRef.current?.getView() ?? initial.view,
        selected: collection.selectedRef.current,
        missing: missingRef.current
      }),
      removeDocs: (docIds) => {
        const ids = new Set(docIds)
        collection.setDocs((prev) => prev.filter((d) => !ids.has(d.id)))
        collection.setSelected((sel) => (sel && ids.has(sel.docId) ? null : sel))
      },
      updateDocs: (update) => collection.setDocs(update),
      flash
    }),
    [collection, markState, elementState, commentState, formState, undoStack, initial.view, flash]
  )
  const fullViewState = useFullView()
  const openPageRef = useRef(fullViewState.openPage)
  openPageRef.current = fullViewState.openPage

  // Where each file was last read, and an offer to continue there when it is
  // opened again (documents already here when the tab mounts don't ask).
  const readingPage = fullViewState.fullView ? fullViewState.hiddenPageId : null
  useEffect(() => {
    if (!readingPage) return
    for (const doc of collection.docsRef.current) {
      const page = doc.pages.find((p) => p.id === readingPage)
      if (page?.source.path) rememberPosition(page.source.path, page.pageIndex)
    }
  }, [readingPage, collection.docsRef])
  const seenDocs = useRef(new Set(initial.docs.map((d) => d.id)))
  const [resume, setResume] = useState<{
    docId: string
    pageId: string
    name: string
    number: number
  } | null>(null)
  useEffect(() => {
    for (const doc of collection.docs) {
      if (seenDocs.current.has(doc.id)) continue
      seenDocs.current.add(doc.id)
      const path = doc.pages[0]?.source.path
      const at = path ? lastPosition(path) : null
      if (!at) continue
      const index = doc.pages.findIndex((p) => p.source.path === path && p.pageIndex === at)
      if (index > 0) {
        setResume({ docId: doc.id, pageId: doc.pages[index].id, name: doc.name, number: index + 1 })
      }
    }
    setResume((r) => (r && !collection.docs.some((d) => d.id === r.docId) ? null : r))
  }, [collection.docs])
  const docs = collection.docs

  const searchIndex = useSearchIndex(docs, elementState.elements)

  const [aiOpen, setAiOpen] = useState(false)
  const aiEnabled = useMemo(() => resolveAiConfig().ready, [])
  const aiFocus = useMemo(
    () => computeAiFocus(docs, collection.selected, fullViewState.hiddenPageId),
    [docs, collection.selected, fullViewState.hiddenPageId]
  )
  const aiActivity = useAiActivity()
  const { getOcrWords, ocrStatus, activateOcr } = searchIndex
  const exportOcr = useMemo(
    () => ({ words: getOcrWords, status: ocrStatus, activate: activateOcr }),
    [getOcrWords, ocrStatus, activateOcr]
  )
  const aiOcr = useMemo(
    () => ({ getOcrWords, ocrStatus, activateOcr }),
    [getOcrWords, ocrStatus, activateOcr]
  )
  const aiBridge = useAiBridge(collection, elementState, formState, markState, aiOcr, aiFocus)
  const trackedAiBridge = useMemo(
    () => withActivity(aiBridge, aiActivity.tracker),
    [aiBridge, aiActivity.tracker]
  )
  const aiChat = useAiChat(trackedAiBridge)
  const { busy: aiBusy } = aiChat
  const { clear: clearAiActivity } = aiActivity
  useEffect(() => {
    if (!aiBusy) clearAiActivity()
  }, [aiBusy, clearAiActivity])

  const find = useFind(searchIndex.search, searchIndex.version)
  // Scanned pages are recognized once the user starts searching.
  useEffect(() => {
    if (find.open) activateOcr()
  }, [find.open, activateOcr])
  const findState = useMemo(
    () => ({
      active: find.active,
      query: find.matchedQuery,
      matchingDocIds: find.result.docIds,
      matchingPageIds: find.result.pageIds,
      getOcrWords: searchIndex.getOcrWords
    }),
    [find.active, find.matchedQuery, find.result, searchIndex.getOcrWords]
  )

  // Autosave whenever the content of this workspace changes.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(() => {
    onChangeRef.current()
  }, [
    docs,
    markState.marks,
    elementState.elements,
    commentState.comments,
    formState.values,
    missing
  ])

  const sourceWatch = useSourceWatch(docs, collection.swapSource, flash)

  // Bring back pages whose file went missing, from a file the user picks.
  // Every missing entry that pointed at the same file is relinked at once.
  const { setDocs: setDocsForRelink } = collection
  const relink = useCallback(
    async (entry: MissingDoc) => {
      const [file] = await window.api.openFiles()
      if (!file) return
      try {
        const { source } = await loadSource(file.data, fileMeta(file, false))
        const matching = missingRef.current.filter((m) => m.source.id === entry.source.id)
        setDocsForRelink((prev) => {
          let next = prev
          for (const m of matching) {
            const pages = relinkPages(m, source)
            if (pages.length === 0) continue
            next = next.some((d) => d.id === m.doc.id)
              ? next.map((d) => (d.id === m.doc.id ? { ...d, pages: [...d.pages, ...pages] } : d))
              : [
                  ...next.slice(0, m.index ?? next.length),
                  { id: m.doc.id, name: m.doc.name, pages },
                  ...next.slice(m.index ?? next.length)
                ]
          }
          return next
        })
        setMissing((prev) => prev.filter((m) => m.source.id !== entry.source.id))
        if (file.data.byteLength !== entry.source.byteLength) {
          flash(`${file.name} differs from the original file; check the pages`)
        }
      } catch (error) {
        console.error('Relink failed', error)
        flash(`Could not open ${file.name}`)
      }
    },
    [setDocsForRelink, flash]
  )

  const notices = useMemo((): Notice[] => {
    const list: Notice[] = missing.map((m) => ({
      id: `missing:${m.source.id}:${m.doc.id}`,
      text: `"${m.doc.name}": file not found (${m.doc.pages.length} ${m.doc.pages.length === 1 ? 'page' : 'pages'})`,
      detail: m.source.path,
      actions: [
        { label: 'Locate…', primary: true, onClick: () => void relink(m) },
        {
          label: 'Remove',
          onClick: () => setMissing((prev) => prev.filter((x) => x !== m))
        }
      ]
    }))
    for (const change of sourceWatch.changes) {
      const name = change.source.path!.split(/[\\/]/).pop()
      list.push(
        change.kind === 'changed'
          ? {
              id: `changed:${change.source.id}`,
              text: `${name} was changed by another program`,
              detail: change.source.path,
              actions: [
                {
                  label: 'Reload',
                  primary: true,
                  onClick: () => void sourceWatch.reload(change.source)
                },
                { label: 'Keep current', onClick: () => void sourceWatch.ignore(change.source) }
              ]
            }
          : {
              id: `gone:${change.source.id}`,
              text: `${name} was moved or deleted; its pages stay open but can't be exported`,
              detail: change.source.path,
              actions: [{ label: 'OK', onClick: () => void sourceWatch.ignore(change.source) }]
            }
      )
    }
    if (resume) {
      list.push({
        id: `resume:${resume.docId}`,
        text: `"${resume.name}": continue reading at page ${resume.number}?`,
        actions: [
          {
            label: `Open page ${resume.number}`,
            primary: true,
            onClick: () => {
              setResume(null)
              openPageRef.current(resume.docId, resume.pageId)
            }
          },
          { label: 'No', onClick: () => setResume(null) }
        ]
      })
    }
    return list
  }, [missing, sourceWatch, relink, resume])

  const { exportCollection, exportPages, exportZip, buildPagesPdf, hasEdits } = useExport(
    docs,
    markState.marks,
    formState.values,
    elementState.elements,
    commentState.comments,
    exportOcr,
    setBusy,
    flash
  )
  const {
    addFiles,
    openViaDialog,
    addPagesToDoc,
    handleExternalDropFiles,
    replaceDoc,
    pendingImports
  } = useImport(collection, setBusy, flash, onOpenSession)
  const layout = useMemo(
    () => computeLayout(docs, pendingImports.length),
    [docs, pendingImports.length]
  )
  const openWith = useOpenWith(collection.docsRef, buildPagesPdf, hasEdits, setBusy, flash)
  const printPages = usePrint(buildPagesPdf, setBusy, flash)
  // Copied pages carry their marks and elements, also into another tab.
  const { copyToPages: copyMarksFrom, marksRef } = markState
  const { copyToPages: copyElementsFrom, elementsRef } = elementState
  const { copySelected: copyPageRefs } = collection
  const copyPages = useCallback(() => {
    if (copyPageRefs().length > 0) {
      rememberClipboardAnnotations(marksRef.current, elementsRef.current)
    }
  }, [copyPageRefs, marksRef, elementsRef])
  const onPastedPages = useCallback(
    (origins: Map<string, string>) => {
      const clip = clipboardAnnotations()
      copyMarksFrom(origins, clip.marks)
      copyElementsFrom(origins, clip.elements)
    },
    [copyMarksFrom, copyElementsFrom]
  )
  const { handlePaste } = usePaste(collection, addFiles, setBusy, flash, onPastedPages)

  // A Ctrl-dragged copy takes the page's marks and elements along.
  const { copyPageInto: copyPageIntoDoc, copyPageToNewDoc: copyPageToDoc } = collection
  const annotateCopy = useCallback(
    (copyId: string | null, originId: string) => {
      if (!copyId) return
      const origins = new Map([[copyId, originId]])
      copyMarksFrom(origins)
      copyElementsFrom(origins)
    },
    [copyMarksFrom, copyElementsFrom]
  )
  const copyPageInto = useCallback(
    (source: PageRef, docId: string, index: number) =>
      annotateCopy(copyPageIntoDoc(source, docId, index), source.pageId),
    [annotateCopy, copyPageIntoDoc]
  )
  const copyPageToNewDoc = useCallback(
    (source: PageRef, docIndex: number) =>
      annotateCopy(copyPageToDoc(source, docIndex), source.pageId),
    [annotateCopy, copyPageToDoc]
  )

  const drag = useDragController({
    layout,
    canvasRef,
    movePageInto: collection.movePageInto,
    movePageToNewDoc: collection.movePageToNewDoc,
    copyPageInto,
    copyPageToNewDoc,
    onExternalDrop: handleExternalDropFiles
  })

  const onPaste = useCallback(() => void handlePaste(), [handlePaste])
  const { undo: popUndo, redo: popRedo } = undoStack
  const { applyUndo: applyMarkUndo, applyRedo: applyMarkRedo } = markState
  const { applyUndo: applyElementUndo, applyRedo: applyElementRedo } = elementState
  const { placePageAt, applyPageSource, applyDocs } = collection
  const onUndo = useCallback(() => {
    const entry = popUndo()
    if (!entry) return
    if (entry.action === ACTIONS.MARK) applyMarkUndo(entry)
    else if (entry.action === ACTIONS.ELEMENT) applyElementUndo(entry)
    else if (entry.action === ACTIONS.PAGE_SOURCE) applyPageSource(entry, 'undo')
    else if (entry.action === ACTIONS.DOCS) flipPages(() => applyDocs(entry, 'undo'))
    else flipPages(() => placePageAt(entry.payload.pageId, entry.payload.from))
  }, [popUndo, applyMarkUndo, applyElementUndo, applyPageSource, applyDocs, placePageAt])
  const onRedo = useCallback(() => {
    const entry = popRedo()
    if (!entry) return
    if (entry.action === ACTIONS.MARK) applyMarkRedo(entry)
    else if (entry.action === ACTIONS.ELEMENT) applyElementRedo(entry)
    else if (entry.action === ACTIONS.PAGE_SOURCE) applyPageSource(entry, 'redo')
    else if (entry.action === ACTIONS.DOCS) flipPages(() => applyDocs(entry, 'redo'))
    else flipPages(() => placePageAt(entry.payload.pageId, entry.payload.to))
  }, [popRedo, applyMarkRedo, applyElementRedo, applyPageSource, applyDocs, placePageAt])

  // Duplicates carry the marks and elements of their originals.
  const { duplicateSelection: duplicatePageSelection, duplicateDoc: duplicateWholeDoc } = collection
  const { copyToPages: copyMarks } = markState
  const { copyToPages: copyElements } = elementState
  const duplicateSelection = useCallback(() => {
    const origins = duplicatePageSelection()
    copyMarks(origins)
    copyElements(origins)
  }, [duplicatePageSelection, copyMarks, copyElements])
  const duplicateDoc = useCallback(
    (docId: string) => {
      const origins = duplicateWholeDoc(docId)
      copyMarks(origins)
      copyElements(origins)
    },
    [duplicateWholeDoc, copyMarks, copyElements]
  )

  // Hovering a document shows its details in the bottom ribbon. Clearing is
  // deferred so crossing the small gap between title and box doesn't flicker.
  const [hoveredDocId, setHoveredDocId] = useState<string | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onHoverDoc = useCallback((docId: string | null) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = null
    if (docId) setHoveredDocId(docId)
    else hoverTimer.current = setTimeout(() => setHoveredDocId(null), 260)
  }, [])
  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
    },
    []
  )
  const hoveredDoc = useMemo(
    () => (hoveredDocId ? (docs.find((d) => d.id === hoveredDocId) ?? null) : null),
    [docs, hoveredDocId]
  )
  const hoveredInfo = useDocInfo(fullViewState.fullView ? null : hoveredDoc)

  const selectedIds = useMemo(
    () => new Set(collection.selection.map((r) => r.pageId)),
    [collection.selection]
  )

  // "Export PDF" asks which documents when there is a choice to make.
  const [exportPickerOpen, setExportPickerOpen] = useState(false)
  const { docsRef } = collection
  const requestPdfExport = useCallback(() => {
    const count = docsRef.current.length
    if (count === 0) flash('Nothing to export')
    else if (count === 1) void exportCollection('pdf')
    else setExportPickerOpen(true)
  }, [docsRef, exportCollection, flash])

  const openMenu = useContextMenu()
  const {
    selectionRef,
    ensureSelected,
    currentSelection,
    extractSelection,
    deleteSelection,
    splitDocAt,
    removeDoc,
    rotateSelection,
    rotateDoc
  } = collection

  const printDoc = useCallback(
    (docId: string) => {
      const doc = docsRef.current.find((d) => d.id === docId)
      if (doc) void printPages(doc.pages, doc.name)
    },
    [docsRef, printPages]
  )
  const { openWithSubmenu, revealItem, startDocDragOut } = openWith

  const exportSelection = useCallback(() => {
    const ids = new Set(currentSelection().map((r) => r.pageId))
    const pages = docsRef.current.flatMap((d) => d.pages.filter((p) => ids.has(p.id)))
    const first = docsRef.current.find((d) => d.pages.some((p) => ids.has(p.id)))
    void exportPages(pages, `${first?.name ?? 'pages'} (selection)`)
  }, [currentSelection, docsRef, exportPages])

  const moveToTabItems = useCallback(
    (docIds: string[]): ContextMenuItem[] => [
      ...workspaces
        .filter((w) => w.id !== activeWorkspaceId)
        .map((w) => ({
          label: w.name || 'Untitled tab',
          onClick: () => onMoveDocsToTab(docIds, w.id)
        })),
      ...(workspaces.length > 1 ? [{ separator: true }] : []),
      { label: 'New tab', onClick: () => onMoveDocsToTab(docIds, null) }
    ],
    [workspaces, activeWorkspaceId, onMoveDocsToTab]
  )

  // Two selected pages side by side as revisions: the first in the documents'
  // order is taken as the older one.
  const [compare, setCompare] = useState<{ older: ComparePage; newer: ComparePage } | null>(null)
  const compareSelection = useCallback(() => {
    const chosen = new Set(selectionRef.current.map((r) => r.pageId))
    const found: ComparePage[] = []
    for (const doc of collection.docsRef.current) {
      doc.pages.forEach((page, i) => {
        if (chosen.has(page.id)) found.push({ page, label: `${doc.name} · p. ${i + 1}` })
      })
    }
    if (found.length === 2) setCompare({ older: found[0], newer: found[1] })
  }, [selectionRef, collection.docsRef])

  const onPageContextMenu = useCallback(
    (docId: string, pageId: string, x: number, y: number) => {
      // Right-clicking inside the selection acts on all of it; outside, it
      // selects just that page first.
      const sel = selectionRef.current
      const count = sel.length > 1 && sel.some((r) => r.pageId === pageId) ? sel.length : 1
      ensureSelected(docId, pageId)
      if (count > 1) {
        openMenu(x, y, [
          ...(count === 2
            ? [
                { label: 'Compare the 2 pages', onClick: () => compareSelection() },
                { separator: true as const }
              ]
            : []),
          { label: `Duplicate ${count} pages`, onClick: duplicateSelection },
          { label: `Copy ${count} pages`, onClick: copyPages },
          { label: 'Rotate right', onClick: () => rotateSelection(90) },
          { label: 'Rotate left', onClick: () => rotateSelection(-90) },
          { label: `Extract ${count} pages to a new document`, onClick: extractSelection },
          { label: `Export ${count} pages as PDF…`, onClick: exportSelection },
          { separator: true },
          { label: `Delete ${count} pages`, danger: true, onClick: deleteSelection }
        ])
        return
      }
      openMenu(x, y, [
        { label: 'Open', onClick: () => fullViewState.openPage(docId, pageId) },
        { separator: true },
        { label: 'Duplicate page', onClick: duplicateSelection },
        { label: 'Rotate right', onClick: () => rotateSelection(90) },
        { label: 'Rotate left', onClick: () => rotateSelection(-90) },
        { label: 'Copy page', onClick: copyPages },
        { label: 'Split document here', onClick: () => splitDocAt(docId, pageId) },
        { label: 'Extract to a new document', onClick: extractSelection },
        { label: 'Export page as PDF…', onClick: exportSelection },
        { separator: true },
        { label: 'Open with', submenu: openWithSubmenu({ kind: 'page', docId, pageId }) },
        ...revealItem({ kind: 'page', docId, pageId }),
        { separator: true },
        { label: 'Delete page', danger: true, onClick: deleteSelection }
      ])
    },
    [
      selectionRef,
      ensureSelected,
      compareSelection,
      openMenu,
      duplicateSelection,
      extractSelection,
      exportSelection,
      deleteSelection,
      copyPages,
      splitDocAt,
      openWithSubmenu,
      revealItem,
      fullViewState
    ]
  )

  const onDocContextMenu = useCallback(
    (docId: string, x: number, y: number) => {
      openMenu(x, y, [
        { label: 'Duplicate document', onClick: () => duplicateDoc(docId) },
        { label: 'Rotate document right', onClick: () => rotateDoc(docId, 90) },
        { label: 'Rotate document left', onClick: () => rotateDoc(docId, -90) },
        { label: 'Print document…', onClick: () => printDoc(docId) },
        { label: 'Replace with another file…', onClick: () => void replaceDoc(docId) },
        { label: 'Export document as PDF…', onClick: () => void exportCollection('pdf', [docId]) },
        { separator: true },
        { label: 'Move to tab', submenu: moveToTabItems([docId]) },
        { label: 'Open with', submenu: openWithSubmenu({ kind: 'doc', docId }) },
        ...revealItem({ kind: 'doc', docId }),
        { separator: true },
        { label: 'Remove document', danger: true, onClick: () => removeDoc(docId) }
      ])
    },
    [
      openMenu,
      duplicateDoc,
      replaceDoc,
      exportCollection,
      moveToTabItems,
      openWithSubmenu,
      revealItem,
      removeDoc
    ]
  )

  useKeyboardShortcuts({
    active: !fullViewState.fullView,
    selected: collection.selected,
    onDeleteSelection: collection.deleteSelection,
    onDuplicate: duplicateSelection,
    onSelectAll: collection.selectAll,
    onCopy: copyPages,
    onPaste,
    onUndo,
    onRedo,
    onClearSelection: collection.clearSelection,
    findOpen: find.open,
    onOpenFind: find.openFind,
    onCloseFind: find.closeFind
  })

  const onScaleChange = useCallback((next: number) => zoomStore.set(next), [zoomStore])
  const onSettle = useCallback(() => {
    setRenderVersion((v) => v + 1)
    // The camera position is part of the saved session.
    onChangeRef.current()
  }, [])

  const fullViewRef = fullViewState.fullViewRef
  useEffect(() => {
    return window.api.onZoom((action) => {
      if (fullViewRef.current) return
      if (action === 'in') canvasRef.current?.zoomIn()
      else if (action === 'out') canvasRef.current?.zoomOut()
      else canvasRef.current?.reset()
    })
  }, [fullViewRef])

  // Turn the page open in the reader, or the selected pages.
  const { rotatePage, rotateSelection: rotateSelected, selectedRef } = collection
  const { hiddenPageId } = fullViewState
  const rotate = useCallback(
    (delta: 90 | -90) => {
      if (fullViewRef.current) {
        if (hiddenPageId) rotatePage(hiddenPageId, delta)
      } else if (selectedRef.current) {
        rotateSelected(delta)
      } else {
        flash('Select the pages to rotate')
      }
    },
    [fullViewRef, hiddenPageId, rotatePage, rotateSelected, selectedRef, flash]
  )
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const delta = rotateKey(event)
      if (!delta) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      event.preventDefault()
      rotate(delta)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rotate])

  useEffect(() => {
    return window.api.onMenu((action) => {
      if (action === 'rotate-right') rotate(90)
      else if (action === 'rotate-left') rotate(-90)
      else if (action === 'open') void openViaDialog()
      else if (action === 'export-pdfx') void exportCollection('pdfx')
      else if (action === 'export-pdf') void exportCollection('pdf')
      else if (action === 'export-zip') void exportZip()
      else if (action === 'print' && !fullViewRef.current) {
        // The document of the selected page, or the only one.
        const all = docsRef.current
        const docId = collection.selectedRef.current?.docId ?? (all.length === 1 ? all[0].id : null)
        if (docId) printDoc(docId)
        else flash('Select a page of the document to print')
      }
    })
  }, [
    rotate,
    openViaDialog,
    exportCollection,
    exportZip,
    printDoc,
    docsRef,
    collection.selectedRef,
    flash,
    fullViewRef
  ])

  const totalPages = docs.reduce((sum, d) => sum + d.pages.length, 0)
  const { fullView } = fullViewState
  const fullViewDoc = fullView ? docs.find((d) => d.id === fullView.docId) : undefined
  // Its document went away (undo, removal): close for good, or redo would
  // bring the reader back unasked.
  const { closeFullView } = fullViewState
  useEffect(() => {
    if (fullView && !fullViewDoc) closeFullView()
  }, [fullView, fullViewDoc, closeFullView])

  return (
    <FindProvider value={findState}>
      <AiActivityProvider value={aiActivity.view}>
        <div
          className={
            'app' + (drag.committing ? ' committing' : '') + (drag.dragKind ? ' dragging' : '')
          }
          onDragEnter={drag.handlers.onDragEnter}
          onDragOver={drag.handlers.onDragOver}
          onDragLeave={drag.handlers.onDragLeave}
          onDrop={drag.handlers.onDrop}
        >
          {tabBar}

          <Toolbar
            documentCount={docs.length}
            pageCount={totalPages}
            busy={busy}
            zoomStore={zoomStore}
            aiOpen={aiOpen}
            aiEnabled={aiEnabled}
            onZoomIn={() => canvasRef.current?.zoomIn()}
            onZoomOut={() => canvasRef.current?.zoomOut()}
            onZoomReset={() => canvasRef.current?.reset()}
            onOpen={openViaDialog}
            onExportPdf={requestPdfExport}
            onExportZip={exportZip}
            onToggleAi={() => setAiOpen((open) => !open)}
          />

          {find.open && (
            <FindBar
              query={find.query}
              result={find.result}
              ocrRemaining={searchIndex.ocrRemaining}
              hasScanned={searchIndex.hasScanned}
              ocrLanguage={searchIndex.ocrLanguage}
              onQuery={find.setQuery}
              onOcrLanguage={searchIndex.setOcrLanguage}
              onClose={find.closeFind}
            />
          )}

          <CollectionCanvas
            docs={docs}
            layout={layout}
            busy={busy}
            pagesDraggable={totalPages >= 2}
            renderVersion={renderVersion}
            selectedIds={selectedIds}
            hoveredDocId={hoveredDocId}
            pendingImports={pendingImports}
            hiddenPageId={fullViewState.hiddenPageId}
            marks={markState.marks}
            formValues={formState.values}
            elements={elementState.elements}
            comments={commentState.comments}
            dragKind={drag.dragKind}
            draggingPage={drag.draggingPage}
            dropTarget={drag.dropTarget}
            collapsedId={drag.collapsedId}
            liftedId={drag.liftedId}
            externalCount={drag.externalCount}
            canvasRef={canvasRef}
            initialView={initial.view}
            onScaleChange={onScaleChange}
            onSettle={onSettle}
            onBackgroundClick={collection.clearSelection}
            onOpen={openViaDialog}
            onSelectPage={collection.selectPage}
            onPageContextMenu={onPageContextMenu}
            onDocContextMenu={onDocContextMenu}
            onHoverDoc={onHoverDoc}
            onDocDragOut={startDocDragOut}
            onOpenPage={fullViewState.openPage}
            onPageDragStart={drag.startPageDrag}
            onPageDragEnd={drag.clearDrag}
            onAddPage={addPagesToDoc}
            onMoveDoc={collection.moveDoc}
            onRemoveDoc={collection.removeDoc}
            onRenameDoc={collection.renameDoc}
          />

          {fullView && fullViewDoc && (
            <FullView
              docs={docs}
              startDocId={fullView.docId}
              startPageId={fullView.pageId}
              originRect={fullView.originRect}
              marks={markState.marks}
              onToggleMark={markState.toggleMark}
              onRestoreMarks={markState.restoreMarks}
              formValues={formState.values}
              onFieldChange={formState.setFieldValue}
              elements={elementState.elements}
              onAddInk={elementState.addInk}
              onAddShape={elementState.addShape}
              onRemoveElements={elementState.removeElements}
              onAddElement={elementState.addCreated}
              onReplaceElement={elementState.replaceElement}
              onRemoveElement={elementState.removeElement}
              onMoveElement={elementState.moveElement}
              onToggleTextMark={elementState.toggleTextMark}
              onUpdateText={elementState.updateText}
              comments={commentState}
              onRotate={rotate}
              onActivePageChange={fullViewState.setHiddenPageId}
              onPrint={(pages, title) => void printPages(pages, title)}
              onClose={fullViewState.closeFullView}
            />
          )}

          {compare && (
            <CompareView
              older={compare.older}
              newer={compare.newer}
              onSwap={() => setCompare((c) => c && { older: c.newer, newer: c.older })}
              onClose={() => setCompare(null)}
            />
          )}

          <AnimatePresence>
            {aiOpen && (
              <AiChatPanel
                messages={aiChat.messages}
                busy={aiChat.busy}
                onSend={aiChat.send}
                onClose={() => setAiOpen(false)}
              />
            )}
          </AnimatePresence>

          {exportPickerOpen && (
            <ExportPicker
              docs={docs}
              onCancel={() => setExportPickerOpen(false)}
              onConfirm={(docIds) => {
                setExportPickerOpen(false)
                void exportCollection('pdf', docIds)
              }}
            />
          )}

          <NoticeBar notices={notices} />

          <StatusRibbon info={hoveredInfo} />

          {toast && <div className="toast">{toast}</div>}
        </div>
      </AiActivityProvider>
    </FindProvider>
  )
}
