import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DocEntry } from '../types'
import type { MarkKind, MarkMap, MarkRect } from '../edit/types'
import { isMarkTool } from '../edit/types'
import type { FieldValue, FormValuesBySource } from '../forms/types'
import type { DrawStyle, ElementMap, ElementPoint, ShapeKind } from '../elements/types'
import type { AnnotateHandlers } from './full-view/annotate'
import type { TextSpan } from '../elements/text-marks'
import type { Rect } from './full-view/geometry'
import { useElementSelection } from './full-view/use-element-selection'
import { useFullViewState } from './full-view/use-full-view-state'
import { useFullViewControls } from './full-view/use-full-view-controls'
import { useFullViewLayout } from './full-view/use-full-view-layout'
import { useFullViewEffects } from './full-view/use-full-view-effects'
import { useFullViewInput } from './full-view/use-full-view-input'
import { useEditMode } from './full-view/edit/use-edit-mode'
import { ToolCursor } from './full-view/edit/ToolCursor'
import { FullViewChrome } from './full-view/FullViewChrome'
import { FullViewPages } from './full-view/FullViewPages'
import { FullViewSidebar } from './full-view/FullViewSidebar'
import { useContextMenu } from '../app/context-menu'
import type { PageEntry } from '../types'

interface FullViewProps {
  docs: DocEntry[]
  startDocId: string
  startPageId: string
  originRect: Rect | null
  marks: MarkMap
  onToggleMark: (pageId: string, kind: MarkKind, rects: MarkRect[]) => void
  onRestoreMarks: (map: MarkMap) => void
  formValues: FormValuesBySource
  onFieldChange: (sourceId: string, fieldName: string, value: FieldValue) => void
  elements: ElementMap
  onAddInk: (
    pageId: string,
    points: ElementPoint[],
    pageWidth: number,
    pageHeight: number,
    style?: DrawStyle
  ) => void
  onAddShape: (
    pageId: string,
    shape: ShapeKind,
    from: ElementPoint,
    to: ElementPoint,
    pageWidth: number,
    pageHeight: number,
    style: DrawStyle
  ) => void
  onRemoveElements: (pageId: string, ids: string[]) => void
  onAddText: (
    pageId: string,
    text: string,
    origin: ElementPoint,
    pageWidth: number,
    pageHeight: number
  ) => void
  onRemoveElement: (pageId: string, elementId: string) => void
  onMoveElement: (pageId: string, elementId: string, dx: number, dy: number) => void
  onToggleTextMark: (pageId: string, elementId: string, kind: MarkKind, span: TextSpan) => void
  onUpdateText: (
    pageId: string,
    elementId: string,
    text: string,
    pageWidth: number,
    pageHeight: number
  ) => void
  onActivePageChange: (pageId: string) => void
  onPrint: (pages: PageEntry[], title: string) => void
  onClose: () => void
}

const SIDEBAR_KEY = 'pdfx.readerSidebar'
const readSidebarPref = (): boolean => {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}

export function FullView({
  docs,
  startDocId,
  startPageId,
  originRect,
  marks,
  onToggleMark,
  onRestoreMarks,
  formValues,
  onFieldChange,
  elements,
  onAddInk,
  onAddShape,
  onRemoveElements,
  onAddText,
  onRemoveElement,
  onMoveElement,
  onToggleTextMark,
  onUpdateText,
  onActivePageChange,
  onPrint,
  onClose
}: FullViewProps): React.JSX.Element {
  const s = useFullViewState(docs, startDocId, startPageId, originRect)
  const edit = useEditMode(marks, onRestoreMarks)
  const selection = useElementSelection(edit.editing && isMarkTool(edit.tool), onRemoveElement)

  useEffect(() => {
    if (!edit.editing || !edit.tool) return
    const active = document.activeElement
    if (
      active instanceof HTMLElement &&
      (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')
    ) {
      active.blur()
    }
  }, [edit.editing, edit.tool])

  const controls = useFullViewControls({
    scrollRef: s.scrollRef,
    closingRef: s.closingRef,
    editingRef: edit.editingRef,
    docsRef: s.docsRef,
    vpRef: s.vpRef,
    curRef: s.curRef,
    phaseRef: s.phaseRef,
    setView: s.setView,
    setPhase: s.setPhase,
    setFlip: s.setFlip,
    setFlipTransition: s.setFlipTransition,
    setRevealed: s.setRevealed,
    onClose
  })

  const { resetView } = controls
  useEffect(() => {
    if (!edit.editing) resetView()
  }, [edit.editing, resetView])

  useFullViewLayout({
    scrollRef: s.scrollRef,
    curRef: s.curRef,
    originRect,
    vw: s.vw,
    vh: s.vh,
    setPhase: s.setPhase,
    setFlip: s.setFlip,
    setFlipTransition: s.setFlipTransition,
    setRevealed: s.setRevealed
  })
  useFullViewEffects({
    scrollRef: s.scrollRef,
    scrollRaf: s.scrollRaf,
    docsRef: s.docsRef,
    vpRef: s.vpRef,
    pageId: s.page.id,
    onActivePageChange,
    vw: s.vw,
    vh: s.vh,
    fit: s.fit,
    view: s.view,
    curDi: s.current.di,
    curPi: s.current.pi,
    setViewport: s.setViewport,
    setView: s.setView,
    setCurrent: s.setCurrent,
    setRenderVersion: s.setRenderVersion
  })
  useFullViewInput({
    scrollRef: s.scrollRef,
    zoomedRef: s.zoomedRef,
    viewRef: s.viewRef,
    phaseRef: s.phaseRef,
    editingRef: edit.editingRef,
    finishEdit: edit.finishEdit,
    ...controls
  })

  const { drawStyle } = edit
  const annotate = useMemo<AnnotateHandlers>(
    () => ({
      style: drawStyle,
      onPen: (pageId, points, w, h) => onAddInk(pageId, points, w, h, drawStyle),
      onShape: (pageId, shape, from, to, w, h) =>
        onAddShape(pageId, shape, from, to, w, h, drawStyle),
      onErase: onRemoveElements
    }),
    [drawStyle, onAddInk, onAddShape, onRemoveElements]
  )

  // Reader sidebar (pages / outline), remembered between openings.
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarPref)
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((open) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, open ? '0' : '1')
      } catch {
        // Not remembered, still toggled.
      }
      return !open
    })
  }, [])
  const { goTo } = controls
  const { di, doc, pi, page } = s
  const goToPage = useCallback((index: number) => goTo(di, index), [goTo, di])

  // An internal link: the page of the same file, if this document has it.
  const followLink = useCallback(
    (pageId: string, sourceIndex: number) => {
      const from = doc.pages.find((p) => p.id === pageId)
      const target = doc.pages.findIndex(
        (p) => p.source === from?.source && p.pageIndex === sourceIndex
      )
      if (target !== -1) goToPage(target)
    },
    [doc, goToPage]
  )

  const openMenu = useContextMenu()
  const print = useCallback(() => {
    openMenu(window.innerWidth - 260, 60, [
      {
        label: `Print "${doc.name}" (${doc.pages.length} pages)…`,
        onClick: () => onPrint(doc.pages, doc.name)
      },
      { label: `Print page ${pi + 1}…`, onClick: () => onPrint([page], `${doc.name} p${pi + 1}`) }
    ])
  }, [openMenu, doc, pi, page, onPrint])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      )
        return
      if (event.key === 'F4') {
        event.preventDefault()
        toggleSidebar()
      } else if (event.key === 'Home' && !edit.editing) {
        event.preventDefault()
        goToPage(0)
      } else if (event.key === 'End' && !edit.editing) {
        event.preventDefault()
        goToPage(doc.pages.length - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleSidebar, goToPage, doc.pages.length, edit.editing])

  useEffect(
    () =>
      window.api.onMenu((action) => {
        if (action === 'print') print()
      }),
    [print]
  )

  // Drawing tools work in the page's own orientation; a page turned with
  // Rotate is turned back before editing.
  const editBlocked = page.rotation ? 'Turn this page back (Rotate) to edit it' : null
  const { finishEdit, editing } = edit
  useEffect(() => {
    if (editing && page.rotation) finishEdit()
  }, [editing, page.rotation, finishEdit])

  const animating = s.phase !== 'open'
  const chromeOpacity = s.revealed ? 1 : 0

  return (
    <div className="full-view">
      <div className="full-backdrop" style={{ opacity: chromeOpacity }} />
      <FullViewPages
        scrollRef={s.scrollRef}
        drag={s.drag}
        draggedRef={s.draggedRef}
        docs={docs}
        viewport={s.viewport}
        di={s.di}
        pi={s.pi}
        view={s.view}
        fit={s.fit}
        vw={s.vw}
        vh={s.vh}
        zoomed={s.zoomed}
        interactive={s.interactive}
        animating={animating}
        flip={s.flip}
        flipTransition={s.flipTransition}
        renderVersion={s.renderVersion}
        marks={marks}
        hasSelection={selection.selected !== null}
        selectTool={edit.editing ? edit.tool : null}
        onMark={(pageId, rects) => {
          if (isMarkTool(edit.tool)) onToggleMark(pageId, edit.tool, rects)
        }}
        formValues={formValues}
        onFieldChange={onFieldChange}
        elements={elements}
        selectedElementId={selection.selected?.elementId ?? null}
        onSelectElement={selection.selectElement}
        onMoveElement={onMoveElement}
        onDraw={onAddInk}
        annotate={annotate}
        onSourcePage={followLink}
        onAddText={onAddText}
        onMarkText={(pageId, elementId, span) => {
          if (isMarkTool(edit.tool)) onToggleTextMark(pageId, elementId, edit.tool, span)
        }}
        onUpdateText={onUpdateText}
        setView={s.setView}
        resetView={controls.resetView}
        applyZoom={controls.applyZoom}
        runClose={controls.runClose}
      />
      {edit.editing && <div className="edit-glow" />}
      <FullViewChrome
        chromeOpacity={chromeOpacity}
        docName={s.doc.name}
        pi={s.pi}
        pageCount={s.doc.pages.length}
        editing={edit.editing}
        tool={edit.tool}
        canRevert={edit.canRevert}
        onEnterEdit={edit.enterEdit}
        onFinishEdit={edit.finishEdit}
        onRevert={edit.revert}
        onToggleTool={edit.toggleTool}
        drawStyle={edit.drawStyle}
        onDrawStyle={edit.setDrawStyle}
        runClose={controls.runClose}
        navByKey={controls.navByKey}
        goToPage={goToPage}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        onPrint={print}
        editBlocked={editBlocked}
      />
      {sidebarOpen && !animating && <FullViewSidebar doc={doc} current={pi} onGo={goToPage} />}
      {edit.editing && isMarkTool(edit.tool) && <ToolCursor tool={edit.tool} />}
    </div>
  )
}
