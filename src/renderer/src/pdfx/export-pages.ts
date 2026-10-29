import { toExportPage } from './source'
import { hiddenLayerNames } from './layers'
import { rasterizeMarkedPage } from './rasterize'
import { buildRedactedSourcePage } from './redact'
import type { Mark } from '../edit/types'
import type { PageElement } from '../elements/types'
import type { CommentThread } from '../comments/types'
import type { OcrWord } from '../ocr/types'
import type { PageEntry } from '../types'
import type { ExportPage } from './format'

export async function prepareExportPage(
  page: PageEntry,
  marks: Mark[] | undefined,
  filledBytes?: Uint8Array,
  elements?: PageElement[],
  comments?: CommentThread[],
  ocrWords?: OcrWord[]
): Promise<ExportPage> {
  const prepared = await preparePage(page, marks, filledBytes)
  // Never on a page with hidden text: the recognized words would bring it back.
  if (prepared.kind === 'source' && !marks?.some((m) => m.kind === 'redact')) {
    prepared.ocrWords = ocrWords
  }
  prepared.elements = elements
  if (prepared.kind === 'source') prepared.hiddenLayers = await hiddenLayerNames(page.source.pdf)
  prepared.comments = comments
  prepared.rotation = page.rotation
  return prepared
}

async function preparePage(
  page: PageEntry,
  marks: Mark[] | undefined,
  filledBytes?: Uint8Array
): Promise<ExportPage> {
  if (marks?.some((m) => m.kind === 'redact')) {
    const surgical = await buildRedactedSourcePage(page, marks, filledBytes)
    if (surgical) return surgical
    return rasterizeMarkedPage(page, marks, filledBytes)
  }
  return toExportPage(page, marks, filledBytes)
}
