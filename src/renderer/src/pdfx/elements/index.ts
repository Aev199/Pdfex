import type { PDFPage } from 'pdf-lib'
import type { InkElement, PageElement, ShapeElement } from '../../elements/types'
import { drawInkElements } from './ink'
import { drawShapeElements } from './shapes'
import { drawTextElement } from './text'
import { fontForElement } from './fonts'
import type { ElementFonts } from './fonts'

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
  for (const element of elements) {
    if (element.kind === 'text') drawTextElement(page, element, fontForElement(element, fonts))
  }
}
