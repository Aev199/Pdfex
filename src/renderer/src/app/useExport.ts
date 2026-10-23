import { useCallback } from 'react'
import { zipSync } from 'fflate'
import { buildPdf, buildPdfx, stripExtension } from '../pdfx/format'
import { prepareExportPage } from '../pdfx/export-pages'
import { fillDocSources } from '../forms/fill'
import { SourceUnavailableError } from '../pdfx/source'
import type { DocEntry, PageEntry } from '../types'
import type { MarkMap } from '../edit/types'
import type { FormValuesBySource } from '../forms/types'
import type { ElementMap } from '../elements/types'

const PDFX_FILTER = { name: 'PDFX', extensions: ['pdfx'] }
const PDF_FILTER = { name: 'PDF', extensions: ['pdf'] }
const ZIP_FILTER = { name: 'ZIP', extensions: ['zip'] }
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]/g

export const safeFileName = (name: string): string =>
  name.replace(ILLEGAL_FILENAME_CHARS, '-').trim() || 'Untitled'

export function useExport(
  docs: DocEntry[],
  marks: MarkMap,
  formValues: FormValuesBySource,
  elements: ElementMap,
  setBusy: (busy: boolean) => void,
  flash: (message: string) => void
) {
  const preparePages = useCallback(
    (pages: PageEntry[], filled: Map<string, Uint8Array>) =>
      Promise.all(
        pages.map((p) => prepareExportPage(p, marks[p.id], filled.get(p.source.id), elements[p.id]))
      ),
    [marks, elements]
  )

  // A plain PDF of the given pages with everything drawn on them: marks,
  // elements, filled forms. Also what "Open with" and drag-out hand over.
  const buildPagesPdf = useCallback(
    async (pages: PageEntry[]): Promise<Uint8Array> => {
      const filled = await fillDocSources([{ id: '', name: '', pages }], formValues)
      return buildPdf(await preparePages(pages, filled))
    },
    [formValues, preparePages]
  )

  // Whether a page carries anything that exists only in PDFx (and so would
  // be lost by handing over the original file instead of an export).
  const hasEdits = useCallback(
    (page: PageEntry): boolean =>
      !!page.rotation ||
      !!marks[page.id]?.length ||
      !!elements[page.id]?.length ||
      Object.keys(formValues[page.source.id] ?? {}).length > 0,
    [marks, elements, formValues]
  )

  const run = useCallback(
    async (work: () => Promise<string>) => {
      setBusy(true)
      try {
        flash(`Saved ${await work()}`)
      } catch (error) {
        console.error('Export failed', error)
        flash(exportFailure(error))
      } finally {
        setBusy(false)
      }
    },
    [flash, setBusy]
  )

  // All documents, or only `docIds`, as one PDF (or a .pdfx that remembers
  // the document boundaries).
  const exportCollection = useCallback(
    async (kind: 'pdfx' | 'pdf', docIds?: string[]) => {
      const chosen = docIds ? docs.filter((d) => docIds.includes(d.id)) : docs
      if (chosen.length === 0) {
        flash('Nothing to export')
        return
      }
      const suggested = chosen.length === 1 ? safeFileName(chosen[0].name) : 'untitled'
      const path = await window.api.chooseSavePath(
        `${suggested}.${kind}`,
        kind === 'pdfx' ? PDFX_FILTER : PDF_FILTER
      )
      if (!path) return
      await run(async () => {
        const filename = path.split(/[\\/]/).pop() ?? `untitled.${kind}`
        const filled = await fillDocSources(chosen, formValues)
        const documents = await Promise.all(
          chosen.map(async (doc) => ({
            name: doc.name,
            pages: await preparePages(doc.pages, filled)
          }))
        )
        const bytes =
          kind === 'pdf' && chosen.length === 1
            ? await buildPdf(documents[0].pages)
            : await buildPdfx(documents, stripExtension(filename).replace(/\.pdf$/i, ''))
        return window.api.writeFile(path, bytes)
      })
    },
    [docs, preparePages, formValues, flash, run]
  )

  // Just these pages (e.g. the selection), as one PDF.
  const exportPages = useCallback(
    async (pages: PageEntry[], name: string) => {
      if (pages.length === 0) return
      const path = await window.api.chooseSavePath(`${safeFileName(name)}.pdf`, PDF_FILTER)
      if (!path) return
      await run(async () => window.api.writeFile(path, await buildPagesPdf(pages)))
    },
    [buildPagesPdf, run]
  )

  const exportZip = useCallback(async () => {
    if (docs.length === 0) {
      flash('Nothing to export')
      return
    }
    const path = await window.api.chooseSavePath('untitled.zip', ZIP_FILTER)
    if (!path) return
    await run(async () => {
      const filled = await fillDocSources(docs, formValues)
      const entries: Record<string, Uint8Array> = {}
      const used = new Set<string>()
      for (const doc of docs) {
        const safeName = safeFileName(doc.name)
        let filename = `${safeName}.pdf`
        for (let n = 2; used.has(filename); n++) filename = `${safeName} (${n}).pdf`
        used.add(filename)
        entries[filename] = await buildPdf(await preparePages(doc.pages, filled))
      }
      return window.api.writeFile(path, zipSync(entries))
    })
  }, [docs, preparePages, formValues, flash, run])

  return { exportCollection, exportPages, exportZip, buildPagesPdf, hasEdits }
}

const exportFailure = (error: unknown): string =>
  error instanceof SourceUnavailableError ? `Export failed: ${error.message}` : 'Export failed'
