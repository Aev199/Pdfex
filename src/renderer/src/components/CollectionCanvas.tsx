import { BASE_PAGE_HEIGHT, DOC_SLOT, MIN_DOC_WIDTH, betweenSlotY } from '../canvas/layout'
import { SkeletonRow, skeletonRowWidth } from './SkeletonRow'
import { Canvas } from './Canvas'
import { EmptyState } from './EmptyState'
import { AddDocGhost, GhostRow } from './DropGhost'
import { DocLayer } from './collection/DocLayer'
import { HeaderLayer } from './collection/HeaderLayer'
import { deriveDropGhosts } from './collection/ghost-size'
import type { CanvasHandle } from './Canvas'
import type { CanvasLayout, DropTarget } from '../canvas/layout'
import type { PageRef, PendingImport } from '../app/types'
import type { DocEntry } from '../types'
import type { MarkMap } from '../edit/types'
import type { FormValuesBySource } from '../forms/types'
import type { ElementMap } from '../elements/types'
import type { CanvasView } from '../app/workspaces'
import type { SelectModifiers } from '../app/useCollection'

interface CollectionCanvasProps {
  docs: DocEntry[]
  layout: CanvasLayout
  busy: boolean
  pagesDraggable: boolean
  renderVersion: number
  selectedIds: ReadonlySet<string>
  hoveredDocId: string | null
  hiddenPageId: string | null
  marks: MarkMap
  formValues: FormValuesBySource
  elements: ElementMap
  dragKind: 'internal' | 'external' | null
  draggingPage: PageRef | null
  dropTarget: DropTarget | null
  collapsedId: string | null
  liftedId: string | null
  externalCount: number
  pendingImports: PendingImport[]
  canvasRef: React.Ref<CanvasHandle>
  initialView?: CanvasView | null
  onScaleChange: (scale: number) => void
  onSettle: () => void
  onBackgroundClick: () => void
  onOpen: () => void
  onSelectPage: (docId: string, pageId: string, modifiers?: SelectModifiers) => void
  onPageContextMenu: (docId: string, pageId: string, x: number, y: number) => void
  onDocContextMenu: (docId: string, x: number, y: number) => void
  onHoverDoc: (docId: string | null) => void
  onDocDragOut: (docId: string) => void
  onOpenPage: (docId: string, pageId: string) => void
  onPageDragStart: (docId: string, pageId: string) => void
  onPageDragEnd: () => void
  onAddPage: (docId: string) => void
  onMoveDoc: (docId: string, direction: -1 | 1) => void
  onRemoveDoc: (docId: string) => void
  onRenameDoc: (docId: string, name: string) => void
}

export function CollectionCanvas(props: CollectionCanvasProps): React.JSX.Element {
  const { docs, layout, dragKind, draggingPage, dropTarget, externalCount, pendingImports } = props

  const { intoDocId, intoIndex, betweenIndex, ghostSize, betweenPages } = deriveDropGhosts(
    docs,
    draggingPage,
    dropTarget,
    dragKind,
    externalCount
  )

  if (docs.length === 0 && pendingImports.length === 0) {
    return (
      <>
        <EmptyState busy={props.busy} dragging={dragKind === 'external'} onOpen={props.onOpen} />
        {dragKind === 'external' && (
          <div className="empty-drop-stage">
            <GhostRow width={MIN_DOC_WIDTH} pageHeight={BASE_PAGE_HEIGHT} pages={betweenPages} />
          </div>
        )}
      </>
    )
  }

  // Placeholder rows sit where the incoming documents will land, after the
  // last real one; the add-document slot moves below them.
  const skeletonBaseY = betweenSlotY(layout, layout.items.length)

  return (
    <Canvas
      ref={props.canvasRef}
      initialView={props.initialView}
      contentWidth={layout.contentWidth}
      contentHeight={layout.contentHeight}
      slotHeight={layout.slotHeight}
      dragging={dragKind !== null}
      onScaleChange={props.onScaleChange}
      onSettle={props.onSettle}
      onBackgroundClick={props.onBackgroundClick}
      overlay={
        <HeaderLayer
          items={layout.items}
          betweenIndex={betweenIndex}
          onMove={props.onMoveDoc}
          onRemove={props.onRemoveDoc}
          onRename={props.onRenameDoc}
          onContextMenu={props.onDocContextMenu}
          onHoverDoc={props.onHoverDoc}
          onDragOut={props.onDocDragOut}
        />
      }
    >
      <DocLayer
        items={layout.items}
        renderVersion={props.renderVersion}
        selectedIds={props.selectedIds}
        hoveredDocId={props.hoveredDocId}
        pagesDraggable={props.pagesDraggable}
        collapsedId={props.collapsedId}
        liftedId={props.liftedId}
        draggingPage={draggingPage}
        hiddenPageId={props.hiddenPageId}
        marks={props.marks}
        formValues={props.formValues}
        elements={props.elements}
        intoDocId={intoDocId}
        intoIndex={intoIndex}
        intoGhostWidth={ghostSize.width}
        intoGhostHeight={ghostSize.height}
        betweenIndex={betweenIndex}
        onSelectPage={props.onSelectPage}
        onPageContextMenu={props.onPageContextMenu}
        onDocContextMenu={props.onDocContextMenu}
        onHoverDoc={props.onHoverDoc}
        onOpenPage={props.onOpenPage}
        onPageDragStart={props.onPageDragStart}
        onPageDragEnd={props.onPageDragEnd}
        onAddPage={props.onAddPage}
      />
      {dropTarget?.kind === 'between' && (
        <div
          className="canvas-doc ghost-doc"
          style={{ left: 0, top: betweenSlotY(layout, dropTarget.docIndex), width: MIN_DOC_WIDTH }}
        >
          <GhostRow width={MIN_DOC_WIDTH} pageHeight={BASE_PAGE_HEIGHT} pages={betweenPages} />
        </div>
      )}
      {pendingImports.map((pending, i) => (
        <div
          key={pending.id}
          className="canvas-doc"
          style={{ left: 0, top: skeletonBaseY + i * DOC_SLOT, width: skeletonRowWidth(pending) }}
        >
          <SkeletonRow pending={pending} />
        </div>
      ))}
      <div
        className="canvas-doc"
        style={{
          left: 0,
          top: skeletonBaseY + pendingImports.length * DOC_SLOT,
          width: MIN_DOC_WIDTH
        }}
      >
        <AddDocGhost width={MIN_DOC_WIDTH} onClick={props.onOpen} />
      </div>
    </Canvas>
  )
}
