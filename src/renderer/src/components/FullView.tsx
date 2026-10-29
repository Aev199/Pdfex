import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DocEntry } from '../types'
import type { MarkKind, MarkLook, MarkMap, MarkRect } from '../edit/types'
import { isMarkTool } from '../edit/types'
import type { FieldValue, FormValuesBySource } from '../forms/types'
import type {
  DrawStyle,
  ElementMap,
  ElementPoint,
  PageElement,
  ShapeKind,
  TextStyle
} from '../elements/types'
import { createTextElement, restyledTextElement } from '../elements/create'
import { createMeasureElement } from '../elements/measures'
import { createCalloutElement, restyledCallout } from '../elements/callouts'
import { CalibrateDialog } from './full-view/CalibrateDialog'
import { AnnotateBar } from './full-view/AnnotateBar'
import type { AnnotateHandlers, CommentLayerState } from './full-view/annotate'
import { CommentsPanel } from './comments/CommentsPanel'
import type { CommentState } from '../app/useComments'
import type { CommentPoint } from '../comments/types'
import { orderedThreads } from '../comments/threads'
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
import { ContinuousPages } from './full-view/continuous/ContinuousPages'
import type { ContinuousHandle } from './full-view/continuous/ContinuousPages'
import type { ReaderLayout } from './full-view/continuous/layout'
import { stepPage } from './full-view/geometry'
import { useContextMenu } from '../app/context-menu'
import type { PageEntry } from '../types'

interface FullViewProps {
  docs: DocEntry[]
  startDocId: string
  startPageId: string
  originRect: Rect | null
  marks: MarkMap
  onToggleMark: (pageId: string, kind: MarkKind, rects: MarkRect[], look?: MarkLook) => void
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
  // Add an element made from the next element number.
  onAddElement: (pageId: string, make: (number: number) => PageElement | null) => void
  // Replace an element with a changed copy, one undo step.
  onReplaceElement: (
    pageId: string,
    elementId: string,
    change: (element: PageElement) => PageElement | null
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
  comments: CommentState
  // Turn the current page (an undoable change of the document).
  onRotate: (delta: 90 | -90) => void
  onActivePageChange: (pageId: string) => void
  onPrint: (pages: PageEntry[], title: string) => void
  onClose: () => void
}

const SIDEBAR_KEY = 'pdfx.readerSidebar'
const LAYOUT_KEY = 'pdfx.readerLayout'
const readLayout = (): ReaderLayout => {
  try {
    const value = localStorage.getItem(LAYOUT_KEY)
    return value === 'scroll' || value === 'spread' ? value : 'page'
  } catch {
    return 'page'
  }
}
const COMMENTS_KEY = 'pdfx.readerComments'
const readPref = (key: string): boolean => {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}
const writePref = (key: string, on: boolean): void => {
  try {
    localStorage.setItem(key, on ? '1' : '0')
  } catch {
    // Not remembered, still toggled.
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
  onAddElement,
  onReplaceElement,
  onRemoveElement,
  onMoveElement,
  onToggleTextMark,
  onUpdateText,
  comments,
  onRotate,
  onActivePageChange,
  onPrint,
  onClose
}: FullViewProps): React.JSX.Element {
  const s = useFullViewState(docs, startDocId, startPageId, originRect)
  const edit = useEditMode(marks, onRestoreMarks)

  // Pages one at a time (the default, and always while editing or during
  // the open and close animations), or one long scroll by width or in pairs.
  const [readerLayout, setReaderLayoutState] = useState<ReaderLayout>(readLayout)
  const [scrollZoom, setScrollZoom] = useState(1)
  const setReaderLayout = useCallback((next: ReaderLayout) => {
    try {
      localStorage.setItem(LAYOUT_KEY, next)
    } catch {
      // Not remembered, still switched.
    }
    setReaderLayoutState(next)
    // A new layout starts fitted.
    setScrollZoom(1)
  }, [])
  const layout: ReaderLayout = edit.editing || s.phase !== 'open' ? 'page' : readerLayout
  const continuousRef = useRef(false)
  continuousRef.current = layout !== 'page'
  const contRef = useRef<ContinuousHandle | null>(null)
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
    layout,
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
    layout,
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
    continuousRef,
    finishEdit: edit.finishEdit,
    ...controls
  })

  const { drawStyle, textStyle, measureScale } = edit
  const [calibration, setCalibration] = useState<number | null>(null)
  const annotate = useMemo<AnnotateHandlers>(
    () => ({
      style: drawStyle,
      textStyle,
      measureScale,
      onMeasure: (pageId, mode, points, w, h) =>
        onAddElement(pageId, (n) =>
          createMeasureElement(mode, points, n, w, h, drawStyle, measureScale)
        ),
      onCalibrate: (length) => {
        if (length > 3) setCalibration(length)
      },
      onCallout: (pageId, anchor, origin, text, w, h) =>
        onAddElement(pageId, (n) => createCalloutElement(anchor, origin, text, n, w, h, textStyle)),
      onPen: (pageId, points, w, h) => onAddInk(pageId, points, w, h, drawStyle),
      onShape: (pageId, shape, from, to, w, h) =>
        onAddShape(pageId, shape, from, to, w, h, drawStyle),
      onErase: onRemoveElements
    }),
    [drawStyle, textStyle, measureScale, onAddInk, onAddShape, onRemoveElements, onAddElement]
  )

  const onAddText = useCallback(
    (pageId: string, text: string, origin: ElementPoint, w: number, h: number) =>
      onAddElement(pageId, (n) => createTextElement(text, origin, n, w, h, undefined, textStyle)),
    [onAddElement, textStyle]
  )

  // The selected element, when it is text: the text controls restyle it.
  const selectedText = useMemo(() => {
    const sel = selection.selected
    const element = sel ? elements[sel.pageId]?.find((e) => e.id === sel.elementId) : undefined
    return sel && (element?.kind === 'text' || element?.kind === 'callout')
      ? { pageId: sel.pageId, element }
      : null
  }, [selection.selected, elements])
  const pageSize = useCallback(
    (pageId: string) => {
      for (const d of docs) {
        const p = d.pages.find((page) => page.id === pageId)
        if (p) return { w: p.width, h: p.height }
      }
      return null
    },
    [docs]
  )
  const changeTextStyle = useCallback(
    (style: TextStyle) => {
      edit.setTextStyle(style)
      if (!selectedText || edit.tool !== null) return
      const size = pageSize(selectedText.pageId)
      if (!size) return
      onReplaceElement(selectedText.pageId, selectedText.element.id, (e) =>
        e.kind === 'text'
          ? restyledTextElement(e, style, size.w, size.h)
          : e.kind === 'callout'
            ? restyledCallout(e, style, size.w, size.h)
            : e
      )
    },
    [edit, selectedText, pageSize, onReplaceElement]
  )
  const shownTextStyle: TextStyle =
    selectedText && edit.tool === null
      ? {
          font: selectedText.element.font ?? 'sans',
          bold: !!selectedText.element.bold,
          fontSize: selectedText.element.fontSize,
          color: selectedText.element.color
        }
      : textStyle

  // Reader sidebar (pages / outline), remembered between openings.
  const [sidebarOpen, setSidebarOpen] = useState(() => readPref(SIDEBAR_KEY))
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((open) => {
      writePref(SIDEBAR_KEY, !open)
      return !open
    })
  }, [])
  const { goTo } = controls
  const { di, doc, pi, page } = s
  const goToPage = useCallback(
    (index: number) => {
      if (continuousRef.current) contRef.current?.goTo(di, index)
      else goTo(di, index)
    },
    [goTo, di]
  )
  // The side buttons and arrows: in the scrolling layouts, to the next page.
  const { navByKey: turnPage } = controls
  const navByKey = useCallback(
    (axis: 'x' | 'y', dir: 1 | -1) => {
      if (!continuousRef.current) return turnPage(axis, dir)
      const { di: cdi, pi: cpi } = s.curRef.current
      const next = stepPage(
        s.docsRef.current.map((d) => d.pages.length),
        cdi,
        cpi,
        dir
      )
      contRef.current?.goTo(next.di, next.pi)
    },
    [turnPage, s.curRef, s.docsRef]
  )
  const { setCurrent } = s
  const onContinuousPage = useCallback(
    (cdi: number, cpi: number) =>
      setCurrent((c) => (c.di === cdi && c.pi === cpi ? c : { di: cdi, pi: cpi })),
    [setCurrent]
  )
  useEffect(
    () =>
      window.api.onZoom((action) => {
        if (!continuousRef.current) return
        if (action === 'in') contRef.current?.zoomBy(1.25)
        else if (action === 'out') contRef.current?.zoomBy(0.8)
        else setScrollZoom(1)
      }),
    []
  )

  // Review comments: the panel on the right and the pins on the pages.
  const [commentsOpen, setCommentsOpenState] = useState(() => readPref(COMMENTS_KEY))
  const setCommentsOpen = useCallback((open: boolean) => {
    writePref(COMMENTS_KEY, open)
    setCommentsOpenState(open)
  }, [])
  const [placing, setPlacing] = useState(false)
  const [draft, setDraft] = useState<{ pageId: string; anchor: CommentPoint } | null>(null)
  const [activeComment, setActiveComment] = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false)
  const [pinsShown, setPinsShown] = useState(true)
  const commentMap = comments.comments
  // Pins are numbered through the document, page by page in reading order.
  const commentNumbers = useMemo(() => {
    const numbers = new Map<string, number>()
    for (const d of docs) {
      let n = 0
      for (const p of d.pages) {
        for (const t of orderedThreads(commentMap[p.id] ?? [])) numbers.set(t.id, ++n)
      }
    }
    return numbers
  }, [docs, commentMap])
  const openComments = doc.pages.reduce(
    (sum, p) => sum + (commentMap[p.id]?.filter((t) => !t.resolved).length ?? 0),
    0
  )
  const commentLayer = useMemo<CommentLayerState>(
    () => ({
      comments: commentMap,
      numbers: commentNumbers,
      activeId: activeComment,
      showResolved,
      pinsShown: pinsShown || placing || draft !== null,
      placing,
      draft,
      onOpen: (threadId) => {
        setCommentsOpen(true)
        setActiveComment(threadId)
      },
      onPlace: (pageId, anchor) => {
        setPlacing(false)
        setDraft({ pageId, anchor })
        setActiveComment(null)
        setCommentsOpen(true)
      }
    }),
    [
      commentMap,
      commentNumbers,
      activeComment,
      showResolved,
      pinsShown,
      placing,
      draft,
      setCommentsOpen
    ]
  )
  const toggleComments = useCallback(() => {
    if (commentsOpen) {
      setPlacing(false)
      setDraft(null)
    }
    setCommentsOpen(!commentsOpen)
  }, [commentsOpen, setCommentsOpen])
  // Esc first gives up placing or writing a new comment, then closes as usual.
  useEffect(() => {
    if (!placing) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      setPlacing(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [placing])

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
      } else if (event.key === 'F6') {
        event.preventDefault()
        toggleComments()
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
  }, [toggleSidebar, toggleComments, goToPage, doc.pages.length, edit.editing])

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
    <div className={`full-view${layout === 'page' ? '' : ' scrolling'}`}>
      <div className="full-backdrop" style={{ opacity: chromeOpacity }} />
      {layout === 'page' ? (
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
            if (isMarkTool(edit.tool)) {
              onToggleMark(
                pageId,
                edit.tool,
                rects,
                edit.tool === 'highlight' ? edit.markLook : undefined
              )
            }
          }}
          formValues={formValues}
          onFieldChange={onFieldChange}
          elements={elements}
          selectedElementId={selection.selected?.elementId ?? null}
          onSelectElement={selection.selectElement}
          onMoveElement={onMoveElement}
          onDraw={onAddInk}
          annotate={annotate}
          commentLayer={commentLayer}
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
      ) : (
        <ContinuousPages
          docs={docs}
          columns={layout === 'spread' ? 2 : 1}
          zoom={scrollZoom}
          onZoom={setScrollZoom}
          vw={s.vw}
          vh={s.vh}
          current={{ di: s.di, pi: s.pi }}
          onCurrent={onContinuousPage}
          handleRef={contRef}
          marks={marks}
          elements={elements}
          formValues={formValues}
          onFieldChange={onFieldChange}
          commentLayer={commentLayer}
          onSourcePage={followLink}
        />
      )}
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
        annotateBar={
          <AnnotateBar
            tool={edit.tool}
            style={edit.drawStyle}
            onTool={edit.toggleTool}
            onStyle={edit.setDrawStyle}
            textStyle={shownTextStyle}
            onTextStyle={changeTextStyle}
            markLook={edit.markLook}
            onMarkLook={edit.setMarkLook}
            textSelected={!!selectedText}
            measureScale={edit.measureScale}
            onMeasureScale={edit.setMeasureScale}
          />
        }
        runClose={controls.runClose}
        navByKey={navByKey}
        layout={readerLayout}
        layoutLocked={edit.editing}
        onLayout={setReaderLayout}
        goToPage={goToPage}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        onPrint={print}
        editBlocked={editBlocked}
        onRotate={onRotate}
        commentsOpen={commentsOpen}
        commentCount={openComments}
        onToggleComments={toggleComments}
      />
      {sidebarOpen && !animating && <FullViewSidebar doc={doc} current={pi} onGo={goToPage} />}
      {commentsOpen && !animating && (
        <CommentsPanel
          doc={doc}
          comments={commentMap}
          numbers={commentNumbers}
          activeId={activeComment}
          draftPage={draft ? doc.pages.findIndex((p) => p.id === draft.pageId) : null}
          placing={placing}
          showResolved={showResolved}
          pinsShown={pinsShown}
          onNew={() => {
            setDraft(null)
            setPlacing(!placing)
          }}
          onPost={(text) => {
            if (!draft) return
            setActiveComment(comments.addThread(draft.pageId, draft.anchor, text))
            setDraft(null)
          }}
          onCancelDraft={() => setDraft(null)}
          onSelect={(index, threadId) => {
            setActiveComment(threadId)
            if (index !== pi) goToPage(index)
          }}
          onReply={comments.reply}
          onEdit={comments.editText}
          onRemove={(pageId, threadId, replyId) => {
            comments.remove(pageId, threadId, replyId)
            if (replyId === null && threadId === activeComment) setActiveComment(null)
          }}
          onResolve={(pageId, threadId, resolved) => {
            comments.resolve(pageId, threadId, resolved)
            if (resolved && !showResolved) setActiveComment(null)
          }}
          onShowResolved={setShowResolved}
          onPinsShown={setPinsShown}
          onClose={toggleComments}
        />
      )}
      {edit.editing && isMarkTool(edit.tool) && <ToolCursor tool={edit.tool} />}
      {calibration !== null && (
        <CalibrateDialog
          lengthPoints={calibration}
          unit={edit.measureScale.unit}
          onCancel={() => setCalibration(null)}
          onConfirm={(scale) => {
            edit.setMeasureScale(scale)
            setCalibration(null)
            edit.toggleTool('distance')
          }}
        />
      )}
    </div>
  )
}
