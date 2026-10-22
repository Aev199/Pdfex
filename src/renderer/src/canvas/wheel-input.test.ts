import { describe, expect, it } from 'vitest'
import { NOTCH_ZOOM, WheelAnimator, interpretWheel, isNotched } from './wheel-input'

const wheel = (over: Partial<Parameters<typeof interpretWheel>[0]>) => ({
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...over
})

describe('interpretWheel', () => {
  it('treats a Windows wheel notch as smooth vertical pan', () => {
    expect(interpretWheel(wheel({ deltaY: 100 }))).toEqual({
      kind: 'pan',
      dx: 0,
      dy: 100,
      smooth: true
    })
  })

  it('recognises notches at 125% and 150% display scaling', () => {
    expect(isNotched(wheel({ deltaY: 80 }))).toBe(true)
    expect(isNotched(wheel({ deltaY: -66.67 }))).toBe(true)
  })

  it('applies touchpad scrolling directly on both axes', () => {
    expect(interpretWheel(wheel({ deltaX: 3.5, deltaY: -7.25 }))).toEqual({
      kind: 'pan',
      dx: 3.5,
      dy: -7.25,
      smooth: false
    })
  })

  it('maps Shift + wheel to horizontal pan', () => {
    const intent = interpretWheel(wheel({ deltaY: 100, shiftKey: true }))
    expect(intent).toMatchObject({ kind: 'pan', dx: 100, dy: 0 })
  })

  it('keeps Chromium-swapped Shift + wheel horizontal', () => {
    const intent = interpretWheel(wheel({ deltaX: 100, shiftKey: true }))
    expect(intent).toMatchObject({ kind: 'pan', dx: 100, dy: 0 })
  })

  it('zooms one step per Ctrl + wheel notch, in and out', () => {
    const zin = interpretWheel(wheel({ deltaY: -100, ctrlKey: true }))
    const zout = interpretWheel(wheel({ deltaY: 100, ctrlKey: true }))
    expect(zin).toEqual({ kind: 'zoom', factor: NOTCH_ZOOM, smooth: true })
    expect(zout.kind === 'zoom' && zout.factor).toBeCloseTo(1 / NOTCH_ZOOM)
  })

  it('zooms continuously for a touchpad pinch', () => {
    const intent = interpretWheel(wheel({ deltaY: -2.4, ctrlKey: true }))
    expect(intent.kind).toBe('zoom')
    if (intent.kind !== 'zoom') return
    expect(intent.smooth).toBe(false)
    expect(intent.factor).toBeGreaterThan(1)
    expect(intent.factor).toBeLessThan(1.05)
  })

  it('converts line-mode deltas to pixels', () => {
    expect(interpretWheel(wheel({ deltaY: 3, deltaMode: 1 }))).toMatchObject({ dy: 120 })
  })
})

describe('WheelAnimator', () => {
  const run = (limit = Infinity) => {
    const frames: ((t: number) => void)[] = []
    let k = 1
    let x = 0
    const animator = new WheelAnimator(
      {
        zoomBy(f) {
          const next = Math.min(limit, k * f)
          const applied = next / k
          k = next
          return applied
        },
        panBy(dx) {
          x += dx
        }
      },
      (cb) => frames.push(cb),
      () => {}
    )
    const flush = () => {
      let t = 0
      while (frames.length > 0 && t < 5000) frames.shift()!((t += 16))
      return t
    }
    return { animator, flush, state: () => ({ k, x }) }
  }

  it('reaches the full target and stops within a few hundred ms', () => {
    const { animator, flush, state } = run()
    animator.zoom(1.2, [0, 0])
    animator.zoom(1.2, [0, 0])
    animator.pan(100, 0)
    const elapsed = flush()
    expect(state().k).toBeCloseTo(1.44, 6)
    expect(state().x).toBeCloseTo(100, 6)
    expect(elapsed).toBeLessThan(600)
    expect(animator.active).toBe(false)
  })

  it('stops spinning at a zoom limit', () => {
    const { animator, flush, state } = run(1.1)
    animator.zoom(2, [0, 0])
    flush()
    expect(state().k).toBeCloseTo(1.1)
    expect(animator.active).toBe(false)
  })
})
