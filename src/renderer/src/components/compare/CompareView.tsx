import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PageEntry } from '../../types'
import { diffImage, revision } from '../../compare/diff'
import type { DiffStats, Revision } from '../../compare/diff'
import { pixels, renderSheets } from '../../compare/render'
import type { Sheets } from '../../compare/render'
import { CloseIcon } from '../icons'

export interface ComparePage {
  page: PageEntry
  label: string
}

interface CompareViewProps {
  older: ComparePage
  newer: ComparePage
  onSwap: () => void
  onClose: () => void
}

type Mode = 'overlay' | 'older' | 'newer'

interface Prepared {
  sheets: Sheets
  older: Revision
  newer: Revision
}

interface Camera {
  k: number
  x: number
  y: number
}

const MIN_ZOOM = 0.05
const MAX_ZOOM = 16

// Two revisions of a sheet over each other: removed lines red, added blue,
// unchanged grey. Wheel zooms, dragging moves, the arrows nudge the newer
// revision into line when the sheets were plotted with a shift.
export function CompareView({
  older,
  newer,
  onSwap,
  onClose
}: CompareViewProps): React.JSX.Element {
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [failed, setFailed] = useState(false)
  const [mode, setMode] = useState<Mode>('overlay')
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [stats, setStats] = useState<DiffStats | null>(null)
  const [camera, setCamera] = useState<Camera | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const diffRef = useRef<ImageData | null>(null)

  useEffect(() => {
    let alive = true
    setPrepared(null)
    setFailed(false)
    setCamera(null)
    setOffset({ x: 0, y: 0 })
    renderSheets(older.page, newer.page)
      .then((sheets) => {
        if (!alive) return
        // Let the "Comparing…" state paint before the heavy part.
        setTimeout(() => {
          if (!alive) return
          setPrepared({
            sheets,
            older: revision(pixels(sheets.older), sheets.w, sheets.h),
            newer: revision(pixels(sheets.newer), sheets.w, sheets.h)
          })
        }, 30)
      })
      .catch((error) => {
        console.error('Compare failed', error)
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [older.page, newer.page])

  // The overlay, again whenever the newer sheet is nudged.
  useEffect(() => {
    if (!prepared) return
    const { w, h } = prepared.sheets
    const image = diffRef.current?.width === w ? diffRef.current : new ImageData(w, h)
    diffRef.current = image
    setStats(diffImage(image.data, w, h, prepared.older, prepared.newer, offset.x, offset.y))
  }, [prepared, offset])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!prepared || !canvas) return
    const { w, h, older: a, newer: b } = prepared.sheets
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (mode === 'overlay') {
      if (diffRef.current) ctx.putImageData(diffRef.current, 0, 0)
    } else {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(
        mode === 'older' ? a : b,
        mode === 'newer' ? offset.x : 0,
        mode === 'newer' ? offset.y : 0
      )
    }
  }, [prepared, mode, stats, offset, camera !== null])

  const fit = useCallback(() => {
    const stage = stageRef.current
    if (!prepared || !stage) return
    const { w, h } = prepared.sheets
    const k = Math.min(stage.clientWidth / w, stage.clientHeight / h) * 0.95
    setCamera({ k, x: (stage.clientWidth - w * k) / 2, y: (stage.clientHeight - h * k) / 2 })
  }, [prepared])
  useLayoutEffect(() => {
    if (prepared && !camera) fit()
  }, [prepared, camera, fit])

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setCamera((c) => {
      if (!c) return c
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.k * factor))
      const f = k / c.k
      return { k, x: cx - (cx - c.x) * f, y: cy - (cy - c.y) * f }
    })
  }, [])

  // Wheel zooms around the pointer (a non-passive listener, to keep the page
  // from scrolling).
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const box = stage.getBoundingClientRect()
      zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - box.left, event.clientY - box.top)
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const drag = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // Nothing reaches the canvas behind.
      event.stopPropagation()
      const step = event.shiftKey ? 10 : 1
      const nudge = (x: number, y: number): void => {
        event.preventDefault()
        setOffset((o) => ({ x: o.x + x, y: o.y + y }))
      }
      switch (event.key) {
        case 'Escape':
          event.preventDefault()
          onClose()
          break
        case '1':
          setMode('overlay')
          break
        case '2':
          setMode('older')
          break
        case '3':
          setMode('newer')
          break
        case '0':
          fit()
          break
        case 'ArrowLeft':
          nudge(-step, 0)
          break
        case 'ArrowRight':
          nudge(step, 0)
          break
        case 'ArrowUp':
          nudge(0, -step)
          break
        case 'ArrowDown':
          nudge(0, step)
          break
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, fit])

  const changed = stats ? stats.removed + stats.added : 0
  return (
    <div className="compare-view">
      <header className="compare-bar">
        <span className="compare-name older" title={older.label}>
          <i /> {older.label}
        </span>
        <button className="btn glass" title="Swap old and new" onClick={onSwap}>
          ⇄
        </button>
        <span className="compare-name newer" title={newer.label}>
          <i /> {newer.label}
        </span>
        <div className="compare-modes" role="tablist">
          {(
            [
              ['overlay', 'Differences', '1'],
              ['older', 'Old', '2'],
              ['newer', 'New', '3']
            ] as const
          ).map(([key, label, hotkey]) => (
            <button
              key={key}
              className={mode === key ? 'on' : ''}
              title={`${label} (${hotkey})`}
              onClick={() => setMode(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="compare-stats">
          {failed
            ? "Couldn't render the pages"
            : !prepared || !stats
              ? 'Comparing…'
              : changed === 0
                ? 'No differences'
                : 'Changes found'}
        </span>
        <button className="btn glass square" title="Close (Esc)" onClick={onClose}>
          <CloseIcon size={16} />
        </button>
      </header>
      <div
        className="compare-stage"
        ref={stageRef}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.button !== 1) return
          drag.current = { x: e.clientX, y: e.clientY }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const from = drag.current
          if (!from) return
          drag.current = { x: e.clientX, y: e.clientY }
          setCamera((c) => c && { ...c, x: c.x + e.clientX - from.x, y: c.y + e.clientY - from.y })
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={fit}
      >
        {prepared && camera && (
          <canvas
            ref={canvasRef}
            className="compare-canvas"
            style={{
              width: prepared.sheets.w,
              height: prepared.sheets.h,
              transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.k})`
            }}
          />
        )}
        {!prepared && !failed && <div className="compare-wait">Comparing…</div>}
      </div>
      <footer className="compare-legend">
        <span className="compare-key removed">Removed</span>
        <span className="compare-key added">Added</span>
        <span className="compare-key common">Unchanged</span>
        {prepared?.sheets.reshaped && (
          <span>The sheets differ in size: the new one is fitted.</span>
        )}
        <span className="compare-nudge">
          Arrows nudge the new sheet (Shift ×10)
          {(offset.x !== 0 || offset.y !== 0) && (
            <>
              {' '}
              · offset {offset.x}, {offset.y} px{' '}
              <button onClick={() => setOffset({ x: 0, y: 0 })}>Reset</button>
            </>
          )}
        </span>
      </footer>
    </div>
  )
}
