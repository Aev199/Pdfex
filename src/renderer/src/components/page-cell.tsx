import { memo } from 'react'
import { useAiActivePages, useAiFlashPages } from '../ai/activity/context'
import type { PageEntry } from '../types'
import type { OcrWord } from '../ocr/types'
import type { Mark } from '../edit/types'
import { hasAnyValue } from '../forms/types'
import type { PageElement } from '../elements/types'
import type { FormValues } from '../forms/types'
import { pageDisplayWidth } from '../canvas/layout'
import { PageView } from './PageView'
import { MarkLayer } from './MarkLayer'
import { ElementsLayer } from './elements/ElementsLayer'
import { CommentIcon } from './icons'
import { FormLayer } from './forms/FormLayer'
import { buildPageDragImage } from './page-drag-image'
import { PageRotor, naturalSize } from './PageRotor'
import type { SelectModifiers } from '../app/useCollection'

interface PageCellProps {
  docId: string
  page: PageEntry
  pageHeight: number
  renderVersion: number
  selected: boolean
  collapsed: boolean
  lifted?: boolean
  hidden: boolean
  dimmed: boolean
  highlightQuery: string | undefined
  ocrWords: OcrWord[] | undefined
  marks: Mark[] | undefined
  formValues: FormValues | undefined
  elements: PageElement[] | undefined
  // Open review comments on the page.
  commentCount: number
  pagesDraggable: boolean
  visibleNumber: number
  onSelectPage: (docId: string, pageId: string, modifiers?: SelectModifiers) => void
  onPageContextMenu: (docId: string, pageId: string, x: number, y: number) => void
  onOpenPage: (docId: string, pageId: string) => void
  onPageDragStart: (docId: string, pageId: string) => void
  onPageDragEnd: () => void
}

function PageCellImpl({
  docId,
  page,
  pageHeight,
  renderVersion,
  selected,
  collapsed,
  lifted,
  hidden,
  dimmed,
  highlightQuery,
  ocrWords,
  marks,
  formValues,
  elements,
  commentCount,
  pagesDraggable,
  visibleNumber,
  onSelectPage,
  onPageContextMenu,
  onOpenPage,
  onPageDragStart,
  onPageDragEnd
}: PageCellProps): React.JSX.Element {
  const aiActive = useAiActivePages().has(page.id)
  const aiFlash = useAiFlashPages().has(page.id)
  const natural = naturalSize(page)
  const displayWidth = pageDisplayWidth(page.width, page.height)
  return (
    <div
      data-page-id={page.id}
      className={
        'page' +
        (selected ? ' selected' : '') +
        (collapsed ? ' collapsing' : '') +
        (lifted ? ' lifted' : '') +
        (dimmed ? ' dimmed' : '') +
        (aiActive ? ' ai-active' : '')
      }
      style={
        collapsed
          ? {
              width: 0,
              height: pageHeight,
              position: 'absolute',
              opacity: 0,
              pointerEvents: 'none'
            }
          : ({
              width: displayWidth,
              height: pageHeight,
              visibility: hidden ? 'hidden' : undefined,
              '--rotor-w': `${displayWidth}px`,
              '--rotor-h': `${pageHeight}px`
            } as React.CSSProperties)
      }
      draggable={pagesDraggable}
      onClick={(e) => {
        e.stopPropagation()
        onSelectPage(docId, page.id, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey })
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onPageContextMenu(docId, page.id, e.clientX, e.clientY)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onOpenPage(docId, page.id)
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-pdfx-page', page.id)
        e.dataTransfer.effectAllowed = 'copyMove'
        const el = e.currentTarget as HTMLElement
        const rect = el.getBoundingClientRect()
        const img = buildPageDragImage(el, rect)
        e.dataTransfer.setDragImage(img, e.clientX - rect.left, e.clientY - rect.top)
        window.setTimeout(() => img.remove(), 0)
        onPageDragStart(docId, page.id)
      }}
      onDragEnd={onPageDragEnd}
    >
      <PageRotor rotation={page.rotation}>
        <PageView
          pdf={page.source.pdf}
          pageNumber={page.pageIndex + 1}
          naturalWidth={natural.width}
          naturalHeight={natural.height}
          version={renderVersion}
          highlightQuery={highlightQuery}
          ocrWords={ocrWords}
        />
        {hasAnyValue(formValues) && (
          <FormLayer
            pdf={page.source.pdf}
            pageNumber={page.pageIndex + 1}
            naturalHeight={natural.height}
            values={formValues!}
            readOnly
          />
        )}
        {elements && elements.length > 0 && (
          <ElementsLayer
            elements={elements}
            naturalWidth={natural.width}
            naturalHeight={natural.height}
            interactive={false}
            selectedId={null}
            onSelect={() => {}}
          />
        )}
        {marks && marks.length > 0 && <MarkLayer marks={marks} />}
      </PageRotor>
      {aiActive && <div className="ai-glow" />}
      {aiFlash && <div className="ai-flash" />}
      <span className="page-number">{visibleNumber}</span>
      {commentCount > 0 && (
        <span
          className="page-comments"
          title={`${commentCount} open comment${commentCount === 1 ? '' : 's'}`}
        >
          <CommentIcon size={11} />
          {commentCount}
        </span>
      )}
    </div>
  )
}

export const PageCell = memo(PageCellImpl)
