import type { PDFPage } from 'pdf-lib'
import { lookOf } from '../../elements/types'
import type { InkElement, MeasureElement, PageElement, ShapeElement } from '../../elements/types'
import { drawInkElements } from './ink'
import { drawShapeElements } from './shapes'
import { drawTextElement } from './text'
import { drawMeasureElements } from './measures'
import { drawCalloutElement } from './callouts'
import { fontFor, fontForElement } from './fonts'
import type { ElementFonts } from './fonts'

const PLAIN = { font: 'sans', bold: false } as const

export function drawElements(
  page: PDFPage,
  elements: PageElement[] | undefined,
  fonts?: ElementFonts
): void {
  if (!elements || elements.length === 0) return
  drawInkElements(
    page,
    elements.filter((e): e is InkElement => e.kind === 'ink')
  )
  drawShapeElements(
    page,
    elements.filter((e): e is ShapeElement => e.kind === 'shape')
  )
  if (!fonts) return
  drawMeasureElements(
    page,
    elements.filter((e): e is MeasureElement => e.kind === 'measure'),
    (text) => fontFor(fonts, text, PLAIN)
  )
  for (const element of elements) {
    if (element.kind === 'callout') {
      drawCalloutElement(page, element, fontFor(fonts, element.text, lookOf(element)))
    } else if (element.kind === 'text') {
      drawTextElement(page, element, fontForElement(element, fonts))
    }
  }
}
