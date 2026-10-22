import type { PDFDocumentProxy } from 'pdfjs-dist'

export interface PdfSource {
  id: string
  // Raw bytes behind this source. Dropped for unmodified on-disk PDFs, which
  // are re-read from `path` when needed (see sourceBytes in pdfx/source.ts):
  // keeping them would hold every opened file in memory twice, once here and
  // once in the pdf.js worker.
  bytes?: Uint8Array
  byteLength: number
  pdf: PDFDocumentProxy
  // Where the file came from on disk, when known.
  path?: string
  // Modification time of `path` when it was read; a differing stamp later
  // means the file was changed by another program.
  mtimeMs?: number
  // True when the bytes are exactly the file at `path` (a PDF opened as is),
  // false when they were produced from it (image, text, HTML converted to PDF).
  pristine?: boolean
}

export interface PageEntry {
  id: string
  source: PdfSource
  pageIndex: number
  width: number
  height: number
}

export interface DocEntry {
  id: string
  name: string
  pages: PageEntry[]
}
