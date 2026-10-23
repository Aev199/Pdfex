import type { PageEntry } from '../../types'
import { PageView } from '../PageView'
import { useFindState } from '../../search/FindContext'
import { useAiActivePages, useAiFlashPages } from '../../ai/activity/context'
import type { View } from './geometry'
import { DOUBLE_CLICK_ZOOM, fitInto, TRANSITION_MS } from './geometry'
import type { EditTool, Mark, MarkRect } from '../../edit/types'
import { isElementTool, isMarkTool } from '../../edit/types'
import type { FieldValue, FormValues } from '../../forms/types'
import type { ElementPoint, PageElement } from '../../elements/types'
import type { TextSpan } from '../../elements/text-marks'
import { fieldRectsForDrag } from '../../edit/field-targets'
import { MarkLayer } from '../MarkLayer'
import { FormLayer } from '../forms/FormLayer'
import { ElementsLayer } from '../elements/ElementsLayer'
import { DrawLayer } from '../elements/DrawLayer'
import { TypeLayer } from '../elements/TypeLayer'
import { SelectableTextLayer } from './edit/SelectableTextLayer'
import { PageRotor, naturalSize } from '../PageRotor'
import { CopyTextLayer, LinkLayer } from './ReaderLayers'
import { ShapeLayer } from '../elements/ShapeLayer'
import { EraseLayer } from '../elements/EraseLayer'
import { isShapeTool } from '../../edit/types'
import type { AnnotateHandlers } from './annotate'

interface FullViewPageProps {
  page: PageEntry
  viewport: { w: number; h: number }
  isCurrent: boolean
  view: View
  zoomed: boolean
  interactive: boolean
  animating: boolean
  flip: string | null
  flipTransition: boolean
  renderVersion: number
  marks: Mark[] | undefined
  selectTool: EditTool | null
  onMark: (rects: MarkRect[]) => void
  formValues: FormValues
  onField: (fieldName: string, value: FieldValue) => void
  elements: PageElement[] | undefined
  selectedElementId: string | null
  onSelectElement: (id: string | null) => void
  onMoveElement: (id: string, dx: number, dy: number) => void
  onDraw: (points: ElementPoint[]) => void
  annotate: AnnotateHandlers
  // Follow a link to a page of the same file (its index in that file).
  onSourcePage: (sourceIndex: number) => void
  onAddText: (text: string, origin: ElementPoint) => void
  onMarkText: (id: string, span: TextSpan) => void
  onUpdateText: (id: string, text: string) => void
  resetView: () => void
  applyZoom: (nextZoom: (z: number) => number, focal?: { x: number; y: number }) => void
}

export function FullViewPage(props: FullViewPageProps): React.JSX.Element {
  const { page: p, viewport, isCurrent, view, zoomed, interactive, animating } = props
  const { flip, flipTransition, renderVersion, resetView, applyZoom } = props
  const { marks, selectTool, onMark, formValues, onField } = props
  const { elements, selectedElementId, onSelectElement, onMoveElement, onDraw } = props
  const { onAddText, onMarkText, onUpdateText } = props

  const { active, query, matchingPageIds, getOcrWords } = useFindState()
  const highlight = active && isCurrent && matchingPageIds.has(p.id)
  const aiActive = useAiActivePages().has(p.id)
  const aiFlash = useAiFlashPages().has(p.id)

  const size = fitInto(p.width, p.height, viewport)
  const n = naturalSize(p)
  let style: React.CSSProperties = {
    width: size.w,
    height: size.h,
    ['--rotor-w' as string]: `${size.w}px`,
    ['--rotor-h' as string]: `${size.h}px`
  }
  if (isCurrent && animating) {
    style = {
      ...style,
      transform: flip ?? 'none',
      transformOrigin: 'top left',
      transition: flipTransition
        ? `transform ${TRANSITION_MS - 20}ms cubic-bezier(0.2, 0, 0, 1)`
        : 'none',
      willChange: 'transform'
    }
  } else if (isCurrent && (zoomed || view.y !== 0)) {
    style = {
      ...style,
      transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
      transformOrigin: 'center center'
    }
  }
  return (
    <div className="full-slide">
      <div
        className="full-page"
        style={style}
        onDoubleClick={
          isCurrent && interactive
            ? (e) =>
                zoomed
                  ? resetView()
                  : applyZoom(() => DOUBLE_CLICK_ZOOM, { x: e.clientX, y: e.clientY })
            : undefined
        }
      >
        <PageRotor rotation={p.rotation}>
          <PageView
            pdf={p.source.pdf}
            pageNumber={p.pageIndex + 1}
            naturalWidth={n.width}
            naturalHeight={n.height}
            version={isCurrent ? renderVersion : 0}
            eager={isCurrent}
            highlightQuery={highlight ? query : undefined}
            ocrWords={highlight ? getOcrWords(`${p.source.id}:${p.pageIndex}`) : undefined}
          />
          {isCurrent && interactive && selectTool === null && (
            <CopyTextLayer
              pdf={p.source.pdf}
              pageNumber={p.pageIndex + 1}
              naturalHeight={n.height}
            />
          )}
          <FormLayer
            pdf={p.source.pdf}
            pageNumber={p.pageIndex + 1}
            naturalHeight={n.height}
            values={formValues}
            selectTool={isCurrent && isMarkTool(selectTool) ? selectTool : null}
            onChange={onField}
          />
          {elements && elements.length > 0 && (
            <ElementsLayer
              elements={elements}
              naturalWidth={n.width}
              naturalHeight={n.height}
              interactive={
                isCurrent &&
                (selectTool === null || (isElementTool(selectTool) && selectTool !== 'eraser'))
              }
              aboveDraw={isCurrent && selectTool !== null}
              zoomScale={isCurrent && zoomed ? view.zoom : 1}
              selectedId={selectedElementId}
              markTool={isCurrent && isMarkTool(selectTool) ? selectTool : null}
              onSelect={onSelectElement}
              onMove={onMoveElement}
              onMarkText={onMarkText}
              onUpdateText={onUpdateText}
            />
          )}
          {marks && marks.length > 0 && <MarkLayer marks={marks} />}
          {isCurrent && interactive && selectTool === null && (
            <LinkLayer
              pdf={p.source.pdf}
              pageNumber={p.pageIndex + 1}
              onGoToSourcePage={props.onSourcePage}
            />
          )}
          {aiActive && <div className="ai-glow" />}
          {aiFlash && <div className="ai-flash" />}
          {isCurrent && isMarkTool(selectTool) && (
            <SelectableTextLayer
              pdf={p.source.pdf}
              pageNumber={p.pageIndex + 1}
              naturalHeight={n.height}
              tool={selectTool}
              onSelect={(rects, drag) => {
                if (rects.length > 0) {
                  onMark(rects)
                } else if (drag) {
                  void fieldRectsForDrag(p.source.pdf, p.pageIndex + 1, drag).then((fieldRects) => {
                    if (fieldRects.length > 0) onMark(fieldRects)
                  })
                }
              }}
            />
          )}
          {isCurrent && selectTool === 'draw' && (
            <DrawLayer naturalWidth={n.width} naturalHeight={n.height} onCommit={onDraw} />
          )}
          {isCurrent && selectTool === 'pen' && (
            <DrawLayer
              naturalWidth={n.width}
              naturalHeight={n.height}
              style={props.annotate.style}
              onCommit={(points) => props.annotate.onPen(p.id, points, p.width, p.height)}
            />
          )}
          {isCurrent && isShapeTool(selectTool) && (
            <ShapeLayer
              shape={selectTool}
              style={props.annotate.style}
              naturalWidth={n.width}
              naturalHeight={n.height}
              onCommit={(from, to) =>
                props.annotate.onShape(p.id, selectTool, from, to, p.width, p.height)
              }
            />
          )}
          {isCurrent && selectTool === 'eraser' && (
            <EraseLayer
              elements={elements ?? []}
              naturalWidth={n.width}
              naturalHeight={n.height}
              onErase={(ids) => props.annotate.onErase(p.id, ids)}
            />
          )}
          {isCurrent && selectTool === 'text' && (
            <TypeLayer naturalHeight={n.height} onCommit={onAddText} />
          )}
        </PageRotor>
      </div>
    </div>
  )
}
