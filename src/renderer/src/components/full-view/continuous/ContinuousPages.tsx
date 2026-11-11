import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { DocEntry } from '../../../types'
import type { MarkMap } from '../../../edit/types'
import type { ElementMap } from '../../../elements/types'
import type { FieldValue, FormValuesBySource } from '../../../forms/types'
import { PageView } from '../../PageView'
import { PageRotor, naturalSize } from '../../PageRotor'
import { MarkLayer } from '../../MarkLayer'
import { FormLayer } from '../../forms/FormLayer'
import { ElementsLayer } from '../../elements/ElementsLayer'
import { CopyTextLayer, LinkLayer } from '../ReaderLayers'
import { CommentPins, CommentPlaceLayer } from '../../comments/CommentPins'
import type { CommentLayerState } from '../annotate'
import { getSettings } from '../../../app/settings-store'
import { interpretWheel } from '../../../canvas/wheel-input'
import { clamp } from '../geometry'
import { LAYOUT_DEFAULTS, layoutContinuous, pageAtY, pagesInBand, scalePoint } from './layout'
import type { ContinuousLayout } from './layout'

export const MIN_SCROLL_ZOOM = 0.2
export const MAX_SCROLL_ZOOM = 8

// Pages this far above and below the window stay mounted.
const OVERSCAN = 900
// Pause after scrolling or zooming before pages are redrawn sharper.
const SETTLE_MS = 160
const ARROW_STEP = 60

export interface ContinuousHandle {
  goTo: (di: number, pi: number) => void
  zoomBy: (factor: number) => void
}

interface ContinuousPagesProps {
  docs: DocEntry[]
  columns: 1 | 2
  zoom: number
  onZoom: (zoom: number) => void
  vw: number
  vh: number
  current: { di: number; pi: number }
  onCurrent: (di: number, pi: number) => void
  handleRef: React.MutableRefObject<ContinuousHandle | null>
  marks: MarkMap
  elements: ElementMap
  formValues: FormValuesBySource
  onFieldChange: (sourceId: string, fieldName: string, value: FieldValue) => void
  commentLayer: CommentLayerState
  onSourcePage: (pageId: string, sourceIndex: number) => void
}

// The reader as one long scroll: pages fitted to the window's width, or two
// side by side, zoomed with Ctrl + wheel (or the wheel alone in CAD mode).
export function ContinuousPages(props: ContinuousPagesProps): React.JSX.Element {
  const { docs, columns, zoom, onZoom, vw, vh, current, onCurrent, handleRef } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const [band, setBand] = useState({ top: 0, bottom: vh })
  const [version, setVersion] = useState(0)

  const layout = useMemo(
    () => layoutContinuous(docs, { viewportW: vw, columns, zoom, ...LAYOUT_DEFAULTS }),
    [docs, vw, columns, zoom]
  )
  const layoutRef = useRef(layout)

  // Zooming keeps the point under the pointer (or the window's middle) still.
  const anchor = useRef<{
    before: ContinuousLayout
    x: number
    y: number
    cx: number
    cy: number
  } | null>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      const sc = scrollRef.current
      if (!sc) return
      const next = clamp(zoomRef.current * factor, MIN_SCROLL_ZOOM, MAX_SCROLL_ZOOM)
      if (next === zoomRef.current) return
      const box = sc.getBoundingClientRect()
      const x = cx - box.left
      const y = cy - box.top
      anchor.current = {
        before: layoutRef.current,
        x: sc.scrollLeft + x,
        y: sc.scrollTop + y,
        cx: x,
        cy: y
      }
      onZoom(next)
    },
    [onZoom]
  )

  const settle = useRef<number | null>(null)
  const scheduleSettle = useCallback(() => {
    if (settle.current) window.clearTimeout(settle.current)
    settle.current = window.setTimeout(() => setVersion((n) => n + 1), SETTLE_MS)
  }, [])

  const trackScroll = useCallback(() => {
    const sc = scrollRef.current
    if (!sc) return
    setBand({ top: sc.scrollTop - OVERSCAN, bottom: sc.scrollTop + sc.clientHeight + OVERSCAN })
    const page = pageAtY(layoutRef.current, sc.scrollTop + sc.clientHeight * 0.35)
    if (page) onCurrent(page.di, page.pi)
    scheduleSettle()
  }, [onCurrent, scheduleSettle])

  // Opened (or switched between one column and two) at the current page;
  // after a zoom, at the anchor.
  const placedFor = useRef<number | null>(null)
  const currentRef = useRef(current)
  currentRef.current = current
  useLayoutEffect(() => {
    const sc = scrollRef.current
    layoutRef.current = layout
    if (!sc) return
    const a = anchor.current
    if (a) {
      anchor.current = null
      const p = scalePoint(a.before, layout, a.x, a.y)
      sc.scrollLeft = p.x - a.cx
      sc.scrollTop = p.y - a.cy
    } else if (placedFor.current !== columns) {
      const { di, pi } = currentRef.current
      const page = layout.pages.find((p) => p.di === di && p.pi === pi)
      if (page) sc.scrollTop = page.y - LAYOUT_DEFAULTS.top
      sc.scrollLeft = (layout.width - sc.clientWidth) / 2
    }
    placedFor.current = columns
    trackScroll()
  }, [layout, columns, trackScroll])

  useEffect(() => {
    handleRef.current = {
      goTo: (di, pi) => {
        const sc = scrollRef.current
        const page = layoutRef.current.pages.find((p) => p.di === di && p.pi === pi)
        if (!sc || !page) return
        const top = page.y - LAYOUT_DEFAULTS.top
        const far = Math.abs(top - sc.scrollTop) > sc.clientHeight * 3
        sc.scrollTo({ top, behavior: far ? 'auto' : 'smooth' })
      },
      zoomBy: (factor) => {
        const sc = scrollRef.current
        if (!sc) return
        const box = sc.getBoundingClientRect()
        zoomAt(factor, box.left + box.width / 2, box.top + box.height / 2)
      }
    }
    return () => {
      handleRef.current = null
    }
  }, [handleRef, zoomAt])

  useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    const onWheel = (event: WheelEvent): void => {
      const intent = interpretWheel(event, sc.clientHeight, getSettings().wheel === 'zoom')
      if (intent.kind !== 'zoom') return
      event.preventDefault()
      zoomAt(intent.factor, event.clientX, event.clientY)
    }
    sc.addEventListener('wheel', onWheel, { passive: false })
    return () => sc.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      )
        return
      const sc = scrollRef.current
      if (!sc || event.ctrlKey || event.metaKey || event.altKey) return
      const pageStep = sc.clientHeight - 80
      const by: Record<string, number> = {
        ArrowDown: ARROW_STEP,
        ArrowUp: -ARROW_STEP,
        PageDown: pageStep,
        PageUp: -pageStep,
        ' ': event.shiftKey ? -pageStep : pageStep
      }
      if (event.key in by) {
        event.preventDefault()
        sc.scrollBy({ top: by[event.key] })
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault()
        sc.scrollBy({ left: event.key === 'ArrowRight' ? ARROW_STEP : -ARROW_STEP })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(
    () => () => {
      if (settle.current) window.clearTimeout(settle.current)
    },
    []
  )

  const visible = pagesInBand(layout, band.top, band.bottom)
  const c = props.commentLayer
  return (
    <div className="full-scroll continuous" ref={scrollRef} onScroll={trackScroll}>
      <div className="cont-world" style={{ width: layout.width, height: layout.height }}>
        {layout.labels.map((label) => (
          <div
            key={`label-${label.di}`}
            className="cont-label"
            style={{ left: label.x, top: label.y }}
          >
            {docs[label.di]?.name}
          </div>
        ))}
        {visible.map((slot) => {
          const p = docs[slot.di]?.pages[slot.pi]
          if (!p) return null
          const n = naturalSize(p)
          const threads = c.comments[p.id]
          const draft = c.draft?.pageId === p.id ? c.draft.anchor : null
          return (
            <div
              key={p.id}
              className="full-page cont"
              style={
                {
                  left: slot.x,
                  top: slot.y,
                  width: slot.w,
                  height: slot.h,
                  '--rotor-w': `${slot.w}px`,
                  '--rotor-h': `${slot.h}px`
                } as React.CSSProperties
              }
            >
              <PageRotor rotation={p.rotation}>
                <PageView
                  pdf={p.source.pdf}
                  pageNumber={p.pageIndex + 1}
                  naturalWidth={n.width}
                  naturalHeight={n.height}
                  version={version}
                />
                <CopyTextLayer
                  pdf={p.source.pdf}
                  pageNumber={p.pageIndex + 1}
                  naturalHeight={n.height}
                />
                <FormLayer
                  pdf={p.source.pdf}
                  pageNumber={p.pageIndex + 1}
                  naturalHeight={n.height}
                  values={props.formValues[p.source.id] ?? {}}
                  onChange={(field, value) => props.onFieldChange(p.source.id, field, value)}
                />
                {props.elements[p.id]?.length ? (
                  <ElementsLayer
                    elements={props.elements[p.id]}
                    naturalWidth={n.width}
                    naturalHeight={n.height}
                    interactive={false}
                    selectedId={null}
                    onSelect={() => {}}
                  />
                ) : null}
                {props.marks[p.id]?.length ? <MarkLayer marks={props.marks[p.id]} /> : null}
                <LinkLayer
                  pdf={p.source.pdf}
                  pageNumber={p.pageIndex + 1}
                  onGoToSourcePage={(index) => props.onSourcePage(p.id, index)}
                />
              </PageRotor>
              {c.pinsShown && (threads || draft) && (
                <CommentPins
                  threads={threads ?? []}
                  numbers={c.numbers}
                  rotation={p.rotation}
                  activeId={c.activeId}
                  showResolved={c.showResolved}
                  draft={draft}
                  zoomScale={1}
                  onOpen={c.onOpen}
                />
              )}
              {c.placing && (
                <CommentPlaceLayer rotation={p.rotation} onPlace={(at) => c.onPlace(p.id, at)} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
