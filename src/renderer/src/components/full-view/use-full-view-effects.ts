import { useEffect } from 'react'
import type { DocEntry } from '../../types'
import type { View } from './geometry'
import { clamp, pageAtScroll } from './geometry'

interface EffectsOptions {
  scrollRef: React.RefObject<HTMLDivElement | null>
  scrollRaf: React.MutableRefObject<number | null>
  docsRef: React.MutableRefObject<DocEntry[]>
  vpRef: React.MutableRefObject<{ w: number; h: number }>
  pageId: string
  onActivePageChange: (pageId: string) => void
  vw: number
  vh: number
  fit: { w: number; h: number }
  view: View
  curDi: number
  curPi: number
  // The page scroller is remounted when coming back from a scrolling layout.
  layout: string
  setViewport: (vp: { w: number; h: number }) => void
  setView: React.Dispatch<React.SetStateAction<View>>
  setCurrent: React.Dispatch<React.SetStateAction<{ di: number; pi: number }>>
  setRenderVersion: React.Dispatch<React.SetStateAction<number>>
}

export function useFullViewEffects(opts: EffectsOptions): void {
  const { scrollRef, scrollRaf, docsRef, vpRef, pageId, onActivePageChange } = opts
  const { vw, vh, fit, view, curDi, curPi, layout } = opts
  const { setViewport, setView, setCurrent, setRenderVersion } = opts

  useEffect(() => {
    onActivePageChange(pageId)
  }, [pageId, onActivePageChange])

  useEffect(() => {
    const onResize = (): void => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    const onScroll = (): void => {
      if (scrollRaf.current) return
      scrollRaf.current = requestAnimationFrame(() => {
        scrollRaf.current = null
        const counts = docsRef.current.map((d) => d.pages.length)
        const { di: ndi, pi: npi } = pageAtScroll(sc.scrollTop, vpRef.current.h, counts)
        setCurrent((c) => (c.di === ndi && c.pi === npi ? c : { di: ndi, pi: npi }))
      })
    }
    sc.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => sc.removeEventListener('scroll', onScroll, { capture: true })
  }, [layout])

  useEffect(() => {
    setView((v) => {
      if (v.zoom <= 1) return v.x === 0 && v.y === 0 ? v : { ...v, x: 0, y: 0 }
      const maxX = Math.max(0, (fit.w * v.zoom - vw) / 2)
      const maxY = Math.max(0, (fit.h * v.zoom - vh) / 2)
      const x = clamp(v.x, -maxX, maxX)
      const y = clamp(v.y, -maxY, maxY)
      return x === v.x && y === v.y ? v : { ...v, x, y }
    })
  }, [fit.w, fit.h, vw, vh])

  useEffect(() => {
    const timer = setTimeout(() => setRenderVersion((n) => n + 1), 180)
    return () => clearTimeout(timer)
  }, [view, curDi, curPi])

  useEffect(
    () => () => {
      if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current)
    },
    []
  )
}
