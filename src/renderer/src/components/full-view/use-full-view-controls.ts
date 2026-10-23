import { useCallback, useRef } from 'react'
import type { DocEntry } from '../../types'
import type { View } from './geometry'
import {
  clamp,
  EDIT_PAN_ALLOWANCE,
  fitInto,
  flipTo,
  MAX_ZOOM,
  MIN_ZOOM,
  TRANSITION_MS,
  slideTop,
  stepPage
} from './geometry'

interface ControlsOptions {
  scrollRef: React.RefObject<HTMLDivElement | null>
  closingRef: React.MutableRefObject<boolean>
  editingRef: React.MutableRefObject<boolean>
  docsRef: React.MutableRefObject<DocEntry[]>
  vpRef: React.MutableRefObject<{ w: number; h: number }>
  curRef: React.MutableRefObject<{ di: number; pi: number }>
  phaseRef: React.MutableRefObject<'opening' | 'open' | 'closing'>
  setView: React.Dispatch<React.SetStateAction<View>>
  setPhase: (phase: 'opening' | 'open' | 'closing') => void
  setFlip: (flip: string | null) => void
  setFlipTransition: (on: boolean) => void
  setRevealed: (on: boolean) => void
  onClose: () => void
}

export interface FullViewControls {
  resetView: () => void
  applyZoom: (nextZoom: (z: number) => number, focal?: { x: number; y: number }) => void
  panBy: (dx: number, dy: number) => void
  navByKey: (axis: 'x' | 'y', dir: 1 | -1) => void
  // Jump to a page: document index and page index within it.
  goTo: (di: number, pi: number) => void
  runClose: () => void
}

export function useFullViewControls(opts: ControlsOptions): FullViewControls {
  const { scrollRef, closingRef, editingRef, docsRef, vpRef, curRef, phaseRef } = opts
  const { setView, setPhase, setFlip, setFlipTransition, setRevealed, onClose } = opts

  const resetView = useCallback(() => setView({ zoom: 1, x: 0, y: 0 }), [])

  const applyZoom = useCallback(
    (nextZoom: (z: number) => number, focal?: { x: number; y: number }) => {
      setView((v) => {
        const nz = clamp(nextZoom(v.zoom), MIN_ZOOM, MAX_ZOOM)
        if (nz === v.zoom) return v
        const vp = vpRef.current
        const { di: cdi, pi: cpi } = curRef.current
        const p = docsRef.current[cdi].pages[cpi]
        const b = fitInto(p.width, p.height, vp)
        const r = nz / v.zoom
        const cx = focal ? focal.x : vp.w / 2
        const cy = focal ? focal.y : vp.h / 2
        const dx = cx - vp.w / 2
        const dy = cy - vp.h / 2
        const maxX = Math.max(0, (b.w * nz - vp.w) / 2)
        const maxY = Math.max(0, (b.h * nz - vp.h) / 2)
        const allowY = editingRef.current ? EDIT_PAN_ALLOWANCE : 0
        return {
          zoom: nz,
          x: clamp(dx * (1 - r) + r * v.x, -maxX, maxX),
          y: clamp(dy * (1 - r) + r * v.y, -maxY, maxY + allowY)
        }
      })
    },
    []
  )

  const panBy = useCallback((dx: number, dy: number) => {
    const vp = vpRef.current
    const { di: cdi, pi: cpi } = curRef.current
    const p = docsRef.current[cdi].pages[cpi]
    const b = fitInto(p.width, p.height, vp)
    setView((v) => {
      const maxX = Math.max(0, (b.w * v.zoom - vp.w) / 2)
      const maxY = Math.max(0, (b.h * v.zoom - vp.h) / 2)
      const allowY = editingRef.current ? EDIT_PAN_ALLOWANCE : 0
      return { ...v, x: clamp(v.x + dx, -maxX, maxX), y: clamp(v.y + dy, -maxY, maxY + allowY) }
    })
  }, [])

  // Either axis turns the page: the reader is one vertical strip of pages,
  // and the next page may be the first of the next document.
  // Quick repeats (wheel notches, a held key) count from the page already
  // on its way, not from the one still on screen, so each moves one more.
  const turning = useRef<{ di: number; pi: number; at: number } | null>(null)
  const navByKey = useCallback((_axis: 'x' | 'y', dir: 1 | -1) => {
    const sc = scrollRef.current
    if (!sc) return
    const now = performance.now()
    const base =
      turning.current && now - turning.current.at < 450 ? turning.current : curRef.current
    const counts = docsRef.current.map((d) => d.pages.length)
    const next = stepPage(counts, base.di, base.pi, dir)
    const top = slideTop(sc, next.di, next.pi)
    if (top === null) return
    turning.current = { ...next, at: now }
    sc.scrollTo({ top, behavior: 'smooth' })
  }, [])

  const runClose = useCallback(() => {
    if (closingRef.current || phaseRef.current !== 'open') return
    closingRef.current = true
    const { di: cdi, pi: cpi } = curRef.current
    const p = docsRef.current[cdi].pages[cpi]
    const el = document.querySelector(`[data-page-id="${CSS.escape(p.id)}"]`)
    const r = el?.getBoundingClientRect()
    if (!r || r.width === 0) {
      onClose()
      return
    }
    const vp = vpRef.current
    const target = flipTo(fitInto(p.width, p.height, vp), vp, r)
    setView({ zoom: 1, x: 0, y: 0 })
    setPhase('closing')
    setFlip(null)
    setFlipTransition(false)
    requestAnimationFrame(() => {
      setFlip(target)
      setFlipTransition(true)
      setRevealed(false)
    })
    window.setTimeout(onClose, TRANSITION_MS + 20)
  }, [onClose])

  const goTo = useCallback((di: number, pi: number) => {
    const sc = scrollRef.current
    if (!sc) return
    const tdi = clamp(di, 0, docsRef.current.length - 1)
    const tpi = clamp(pi, 0, docsRef.current[tdi].pages.length - 1)
    const top = slideTop(sc, tdi, tpi)
    if (top === null) return
    setView({ zoom: 1, x: 0, y: 0 })
    const far = Math.abs(tpi - curRef.current.pi) > 3 || tdi !== curRef.current.di
    sc.scrollTo({ top, behavior: far ? 'auto' : 'smooth' })
  }, [])

  return { resetView, applyZoom, panBy, navByKey, goTo, runClose }
}
