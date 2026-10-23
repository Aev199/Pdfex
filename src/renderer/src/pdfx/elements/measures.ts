import { degrees, rgb } from 'pdf-lib'
import type { PDFFont, PDFPage } from 'pdf-lib'
import { elementLabel, labelAnchor, labelMetrics, measureStrokes } from '../../elements/measures'
import type { MeasureElement } from '../../elements/types'
import { normalizeRotation, visualPointToUser, visualRectToUser } from '../redact/geometry'
import { hexColor } from './color'

// Measurements become vector lines with their label as real text, so they
// print and copy like the rest of the drawing.
export function drawMeasureElements(
  page: PDFPage,
  elements: MeasureElement[],
  labelFont: (text: string) => PDFFont
): void {
  if (elements.length === 0) return
  const box = page.getCropBox()
  const rot = normalizeRotation(page.getRotation().angle)
  const sideways = rot === 90 || rot === 270
  const w = sideways ? box.height : box.width
  const h = sideways ? box.width : box.height
  const user = (p: { x: number; y: number }): { x: number; y: number } =>
    visualPointToUser(p.x, p.y, box, rot)

  for (const el of elements) {
    const color = hexColor(el.color)
    if (el.mode === 'area' && el.points.length > 2) {
      // drawSvgPath flips y around its origin: give it user space with y negated.
      const d = el.points
        .map((p, i) => {
          const u = user(p)
          return `${i === 0 ? 'M' : 'L'} ${u.x} ${-u.y}`
        })
        .join(' ')
      page.drawSvgPath(`${d} Z`, { x: 0, y: 0, color, opacity: 0.12 })
    }
    for (const line of measureStrokes(el, w, h)) {
      for (let i = 1; i < line.length; i++) {
        page.drawLine({
          start: user(line[i - 1]),
          end: user(line[i]),
          thickness: el.strokeWidth,
          color
        })
      }
    }
    const { size: LABEL_FONT_SIZE, pad: LABEL_PAD } = labelMetrics(w, h)
    const text = elementLabel(el, w, h)
    const font = labelFont(text)
    const textWidth = font.widthOfTextAtSize(text, LABEL_FONT_SIZE)
    const at = labelAnchor(el.mode, el.points, w, h)
    const cx = at.x * w
    const cy = at.y * h
    const frame = visualRectToUser(
      {
        x: (cx - textWidth / 2 - LABEL_PAD) / w,
        y: (cy - LABEL_FONT_SIZE / 2 - LABEL_PAD) / h,
        w: (textWidth + LABEL_PAD * 2) / w,
        h: (LABEL_FONT_SIZE + LABEL_PAD * 2) / h
      },
      box,
      rot
    )
    page.drawRectangle({
      x: frame.x,
      y: frame.y,
      width: frame.w,
      height: frame.h,
      color: rgb(1, 1, 1),
      opacity: 0.9,
      borderColor: color,
      borderWidth: 0.6
    })
    const origin = visualPointToUser(
      (cx - textWidth / 2) / w,
      (cy + LABEL_FONT_SIZE * 0.36) / h,
      box,
      rot
    )
    page.drawText(text, {
      x: origin.x,
      y: origin.y,
      size: LABEL_FONT_SIZE,
      font,
      color,
      rotate: degrees(rot)
    })
  }
}
