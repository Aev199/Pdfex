import { memo } from 'react'
import type { DocEntry } from '../types'
import type { MarkMap } from '../edit/types'
import type { FormValuesBySource } from '../forms/types'
import type { ElementMap } from '../elements/types'
import type { CommentMap } from '../comments/types'
import { openCount } from '../comments/threads'
import { ADD_PAGE_WIDTH } from '../canvas/layout'
import { AddPageGhost, GhostPage } from './DropGhost'
import { PageCell } from './page-cell'
import { useFindState } from '../search/FindContext'
import type { SelectModifiers } from '../app/useCollection'

interface DocumentRowProps {
  doc: DocEntry
  pageHeight: number
  renderVersion: number
  selectedIds: ReadonlySet<string>
  pagesDraggable: boolean
  collapseId: string | null
  // The page being dragged while it still stands in its place.
  liftedId: string | null
  draggingGroup: boolean
  hiddenPageId: string | null
  marks: MarkMap
  formValues: FormValuesBySource
  elements: ElementMap
  comments: CommentMap
  intoGhost: { index: number; width: number; height: number } | null
  onSelectPage: (docId: string, pageId: string, modifiers?: SelectModifiers) => void
  onPageContextMenu: (docId: string, pageId: string, x: number, y: number) => void
  onOpenPage: (docId: string, pageId: string) => void
  onPageDragStart: (docId: string, pageId: string) => number | void
  onPageDragEnd: () => void
  onAddPage: (docId: string) => void
}

function DocumentRowImpl({
  doc,
  pageHeight,
  renderVersion,
  selectedIds,
  pagesDraggable,
  collapseId,
  liftedId,
  draggingGroup,
  hiddenPageId,
  marks,
  formValues,
  elements,
  comments,
  intoGhost,
  onSelectPage,
  onPageContextMenu,
  onOpenPage,
  onPageDragStart,
  onPageDragEnd,
  onAddPage
}: DocumentRowProps): React.JSX.Element {
  const { active, query, matchingDocIds, matchingPageIds, getOcrWords } = useFindState()
  const docDimmed = active && !matchingDocIds.has(doc.id)

  const strip: React.JSX.Element[] = []
  let visible = 0
  const emitGhost = (): void => {
    if (intoGhost && intoGhost.index === visible) {
      strip.push(
        <GhostPage key="__into_ghost" width={intoGhost.width} height={intoGhost.height} grow />
      )
    }
  }
  for (const page of doc.pages) {
    const collapsed = page.id === collapseId
    const matches = active && matchingPageIds.has(page.id)
    if (!collapsed) emitGhost()
    strip.push(
      <PageCell
        key={page.id}
        docId={doc.id}
        page={page}
        pageHeight={pageHeight}
        renderVersion={renderVersion}
        selected={selectedIds.has(page.id)}
        collapsed={collapsed}
        lifted={page.id === liftedId || (draggingGroup && selectedIds.has(page.id))}
        hidden={page.id === hiddenPageId}
        dimmed={active && !docDimmed && !matchingPageIds.has(page.id)}
        highlightQuery={matches ? query : undefined}
        ocrWords={matches ? getOcrWords(`${page.source.id}:${page.pageIndex}`) : undefined}
        marks={marks[page.id]}
        formValues={formValues[page.source.id]}
        elements={elements[page.id]}
        commentCount={openCount(comments[page.id])}
        pagesDraggable={pagesDraggable}
        visibleNumber={visible + 1}
        onSelectPage={onSelectPage}
        onPageContextMenu={onPageContextMenu}
        onOpenPage={onOpenPage}
        onPageDragStart={onPageDragStart}
        onPageDragEnd={onPageDragEnd}
      />
    )
    if (!collapsed) visible++
  }
  emitGhost()
  strip.push(
    <AddPageGhost
      key="__add_page"
      width={ADD_PAGE_WIDTH}
      height={pageHeight}
      onClick={() => onAddPage(doc.id)}
    />
  )

  return (
    <section className={docDimmed ? 'doc-row dimmed' : 'doc-row'}>
      <div className="page-strip">
        <div className="page-strip-inner">{strip}</div>
      </div>
    </section>
  )
}

export const DocumentRow = memo(DocumentRowImpl)
