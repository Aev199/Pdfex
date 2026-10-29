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
  // Set when the PDF is encrypted: the password it was opened with ('' when
  // it opens without one). Kept in memory only, for export (see sourceBytes).
  password?: string
}

export interface PageEntry {
  id: string
  source: PdfSource
  pageIndex: number
  // As displayed: swapped when `rotation` is 90 or 270.
  width: number
  height: number
  // Extra clockwise turn chosen in PDFx (0, 90, 180, 270); the file keeps
  // its own orientation until export.
  rotation?: number
}

export interface DocEntry {
  id: string
  name: string
  pages: PageEntry[]
}
