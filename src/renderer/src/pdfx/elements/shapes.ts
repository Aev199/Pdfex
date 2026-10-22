import {
  LineCapStyle,
  LineJoinStyle,
  appendBezierCurve,
  closePath,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingColor,
  stroke
} from 'pdf-lib'
import type { PDFOperator, PDFPage } from 'pdf-lib'
import type { ShapeElement } from '../../elements/types'
import { shapeSegments } from '../../elements/shapes'
import { normalizeRotation, visualPointToUser } from '../redact/geometry'
import { hexColor } from './color'

// Shapes become plain vector strokes in the page content, so any PDF viewer
// shows them exactly as drawn.
export function drawShapeElements(page: PDFPage, elements: ShapeElement[]): void {
  if (elements.length === 0) return
  const box = page.getCropBox()
  const rot = normalizeRotation(page.getRotation().angle)
  const sideways = rot === 90 || rot === 270
  const width = sideways ? box.height : box.width
  const height = sideways ? box.width : box.height
  const toUser = (p: { x: number; y: number }): { x: number; y: number } =>
    visualPointToUser(p.x, p.y, box, rot)
  const operators: PDFOperator[] = [
    pushGraphicsState(),
    setLineCap(LineCapStyle.Round),
    setLineJoin(LineJoinStyle.Miter)
  ]
  for (const element of elements) {
    operators.push(setStrokingColor(hexColor(element.color)))
    operators.push(setLineWidth(element.strokeWidth))
    for (const segment of shapeSegments(element, width, height)) {
      if (segment.kind === 'close') {
        operators.push(closePath())
        continue
      }
      const to = toUser(segment.to)
      if (segment.kind === 'move') operators.push(moveTo(to.x, to.y))
      else if (segment.kind === 'line') operators.push(lineTo(to.x, to.y))
      else {
        const c1 = toUser(segment.c1)
        const c2 = toUser(segment.c2)
        operators.push(appendBezierCurve(c1.x, c1.y, c2.x, c2.y, to.x, to.y))
      }
    }
    operators.push(stroke())
  }
  operators.push(popGraphicsState())
  page.pushOperators(...operators)
}
