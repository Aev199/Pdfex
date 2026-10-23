import { memo } from 'react'
import { BASE_PAGE_HEIGHT, DOC_SLOT } from '../../canvas/layout'
import { DocumentRow } from '../DocumentRow'
import type { DocPlacement } from '../../canvas/layout'
import type { PageRef } from '../../app/types'
import type { MarkMap } from '../../edit/types'
import type { FormValuesBySource } from '../../forms/types'
import type { ElementMap } from '../../elements/types'
import type { CommentMap } from '../../comments/types'
import type { SelectModifiers } from '../../app/useCollection'

const NO_PAGES: ReadonlySet<string> = new Set()

interface DocLayerProps {
  items: DocPlacement[]
  renderVersion: number
  selectedIds: ReadonlySet<string>
  hoveredDocId: string | null
  pagesDraggable: boolean
  collapsedId: string | null
  liftedId: string | null
  draggingPage: PageRef | null
  hiddenPageId: string | null
  marks: MarkMap
  formValues: FormValuesBySource
  elements: ElementMap
  comments: CommentMap
  intoDocId: string | null
  intoIndex: number
  intoGhostWidth: number
  intoGhostHeight: number
  betweenIndex: number
  onSelectPage: (docId: string, pageId: string, modifiers?: SelectModifiers) => void
  onPageContextMenu: (docId: string, pageId: string, x: number, y: number) => void
  onDocContextMenu: (docId: string, x: number, y: number) => void
  onHoverDoc: (docId: string | null) => void
  onOpenPage: (docId: string, pageId: string) => void
  onPageDragStart: (docId: string, pageId: string) => void
  onPageDragEnd: () => void
  onAddPage: (docId: string) => void
}

function DocLayerImpl(props: DocLayerProps): React.JSX.Element {
  const { items, intoDocId, intoIndex, intoGhostWidth, intoGhostHeight, betweenIndex } = props
  return (
    <>
      {items.map((item, index) => {
        const doc = item.doc
        const shifted = betweenIndex !== -1 && index >= betweenIndex
        return (
          <div
            key={doc.id}
            className={'canvas-doc' + (props.hoveredDocId === doc.id ? ' hovered' : '')}
            onMouseEnter={() => props.onHoverDoc(doc.id)}
            onMouseLeave={() => props.onHoverDoc(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              props.onDocContextMenu(doc.id, e.clientX, e.clientY)
            }}
            style={{
              left: item.x,
              top: item.y,
              width: item.width,
              transform: shifted ? `translateY(${DOC_SLOT}px)` : undefined
            }}
          >
            <DocumentRow
              doc={doc}
              pageHeight={BASE_PAGE_HEIGHT}
              renderVersion={props.renderVersion}
              selectedIds={
                doc.pages.some((p) => props.selectedIds.has(p.id)) ? props.selectedIds : NO_PAGES
              }
              pagesDraggable={props.pagesDraggable}
              collapseId={
                props.collapsedId && props.draggingPage?.docId === doc.id ? props.collapsedId : null
              }
              liftedId={
                props.liftedId && props.draggingPage?.docId === doc.id ? props.liftedId : null
              }
              hiddenPageId={
                props.hiddenPageId && doc.pages.some((p) => p.id === props.hiddenPageId)
                  ? props.hiddenPageId
                  : null
              }
              marks={props.marks}
              formValues={props.formValues}
              elements={props.elements}
              comments={props.comments}
              intoGhost={
                intoDocId === doc.id
                  ? { index: intoIndex, width: intoGhostWidth, height: intoGhostHeight }
                  : null
              }
              onSelectPage={props.onSelectPage}
              onPageContextMenu={props.onPageContextMenu}
              onOpenPage={props.onOpenPage}
              onPageDragStart={props.onPageDragStart}
              onPageDragEnd={props.onPageDragEnd}
              onAddPage={props.onAddPage}
            />
          </div>
        )
      })}
    </>
  )
}

export const DocLayer = memo(DocLayerImpl)
