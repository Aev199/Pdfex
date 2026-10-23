import {
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setCharacterSqueeze,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  TextRenderingMode
} from 'pdf-lib'
import type { PDFFont, PDFPage } from 'pdf-lib'
import type { OcrWord } from '../ocr/types'
import { normalizeRotation, visualPointToUser } from './redact/geometry'

// Text recognized on a scanned page goes under the picture as invisible text
// (render mode 3), each word stretched over the box where it was read, so the
// exported PDF can be searched, selected and copied like a born-digital one.

// Baseline and glyph size within a word box, as fractions of its height.
const BASELINE = 0.8
const SIZE = 0.85

export const ocrText = (words: OcrWord[] | undefined): string =>
  (words ?? []).map((w) => w.text).join(' ')

export function drawOcrText(page: PDFPage, words: OcrWord[] | undefined, font: PDFFont): void {
  if (!words?.length) return
  const box = page.getCropBox()
  const rot = normalizeRotation(page.getRotation().angle)
  const sideways = rot === 90 || rot === 270
  const height = sideways ? box.width : box.height
  const key = page.node.newFontDictionary(font.name, font.ref)
  const ops = [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible)]
  for (const word of words) {
    const text = word.text.trim()
    if (!text || word.w <= 0 || word.h <= 0) continue
    const size = Math.max(1, word.h * height * SIZE)
    const natural = font.widthOfTextAtSize(text, size)
    if (natural <= 0) continue
    // The word's baseline in user space, start to end: its direction turns
    // with the page's own /Rotate.
    const y = word.y + word.h * BASELINE
    const a = visualPointToUser(word.x, y, box, rot)
    const b = visualPointToUser(word.x + word.w, y, box, rot)
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length <= 0) continue
    const dx = (b.x - a.x) / length
    const dy = (b.y - a.y) / length
    ops.push(
      setFontAndSize(key, size),
      setCharacterSqueeze((100 * length) / natural),
      setTextMatrix(dx, dy, -dy, dx, a.x, a.y),
      showText(font.encodeText(text))
    )
  }
  ops.push(endText(), popGraphicsState())
  page.pushOperators(...ops)
}
