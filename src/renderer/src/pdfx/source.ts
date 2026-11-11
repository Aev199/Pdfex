import { getDocument, PasswordResponses } from 'pdfjs-dist'
import { askPassword, PasswordCancelled } from '../app/password-prompt'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { partitionPages, readManifest, stripExtension } from './format'
import { findConverter } from './convert'
import { isWeb } from '../platform/web/install'
import { registerSource } from './source-registry'
import type { DocEntry, PageEntry, PdfSource } from '../types'
import type { Mark } from '../edit/types'
import type { SourceExportPage } from './format'

interface PageSize {
  width: number
  height: number
}

export interface LoadedSource {
  source: PdfSource
  sizes: PageSize[]
}

const MAX_PAGES = 10_000

const WASM_URL = import.meta.env.VITE_PDFX_WEB
  ? new URL('/pdf/', location.href).href
  : 'pdfx-assets://pdf/'

const STANDARD_FONT_URL = `${WASM_URL}standard_fonts/`

export interface SourceMeta {
  path?: string
  mtimeMs?: number
  // The bytes are the file at `path` unchanged (not converted from it).
  pristine?: boolean
  // Reuse a stored id (session restore).
  id?: string
  // What to call the file when asking for its password.
  name?: string
  // Called as soon as the page count is known, before page sizes are read.
  onPageCount?: (count: number) => void
}

// Where an opened file's bytes came from, for loadSource.
export const fileMeta = (
  file: { path?: string; mtimeMs?: number },
  converted: boolean
): SourceMeta => ({ path: file.path, mtimeMs: file.mtimeMs, pristine: !converted })

export async function loadSource(bytes: Uint8Array, meta?: SourceMeta): Promise<LoadedSource> {
  const task = getDocument({
    data: bytes.slice(),
    wasmUrl: WASM_URL,
    standardFontDataUrl: STANDARD_FONT_URL
  })
  const name = meta?.name ?? meta?.path?.split(/[\\/]/).pop() ?? 'This PDF'
  let typed: string | undefined
  let cancelled = false
  task.onPassword = (update: (password: string) => void, reason: number) => {
    void askPassword(name, reason === PasswordResponses.INCORRECT_PASSWORD).then((password) => {
      if (password === null) {
        cancelled = true
        void task.destroy()
      } else {
        typed = password
        update(password)
      }
    })
  }
  const pdf = await task.promise.catch((error: unknown) => {
    throw cancelled ? new PasswordCancelled(name) : error
  })
  const { info } = await pdf.getMetadata().catch(() => ({ info: {} }))
  const encrypted = !!(info as { EncryptFilterName?: string | null }).EncryptFilterName
  if (pdf.numPages > MAX_PAGES) {
    throw new Error(`PDF declares ${pdf.numPages} pages; refusing to load more than ${MAX_PAGES}`)
  }
  meta?.onPageCount?.(pdf.numPages)
  const reReadable = !!(meta?.pristine && meta.path && !isWeb)
  const source: PdfSource = {
    id: meta?.id ?? crypto.randomUUID(),
    bytes: reReadable ? undefined : bytes,
    byteLength: bytes.byteLength,
    pdf,
    path: meta?.path,
    mtimeMs: meta?.mtimeMs,
    pristine: meta?.pristine,
    password: encrypted ? (typed ?? '') : undefined
  }
  registerSource(source)
  const sizes: PageSize[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 1 })
    sizes.push({ width: viewport.width, height: viewport.height })
  }
  return { source, sizes }
}

export function pagesFromSource(
  source: PdfSource,
  sizes: PageSize[],
  indices: number[]
): PageEntry[] {
  return indices.map((pageIndex) => ({
    id: crypto.randomUUID(),
    source,
    pageIndex,
    width: sizes[pageIndex].width,
    height: sizes[pageIndex].height
  }))
}

export class SourceUnavailableError extends Error {}

const BYTES_TTL_MS = 30_000
const bytesCache = new Map<string, { promise: Promise<Uint8Array>; timer: number }>()

// The bytes behind a source: kept in memory for generated content, re-read
// from disk for opened PDFs. A re-read file must be the one we opened — if it
// was moved or changed since, fail loudly rather than export other pages.
// Reads are cached briefly so an export touching 400 pages of one file reads
// it once.
export function sourceBytes(source: PdfSource): Promise<Uint8Array> {
  if (source.bytes && source.password === undefined) return Promise.resolve(source.bytes)
  const cached = bytesCache.get(source.id)
  if (cached) {
    window.clearTimeout(cached.timer)
    cached.timer = window.setTimeout(() => bytesCache.delete(source.id), BYTES_TTL_MS)
    return cached.promise
  }
  const promise = readFromDisk(source)
  const entry = {
    promise,
    timer: window.setTimeout(() => bytesCache.delete(source.id), BYTES_TTL_MS)
  }
  bytesCache.set(source.id, entry)
  promise.catch(() => {
    window.clearTimeout(entry.timer)
    bytesCache.delete(source.id)
  })
  return promise
}

async function readFromDisk(source: PdfSource): Promise<Uint8Array> {
  const raw = await readRaw(source)
  // pdf-lib copies pages of encrypted files as noise: hand it a plain copy.
  return source.password === undefined ? raw : window.api.decryptPdf(raw, source.password)
}

async function readRaw(source: PdfSource): Promise<Uint8Array> {
  if (source.bytes) return source.bytes
  const path = source.path
  if (!path) throw new SourceUnavailableError('The document data is no longer available')
  const read = await window.api.readSource(path)
  if (!read) throw new SourceUnavailableError(`${path} was moved or deleted`)
  const changed =
    read.size !== source.byteLength ||
    (source.mtimeMs !== undefined && Math.abs(read.mtimeMs - source.mtimeMs) > 1)
  if (changed) throw new SourceUnavailableError(`${path} was changed by another program`)
  return read.data
}

export async function importIntoDocs(
  filename: string,
  bytes: Uint8Array,
  meta?: SourceMeta
): Promise<DocEntry[]> {
  const { source, sizes } = await loadSource(bytes, meta)
  const manifest = await readManifest(source.pdf)
  return partitionPages(manifest, source.pdf.numPages, stripExtension(filename)).map((part) => ({
    id: crypto.randomUUID(),
    name: part.name,
    pages: pagesFromSource(source, sizes, part.indices)
  }))
}

export const toExportPage = async (
  page: PageEntry,
  marks?: Mark[],
  filledBytes?: Uint8Array
): Promise<SourceExportPage> => ({
  kind: 'source',
  sourceKey: filledBytes ? `${page.source.id}:filled` : page.source.id,
  bytes: filledBytes ?? (await sourceBytes(page.source)),
  pageIndex: page.pageIndex,
  marks
})

export const openPdf = (bytes: Uint8Array): Promise<PDFDocumentProxy> =>
  getDocument({ data: bytes.slice(), wasmUrl: WASM_URL, standardFontDataUrl: STANDARD_FONT_URL })
    .promise

export async function loadIncomingPages(
  files: { name: string; data: Uint8Array; path?: string; mtimeMs?: number }[],
  reference?: PageSize
): Promise<PageEntry[]> {
  const entries: PageEntry[] = []
  for (const file of files) {
    const conv = findConverter(file.name, file.data)
    const bytes = conv ? await conv.toPdf(file.name, file.data, reference, file.path) : file.data
    const { source, sizes } = await loadSource(bytes, fileMeta(file, !!conv))
    entries.push(
      ...pagesFromSource(
        source,
        sizes,
        sizes.map((_, i) => i)
      )
    )
  }
  return entries
}
