import { INK_COLOR, INK_STROKE_WIDTH, TEXT_COLOR, TEXT_FONT_SIZE, lookOf } from './types'
import type {
  DrawStyle,
  ElementPoint,
  ElementRect,
  InkElement,
  TextElement,
  TextLook,
  TextStyle
} from './types'
import { bboxOfPoints, refineInkPoints } from './geometry'
import { clipMarks } from './text-marks'
import { textBlockSize } from './measure'

const BBOX_PAD_POINTS = 9

export function createInkElement(
  points: ElementPoint[],
  number: number,
  pageWidth: number,
  pageHeight: number,
  style: DrawStyle = { color: INK_COLOR, strokeWidth: INK_STROKE_WIDTH }
): InkElement | null {
  if (points.length < 2) return null
  const thinned = refineInkPoints(points)
  return {
    id: crypto.randomUUID(),
    kind: 'ink',
    number,
    color: style.color,
    strokeWidth: style.strokeWidth,
    points: thinned,
    bbox: bboxOfPoints(thinned, BBOX_PAD_POINTS / pageWidth, BBOX_PAD_POINTS / pageHeight)
  }
}

export function textBbox(
  text: string,
  origin: ElementPoint,
  fontSize: number,
  pageWidth: number,
  pageHeight: number,
  look?: TextLook
): ElementRect {
  const size = textBlockSize(text, fontSize, look)
  const corners = [origin, { x: origin.x + size.w / pageWidth, y: origin.y + size.h / pageHeight }]
  return bboxOfPoints(corners, BBOX_PAD_POINTS / pageWidth, BBOX_PAD_POINTS / pageHeight)
}

export function createTextElement(
  text: string,
  origin: ElementPoint,
  number: number,
  pageWidth: number,
  pageHeight: number,
  fontSize: number = TEXT_FONT_SIZE,
  style?: Partial<TextStyle>
): TextElement | null {
  if (text.trim().length === 0) return null
  const size = style?.fontSize ?? fontSize
  const look = lookOf(style ?? {})
  return {
    id: crypto.randomUUID(),
    kind: 'text',
    number,
    color: style?.color ?? TEXT_COLOR,
    fontSize: size,
    ...(look.font !== 'sans' ? { font: look.font } : {}),
    ...(look.bold ? { bold: true } : {}),
    text,
    origin,
    marks: [],
    bbox: textBbox(text, origin, size, pageWidth, pageHeight, look)
  }
}

export function editedTextElement(
  element: TextElement,
  text: string,
  pageWidth: number,
  pageHeight: number
): TextElement {
  return {
    ...element,
    text,
    marks: clipMarks(element.marks, text.length),
    bbox: textBbox(text, element.origin, element.fontSize, pageWidth, pageHeight, lookOf(element))
  }
}

// The same text in another typeface, size or colour.
export function restyledTextElement(
  element: TextElement,
  style: TextStyle,
  pageWidth: number,
  pageHeight: number
): TextElement {
  const { font: _font, bold: _bold, ...rest } = element
  const look = lookOf(style)
  return {
    ...rest,
    color: style.color,
    fontSize: style.fontSize,
    ...(look.font !== 'sans' ? { font: look.font } : {}),
    ...(look.bold ? { bold: true } : {}),
    bbox: textBbox(element.text, element.origin, style.fontSize, pageWidth, pageHeight, look)
  }
}
