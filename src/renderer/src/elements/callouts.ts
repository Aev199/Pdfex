import { bboxOfPoints } from './geometry'
import { textBlockSize } from './measure'
import { lookOf } from './types'
import type { CalloutElement, ElementPoint, ElementRect, TextStyle } from './types'

// A callout is text in a frame with an arrow from the frame to the point it
// is about. Stored by the arrow tip and the text origin (page fractions); the
// frame and the arrow's start follow from the text.

// Space between the text and the frame, in PDF points.
export const CALLOUT_PAD = 4
const BBOX_PAD_POINTS = 10

export interface CalloutGeometry {
  // Frame, in page fractions.
  frame: ElementRect
  // Where the arrow leaves the frame (the edge midpoint nearest the tip).
  start: ElementPoint
}

export function calloutGeometry(
  el: Pick<CalloutElement, 'anchor' | 'origin' | 'text' | 'fontSize' | 'font' | 'bold'>,
  w: number,
  h: number
): CalloutGeometry {
  const size = textBlockSize(el.text, el.fontSize, lookOf(el))
  const frame = {
    x: el.origin.x - CALLOUT_PAD / w,
    y: el.origin.y - CALLOUT_PAD / h,
    w: (size.w + CALLOUT_PAD * 2) / w,
    h: (size.h + CALLOUT_PAD * 2) / h
  }
  const mids: ElementPoint[] = [
    { x: frame.x + frame.w / 2, y: frame.y },
    { x: frame.x + frame.w / 2, y: frame.y + frame.h },
    { x: frame.x, y: frame.y + frame.h / 2 },
    { x: frame.x + frame.w, y: frame.y + frame.h / 2 }
  ]
  const dist = (p: ElementPoint): number =>
    Math.hypot((p.x - el.anchor.x) * w, (p.y - el.anchor.y) * h)
  const start = mids.reduce((best, p) => (dist(p) < dist(best) ? p : best))
  return { frame, start }
}

function calloutBbox(
  el: Pick<CalloutElement, 'anchor' | 'origin' | 'text' | 'fontSize' | 'font' | 'bold'>,
  w: number,
  h: number
): ElementRect {
  const { frame } = calloutGeometry(el, w, h)
  return bboxOfPoints(
    [el.anchor, { x: frame.x, y: frame.y }, { x: frame.x + frame.w, y: frame.y + frame.h }],
    BBOX_PAD_POINTS / w,
    BBOX_PAD_POINTS / h
  )
}

export function createCalloutElement(
  anchor: ElementPoint,
  origin: ElementPoint,
  text: string,
  number: number,
  w: number,
  h: number,
  style: TextStyle
): CalloutElement | null {
  if (text.trim().length === 0) return null
  const look = lookOf(style)
  const base = {
    anchor,
    origin,
    text,
    fontSize: style.fontSize,
    ...(look.font !== 'sans' ? { font: look.font } : {}),
    ...(look.bold ? { bold: true } : {})
  }
  return {
    id: crypto.randomUUID(),
    kind: 'callout',
    number,
    color: style.color,
    ...base,
    bbox: calloutBbox(base, w, h)
  }
}

export function editedCallout(
  el: CalloutElement,
  text: string,
  w: number,
  h: number
): CalloutElement {
  const next = { ...el, text }
  return { ...next, bbox: calloutBbox(next, w, h) }
}

export function restyledCallout(
  el: CalloutElement,
  style: TextStyle,
  w: number,
  h: number
): CalloutElement {
  const { font: _font, bold: _bold, ...rest } = el
  const look = lookOf(style)
  const next: CalloutElement = {
    ...rest,
    color: style.color,
    fontSize: style.fontSize,
    ...(look.font !== 'sans' ? { font: look.font } : {}),
    ...(look.bold ? { bold: true } : {})
  }
  return { ...next, bbox: calloutBbox(next, w, h) }
}
