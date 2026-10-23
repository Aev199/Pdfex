import { useLayoutEffect } from 'react'
import type { Rect } from './geometry'
import { slideTop, TRANSITION_MS } from './geometry'

interface LayoutOptions {
  scrollRef: React.RefObject<HTMLDivElement | null>
  curRef: React.MutableRefObject<{ di: number; pi: number }>
  originRect: Rect | null
  vw: number
  vh: number
  setPhase: (phase: 'opening' | 'open' | 'closing') => void
  setFlip: (flip: string | null) => void
  setFlipTransition: (on: boolean) => void
  setRevealed: (on: boolean) => void
}

export function useFullViewLayout(opts: LayoutOptions): void {
  const { scrollRef, curRef, originRect, vw, vh } = opts
  const { setPhase, setFlip, setFlipTransition, setRevealed } = opts

  useLayoutEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    const top = slideTop(sc, curRef.current.di, curRef.current.pi)
    if (top !== null) sc.scrollTop = top
  }, [vw, vh])

  useLayoutEffect(() => {
    const raf = requestAnimationFrame(() => {
      setRevealed(true)
      if (originRect) {
        setFlip(null)
        setFlipTransition(true)
      }
    })
    const timer = originRect
      ? window.setTimeout(() => {
          setPhase('open')
          setFlipTransition(false)
        }, TRANSITION_MS)
      : 0
    return () => {
      cancelAnimationFrame(raf)
      if (timer) clearTimeout(timer)
    }
  }, [originRect])
}
