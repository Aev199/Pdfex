import { PDFDocument, PDFNumber, PDFOperator, PDFOperatorNames, degrees, rgb } from 'pdf-lib'
import type { PDFPage } from 'pdf-lib'
import type { Mark, MarkRect } from '../edit/types'
import type { PageEntry } from '../types'
import type { PageSegment } from '../ai/page-segments'
import { buildRedactedSourcePage } from './redact'
import type { RemovedGlyphInfo } from './redact/scrub'
import { normalizeRotation, visualPointToUser, visualRectToUser } from './redact/geometry'
import { createFontPicker } from './translate-fonts'
import { fitSegments } from './translate-fit'
import type { FitContext, FitInput, FittedSegment } from './translate-fit'
import { buildOccupancy } from './translate-occupancy'
import { sourceBytes } from './source'

const COVER_COLOR = rgb(1, 1, 1)

export interface SegmentReplacement {
  segment: PageSegment
  text: string
}

interface ScrubbedPage {
  doc: PDFDocument
  glyphs: RemovedGlyphInfo[]
  bytes: Uint8Array | null
}

async function copySinglePage(entry: PageEntry): Promise<PDFDocument> {
  const source = await PDFDocument.load(await sourceBytes(entry.source), { ignoreEncryption: true })
  const temp = await PDFDocument.create()
  const [page] = await temp.copyPages(source, [entry.pageIndex])
  temp.addPage(page)
  return temp
}

async function scrubbedPageDoc(
  entry: PageEntry,
  rects: MarkRect[],
  coverOnly: boolean
): Promise<ScrubbedPage> {
  if (!coverOnly) {
    const glyphs: RemovedGlyphInfo[] = []
    const marks: Mark[] = [{ id: crypto.randomUUID(), kind: 'redact', color: 'black', rects }]
    const scrubbed = await buildRedactedSourcePage(entry, marks, undefined, {
      allowAnnotations: true,
      onRemovedGlyph: (glyph) => glyphs.push(glyph)
    })
    if (scrubbed) {
      return { doc: await PDFDocument.load(scrubbed.bytes), glyphs, bytes: scrubbed.bytes }
    }
  }
  const doc = await copySinglePage(entry)
  const page = doc.getPage(0)
  const box = page.getCropBox()
  const rot = normalizeRotation(page.getRotation().angle)
  for (const rect of rects) {
    const user = visualRectToUser(rect, box, rot)
    page.drawRectangle({
      x: user.x,
      y: user.y,
      width: user.w,
      height: user.h,
      color: COVER_COLOR
    })
  }
  return { doc, glyphs: [], bytes: null }
}

const horizontalScaling = (percent: number): PDFOperator =>
  PDFOperator.of(PDFOperatorNames.SetTextHorizontalScaling, [PDFNumber.of(percent)])

function drawFitted(page: PDFPage, fitted: FittedSegment): void {
  const box = page.getCropBox()
  const rot = normalizeRotation(page.getRotation().angle)
  const position = visualPointToUser(fitted.segment.baselineX, fitted.segment.baselineY, box, rot)
  if (fitted.scale !== 1) page.pushOperators(horizontalScaling(fitted.scale * 100))
  page.drawText(fitted.text, {
    x: position.x,
    y: position.y,
    size: fitted.size,
    font: fitted.font,
    color: rgb(fitted.color[0], fitted.color[1], fitted.color[2]),
    rotate: degrees(rot)
  })
  if (fitted.scale !== 1) page.pushOperators(horizontalScaling(100))
}

function nextReplacedStarts(inputs: FitInput[], page: PDFPage): Map<number, number> {
  const box = page.getCropBox()
  const rot = normalizeRotation(page.getRotation().angle)
  const starts = new Map<number, number>()
  const byLine = new Map<number, FitInput[]>()
  for (const input of inputs) {
    const list = byLine.get(input.segment.line) ?? []
    list.push(input)
    byLine.set(input.segment.line, list)
  }
  for (const list of byLine.values()) {
    list.sort((a, b) => a.segment.baselineX - b.segment.baselineX)
    for (let i = 0; i + 1 < list.length; i++) {
      const next = list[i + 1].segment
      starts.set(
        list[i].segment.index,
        visualPointToUser(next.baselineX, next.baselineY, box, rot).x
      )
    }
  }
  return starts
}

export interface RewriteOptions {
  coverOnly?: boolean
}

export async function rewritePageSegments(
  entry: PageEntry,
  replacements: SegmentReplacement[],
  allSegments: PageSegment[] = [],
  options: RewriteOptions = {}
): Promise<Uint8Array> {
  const { doc, glyphs, bytes } = await scrubbedPageDoc(
    entry,
    replacements.map((r) => r.segment.rect),
    options.coverOnly === true
  )
  const page = doc.getPage(0)
  const box = page.getCropBox()
  const rot = normalizeRotation(page.getRotation().angle)
  const picker = createFontPicker(doc)

  const inputs: FitInput[] = []
  for (const { segment, text } of replacements) {
    if (text.trim().length === 0) continue
    inputs.push({
      segment,
      text,
      picked: await picker.pick(segment, text),
      inkRect: visualRectToUser(segment.rect, box, rot)
    })
  }
  const lineSegmentCount = new Map<number, number>()
  for (const segment of allSegments) {
    lineSegmentCount.set(segment.line, (lineSegmentCount.get(segment.line) ?? 0) + 1)
  }
  const occupancy = bytes && rot === 0 ? await buildOccupancy(bytes) : null
  const context: FitContext = {
    lineSegmentCount,
    ...(occupancy
      ? {
          freeSpanRight: occupancy.freeSpanRight,
          nextReplacedStart: nextReplacedStarts(inputs, page),
          contentRight: Math.max(occupancy.contentRight, ...glyphs.map((g) => g.box.x + g.box.w))
        }
      : {})
  }
  for (const fitted of fitSegments(inputs, glyphs, context)) {
    drawFitted(page, fitted)
  }
  return doc.save()
}
