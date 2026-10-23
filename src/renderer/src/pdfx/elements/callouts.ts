import { rgb } from 'pdf-lib'
import type { PDFFont, PDFPage } from 'pdf-lib'
import { calloutGeometry } from '../../elements/callouts'
import type { CalloutElement, ShapeElement, TextElement } from '../../elements/types'
import { normalizeRotation, visualRectToUser } from '../redact/geometry'
import { drawShapeElements } from './shapes'
import { drawTextElement } from './text'
import { hexColor } from './color'

const STROKE = 1

// A callout is an arrow, a white frame over it and the text in the frame, all
// vector graphics and real text.
export function drawCalloutElement(page: PDFPage, el: CalloutElement, font: PDFFont): void {
  const box = page.getCropBox()
  const rot = normalizeRotation(page.getRotation().angle)
  const sideways = rot === 90 || rot === 270
  const w = sideways ? box.height : box.width
  const h = sideways ? box.width : box.height
  const { frame, start } = calloutGeometry(el, w, h)
  const arrow: ShapeElement = {
    id: el.id,
    kind: 'shape',
    number: el.number,
    shape: 'arrow',
    color: el.color,
    strokeWidth: STROKE,
    from: start,
    to: el.anchor,
    bbox: el.bbox
  }
  drawShapeElements(page, [arrow])
  const user = visualRectToUser(frame, box, rot)
  page.drawRectangle({
    x: user.x,
    y: user.y,
    width: user.w,
    height: user.h,
    color: rgb(1, 1, 1),
    borderColor: hexColor(el.color),
    borderWidth: STROKE
  })
  const text: TextElement = {
    id: el.id,
    kind: 'text',
    number: el.number,
    color: el.color,
    fontSize: el.fontSize,
    font: el.font,
    bold: el.bold,
    text: el.text,
    origin: el.origin,
    marks: [],
    bbox: el.bbox
  }
  drawTextElement(page, text, font)
}
