// Wheel and touchpad input for the zoomable surfaces (collection canvas and
// full view).
//
// A notched mouse wheel and a precision touchpad both arrive as `wheel`
// events, so we tell them apart by shape: a wheel notch is a large step on a
// single axis (Windows reports 100px per notch, scaled by display DPI, or a
// line/page delta mode), while a touchpad streams small, often two-axis,
// fractional deltas. Pinch-to-zoom on a touchpad is reported by Chromium as a
// wheel event with `ctrlKey` set.
//
// Notched input is eased over a few frames so a click of the wheel glides
// instead of jumping; touchpad input is applied as-is because the device
// already streams a smooth gesture.

export type WheelIntent =
  | { kind: 'zoom'; factor: number; smooth: boolean }
  | { kind: 'pan'; dx: number; dy: number; smooth: boolean }

const LINE_PX = 40
const NOTCH_PX = 100
// Smallest single-axis step treated as a mouse notch (100px at 100% DPI, 80px
// at 125%, ~67px at 150% — touchpads stay well under this per event).
const NOTCH_MIN = 50
// Zoom per wheel notch with Ctrl held.
export const NOTCH_ZOOM = 1.2
// Touchpad pinch sensitivity (log-scale per pixel of reported delta).
const PINCH_SPEED = 0.01
// One event can't zoom further than this, so a runaway delta stays sane.
const MAX_EVENT_ZOOM = 4

interface WheelLike {
  deltaX: number
  deltaY: number
  deltaMode: number
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

const toPixels = (delta: number, mode: number, pagePx: number): number =>
  mode === 1 ? delta * LINE_PX : mode === 2 ? delta * pagePx : delta

export function isNotched(event: WheelLike): boolean {
  if (event.deltaMode !== 0) return true
  const ax = Math.abs(event.deltaX)
  const ay = Math.abs(event.deltaY)
  return (ax === 0 && ay >= NOTCH_MIN) || (ay === 0 && ax >= NOTCH_MIN)
}

// `wheelZooms` (a setting, as in CAD programs): a mouse wheel notch zooms and
// Ctrl + wheel scrolls. Touchpad gestures are not affected.
export function interpretWheel(event: WheelLike, pagePx = 800, wheelZooms = false): WheelIntent {
  let dx = toPixels(event.deltaX, event.deltaMode, pagePx)
  let dy = toPixels(event.deltaY, event.deltaMode, pagePx)
  const notched = isNotched(event)
  const modifier = event.ctrlKey || event.metaKey
  const zoom = notched && wheelZooms && !event.shiftKey ? !modifier : modifier

  if (zoom) {
    const steps = notched ? -dy / NOTCH_PX : 0
    const raw = notched ? Math.pow(NOTCH_ZOOM, steps) : Math.exp(-dy * PINCH_SPEED)
    const factor = Math.min(MAX_EVENT_ZOOM, Math.max(1 / MAX_EVENT_ZOOM, raw))
    return { kind: 'zoom', factor, smooth: notched }
  }

  // Shift turns a vertical wheel into a horizontal one. Chromium already
  // swaps the axes on some platforms; only swap when it hasn't.
  if (event.shiftKey && dx === 0) {
    dx = dy
    dy = 0
  }
  return { kind: 'pan', dx, dy, smooth: notched }
}

// Eases queued zoom/pan toward its target. Each frame applies a fixed share
// of what is still outstanding, so repeated notches accumulate and a new
// gesture blends in instead of restarting the animation.
export interface WheelAnimatorTarget {
  // Multiply scale by `factor` around a viewport point; returns the factor
  // actually applied (smaller when the zoom limit is hit).
  zoomBy(factor: number, anchor: [number, number]): number
  // Move the content by screen pixels.
  panBy(dx: number, dy: number): void
}

const TAU_MS = 45
const EPS_LOG = 0.0005
const EPS_PX = 0.25

export class WheelAnimator {
  private logZoom = 0
  private panX = 0
  private panY = 0
  private anchor: [number, number] = [0, 0]
  private raf: number | null = null
  private last = 0

  constructor(
    private readonly target: WheelAnimatorTarget,
    private readonly schedule: (cb: (t: number) => void) => number = (cb) =>
      requestAnimationFrame(cb),
    private readonly cancel: (id: number) => void = (id) => cancelAnimationFrame(id)
  ) {}

  zoom(factor: number, anchor: [number, number]): void {
    this.logZoom += Math.log(factor)
    this.anchor = anchor
    this.start()
  }

  pan(dx: number, dy: number): void {
    this.panX += dx
    this.panY += dy
    this.start()
  }

  // Drop whatever is still queued, e.g. when the user grabs the canvas.
  stop(): void {
    this.logZoom = 0
    this.panX = 0
    this.panY = 0
    if (this.raf !== null) this.cancel(this.raf)
    this.raf = null
  }

  get active(): boolean {
    return this.raf !== null
  }

  private start(): void {
    if (this.raf !== null) return
    this.last = 0
    this.raf = this.schedule(this.frame)
  }

  private frame = (now: number): void => {
    // The first frame has no previous timestamp; assume one 60 Hz frame.
    const dt = this.last ? Math.min(64, now - this.last) : 16
    this.last = now
    const share = 1 - Math.exp(-dt / TAU_MS)

    if (this.logZoom !== 0) {
      const done = Math.abs(this.logZoom) < EPS_LOG
      const step = done ? this.logZoom : this.logZoom * share
      const applied = this.target.zoomBy(Math.exp(step), this.anchor)
      // At a zoom limit nothing more can happen; don't keep spinning.
      this.logZoom = Math.abs(Math.log(applied)) < 1e-9 ? 0 : this.logZoom - step
    }
    if (this.panX !== 0 || this.panY !== 0) {
      const done = Math.abs(this.panX) < EPS_PX && Math.abs(this.panY) < EPS_PX
      const sx = done ? this.panX : this.panX * share
      const sy = done ? this.panY : this.panY * share
      this.target.panBy(sx, sy)
      this.panX -= sx
      this.panY -= sy
    }

    if (this.logZoom === 0 && this.panX === 0 && this.panY === 0) {
      this.raf = null
      return
    }
    this.raf = this.schedule(this.frame)
  }
}
