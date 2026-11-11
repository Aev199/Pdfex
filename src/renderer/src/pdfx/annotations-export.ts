import { PDFHexString, PDFName, PDFString } from 'pdf-lib'
import type { PDFDocument, PDFObject, PDFOperator, PDFPage, PDFRef } from 'pdf-lib'
import { lookOf } from '../elements/types'
import type { ElementPoint, PageElement } from '../elements/types'
import { MARK_COLORS, markBand } from '../edit/types'
import type { Mark } from '../edit/types'
import { drawInkElements } from './elements/ink'
import { drawShapeElements } from './elements/shapes'
import { drawTextElement } from './elements/text'
import { drawMeasureElements } from './elements/measures'
import { drawCalloutElement } from './elements/callouts'
import { fontFor, fontForElement } from './elements/fonts'
import type { ElementFonts } from './elements/fonts'
import { drawMarks } from './marks'
import { normalizeRotation, visualPointToUser, visualRectToUser } from './redact/geometry'
import type { Box } from './redact/geometry'

// Marks and elements as PDF annotations instead of page content, so other
// programs (Acrobat, Foxit, Edge…) can select, move or delete them: each one
// keeps exactly its look (drawn the same way, as the annotation's
// appearance) plus the data those programs edit (ink paths, corners, quad
// points, text). Hidden text (redaction) is never one of them: it must stay
// burned into the page.

const PLAIN = { font: 'sans', bold: false } as const
// Print, so they come out on paper like page content.
const PRINT = 4

interface Exporter {
  doc: PDFDocument
  page: PDFPage
  author: string
  box: { x: number; y: number; width: number; height: number }
  rot: number
  w: number
  h: number
}

// Draws with the usual code, then moves what was drawn off the page into a
// form XObject that becomes the annotation's appearance.
function capture(ex: Exporter, draw: () => void): PDFOperator[] {
  const stream = (
    ex.page as unknown as {
      getContentStream: () => { operators: PDFOperator[] }
    }
  ).getContentStream()
  const start = stream.operators.length
  draw()
  return stream.operators.splice(start)
}

function addAnnotation(
  ex: Exporter,
  ops: PDFOperator[],
  bounds: Box,
  pad: number,
  fields: Record<string, unknown>
): void {
  if (ops.length === 0) return
  const rect = [
    bounds.x - pad,
    bounds.y - pad,
    bounds.x + bounds.w + pad,
    bounds.y + bounds.h + pad
  ]
  const appearance = ex.doc.context.register(
    ex.doc.context.formXObject(ops, {
      BBox: rect,
      Resources: ex.page.node.Resources() as unknown as PDFRef
    })
  )
  const annot = ex.doc.context.register(
    ex.doc.context.obj({
      Type: 'Annot',
      Rect: rect,
      P: ex.page.ref,
      F: PRINT,
      T: PDFHexString.fromText(ex.author),
      M: PDFString.fromDate(new Date()),
      AP: { N: appearance },
      ...(fields as Record<string, PDFObject>)
    })
  )
  ex.page.node.addAnnot(annot)
}

const colorOf = (hex: string): number[] => {
  const v = parseInt(hex.slice(1), 16)
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]
}

function boundsOf(ex: Exporter, points: ElementPoint[]): Box {
  const user = points.map((p) => visualPointToUser(p.x, p.y, ex.box, ex.rot))
  const xs = user.map((p) => p.x)
  const ys = user.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

const flat = (ex: Exporter, points: ElementPoint[]): number[] =>
  points.flatMap((p) => {
    const u = visualPointToUser(p.x, p.y, ex.box, ex.rot)
    return [u.x, u.y]
  })

function exportElement(ex: Exporter, el: PageElement, fonts: ElementFonts | undefined): void {
  const bboxCorners = (): ElementPoint[] => [
    { x: el.bbox.x, y: el.bbox.y },
    { x: el.bbox.x + el.bbox.w, y: el.bbox.y + el.bbox.h }
  ]
  const id = { NM: PDFString.of(el.id) }
  switch (el.kind) {
    case 'ink': {
      const ops = capture(ex, () => drawInkElements(ex.page, [el]))
      addAnnotation(ex, ops, boundsOf(ex, el.points), el.strokeWidth, {
        ...id,
        Subtype: 'Ink',
        InkList: [flat(ex, el.points)],
        C: colorOf(el.color),
        BS: { W: el.strokeWidth }
      })
      return
    }
    case 'shape': {
      const ops = capture(ex, () => drawShapeElements(ex.page, [el]))
      const ends = flat(ex, [el.from, el.to])
      const common = { ...id, C: colorOf(el.color), BS: { W: el.strokeWidth } }
      const bounds = boundsOf(ex, [el.from, el.to])
      const pad = el.strokeWidth * 3
      if (el.shape === 'rect') addAnnotation(ex, ops, bounds, pad, { ...common, Subtype: 'Square' })
      else if (el.shape === 'ellipse') {
        addAnnotation(ex, ops, bounds, pad, { ...common, Subtype: 'Circle' })
      } else {
        addAnnotation(ex, ops, bounds, pad, {
          ...common,
          Subtype: 'Line',
          L: ends,
          LE: [PDFName.of('None'), PDFName.of(el.shape === 'arrow' ? 'OpenArrow' : 'None')]
        })
      }
      return
    }
    case 'measure': {
      if (!fonts) return
      const ops = capture(ex, () =>
        drawMeasureElements(ex.page, [el], (text) => fontFor(fonts, text, PLAIN))
      )
      addAnnotation(ex, ops, boundsOf(ex, bboxCorners()), el.strokeWidth * 2, {
        ...id,
        Subtype: el.mode === 'area' ? 'Polygon' : 'PolyLine',
        Vertices: flat(ex, el.points),
        C: colorOf(el.color),
        BS: { W: el.strokeWidth }
      })
      return
    }
    case 'callout':
    case 'text': {
      if (!fonts) return
      const ops = capture(ex, () =>
        el.kind === 'callout'
          ? drawCalloutElement(ex.page, el, fontFor(fonts, el.text, lookOf(el)))
          : drawTextElement(ex.page, el, fontForElement(el, fonts))
      )
      const [r, g, b] = colorOf(el.color)
      addAnnotation(ex, ops, boundsOf(ex, bboxCorners()), 2, {
        ...id,
        Subtype: 'FreeText',
        Contents: PDFHexString.fromText(el.text),
        DA: PDFString.of(`/Helv ${el.fontSize} Tf ${r} ${g} ${b} rg`),
        ...(el.kind === 'callout' ? { IT: PDFName.of('FreeTextCallout') } : {})
      })
      return
    }
  }
}

function exportMark(ex: Exporter, mark: Mark): void {
  // Hidden text is burned into the page, never something to delete.
  if (mark.kind === 'redact') return
  const ops = capture(ex, () => drawMarks(ex.page, [mark]))
  const users = mark.rects.map((r) => visualRectToUser(r, ex.box, ex.rot))
  const x = Math.min(...users.map((u) => u.x))
  const y = Math.min(...users.map((u) => u.y))
  const bounds = {
    x,
    y,
    w: Math.max(...users.map((u) => u.x + u.w)) - x,
    h: Math.max(...users.map((u) => u.y + u.h)) - y
  }
  // Quad points per rectangle: top-left, top-right, bottom-left, bottom-right.
  const quads = mark.rects.flatMap((r) => {
    const band = markBand(undefined, r)
    const tl = visualPointToUser(band.x, band.y, ex.box, ex.rot)
    const tr = visualPointToUser(band.x + band.w, band.y, ex.box, ex.rot)
    const bl = visualPointToUser(band.x, band.y + band.h, ex.box, ex.rot)
    const br = visualPointToUser(band.x + band.w, band.y + band.h, ex.box, ex.rot)
    return [tl.x, tl.y, tr.x, tr.y, bl.x, bl.y, br.x, br.y]
  })
  const subtype =
    mark.style === 'underline' ? 'Underline' : mark.style === 'strike' ? 'StrikeOut' : 'Highlight'
  addAnnotation(ex, ops, bounds, 1, {
    NM: PDFString.of(mark.id),
    Subtype: subtype,
    QuadPoints: quads,
    C: colorOf(MARK_COLORS[mark.color])
  })
}

export function addEditableAnnotations(
  doc: PDFDocument,
  page: PDFPage,
  marks: Mark[] | undefined,
  elements: PageElement[] | undefined,
  fonts: ElementFonts | undefined,
  author: string
): void {
  if (!marks?.length && !elements?.length) return
  const box = page.getCropBox()
  const rot = normalizeRotation(page.getRotation().angle)
  const sideways = rot === 90 || rot === 270
  const ex: Exporter = {
    doc,
    page,
    author,
    box,
    rot,
    w: sideways ? box.height : box.width,
    h: sideways ? box.width : box.height
  }
  for (const el of elements ?? []) exportElement(ex, el, fonts)
  for (const mark of marks ?? []) exportMark(ex, mark)
}
