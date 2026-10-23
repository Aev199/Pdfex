import { PDFDocument, degrees } from 'pdf-lib'
import type { PDFPage } from 'pdf-lib'

import { MANIFEST_NAME, PDFX_VERSION } from './format'
import { drawMarks } from './marks'
import { drawElements } from './elements'
import { embedElementFonts, fontFor, textRunsOf } from './elements/fonts'
import type { TextLook } from '../elements/types'
import type { ElementFonts } from './elements/fonts'
import { registerAcroForm } from './form-fields'
import { addCommentAnnotations } from './comments'
import { drawOcrText, ocrText } from './ocr-layer'
import type { ExportDocument, ExportPage, PdfxManifest, RasterExportPage } from './format'

interface BuildContext {
  output: PDFDocument
  sources: Map<string, PDFDocument>
  fonts: ElementFonts | null
}

const OCR_LOOK: TextLook = { font: 'sans', bold: false }

const createContext = (output: PDFDocument): BuildContext => ({
  output,
  sources: new Map(),
  fonts: null
})

async function elementFonts(
  ctx: BuildContext,
  page: ExportPage
): Promise<ElementFonts | undefined> {
  const runs = textRunsOf(page.elements)
  if (page.kind === 'source' && page.ocrWords?.length) {
    runs.push({ text: ocrText(page.ocrWords), look: OCR_LOOK })
  }
  if (runs.length === 0) return undefined
  ctx.fonts = await embedElementFonts(ctx.output, runs, ctx.fonts)
  return ctx.fonts
}

async function addRasterPage(output: PDFDocument, page: RasterExportPage): Promise<PDFPage> {
  const image = await output.embedPng(page.png)
  const added = output.addPage([page.width, page.height])
  added.drawImage(image, { x: 0, y: 0, width: page.width, height: page.height })
  return added
}

async function addExportPage(ctx: BuildContext, page: ExportPage): Promise<void> {
  const fonts = await elementFonts(ctx, page)
  if (page.kind === 'raster') {
    const added = await addRasterPage(ctx.output, page)
    drawElements(added, page.elements, fonts)
    addCommentAnnotations(ctx.output, added, page.comments)
    turn(added, page.rotation)
    return
  }
  let source = ctx.sources.get(page.sourceKey)
  if (!source) {
    source = await PDFDocument.load(page.bytes, { ignoreEncryption: true })
    ctx.sources.set(page.sourceKey, source)
  }
  const [copied] = await ctx.output.copyPages(source, [page.pageIndex])
  ctx.output.addPage(copied)
  if (fonts && page.ocrWords?.length) {
    drawOcrText(copied, page.ocrWords, fontFor(fonts, ocrText(page.ocrWords), OCR_LOOK))
  }
  drawElements(copied, page.elements, fonts)
  drawMarks(copied, page.marks)
  addCommentAnnotations(ctx.output, copied, page.comments)
  turn(copied, page.rotation)
}

// Marks and elements are drawn in the page's own orientation first, then the
// whole page (with them) is turned, so they stay where they were drawn.
function turn(page: PDFPage, extra: number | undefined): void {
  if (!extra) return
  page.setRotation(degrees((page.getRotation().angle + extra) % 360))
}

export async function buildPdf(pages: ExportPage[]): Promise<Uint8Array> {
  const output = await PDFDocument.create()
  const ctx = createContext(output)
  for (const page of pages) {
    await addExportPage(ctx, page)
  }
  await registerAcroForm(output)
  output.setProducer(`PDFX ${PDFX_VERSION}`)
  return output.save()
}

export async function buildPdfx(documents: ExportDocument[], title: string): Promise<Uint8Array> {
  const output = await PDFDocument.create()
  const manifest: PdfxManifest = { pdfx: PDFX_VERSION, title, documents: [] }
  const ctx = createContext(output)

  for (const doc of documents) {
    if (doc.pages.length === 0) continue
    for (const page of doc.pages) {
      await addExportPage(ctx, page)
    }
    manifest.documents.push({ name: doc.name, pages: doc.pages.length })
  }

  await registerAcroForm(output)

  await output.attach(new TextEncoder().encode(JSON.stringify(manifest, null, 2)), MANIFEST_NAME, {
    mimeType: 'application/json',
    description: 'PDFX manifest describing the documents in this collection',
    creationDate: new Date(),
    modificationDate: new Date()
  })

  output.setTitle(title)
  output.setProducer(`PDFX ${PDFX_VERSION}`)
  output.setKeywords(['PDFX'])

  return output.save()
}
