import { useCallback } from 'react'
import { openPdf } from '../pdfx/source'
import type { PageEntry } from '../types'

// Print pages as they look in PDFx (marks, shapes, filled forms, rotation):
// build the same PDF an export would, draw each page to a JPEG at print
// resolution and hand the images to the main process, which opens the
// system print dialog.

const PRINT_DPI = 150
// Keeps an A0 sheet within canvas limits (and the spool reasonable).
const MAX_SIDE_PX = 7200

export function usePrint(
  buildPagesPdf: (pages: PageEntry[]) => Promise<Uint8Array>,
  setBusy: (busy: boolean) => void,
  flash: (message: string) => void
) {
  return useCallback(
    async (pages: PageEntry[], title: string) => {
      if (pages.length === 0) return
      setBusy(true)
      const job = crypto.randomUUID()
      try {
        const pdf = await openPdf(await buildPagesPdf(pages))
        try {
          for (let i = 0; i < pdf.numPages; i++) {
            if (pdf.numPages > 3) flash(`Preparing to print… ${i + 1} / ${pdf.numPages}`)
            const page = await pdf.getPage(i + 1)
            const base = page.getViewport({ scale: 1 })
            const scale = Math.min(PRINT_DPI / 72, MAX_SIDE_PX / Math.max(base.width, base.height))
            const viewport = page.getViewport({ scale })
            const canvas = document.createElement('canvas')
            canvas.width = Math.floor(viewport.width)
            canvas.height = Math.floor(viewport.height)
            const ctx = canvas.getContext('2d')!
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            await page.render({ canvas, viewport }).promise
            page.cleanup()
            const blob = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob(resolve, 'image/jpeg', 0.92)
            )
            canvas.width = 0
            if (!blob) throw new Error('Could not draw a page for printing')
            await window.api.printSpool(
              job,
              i,
              new Uint8Array(await blob.arrayBuffer()),
              base.width,
              base.height
            )
          }
        } finally {
          await pdf.destroy().catch(() => {})
        }
        flash('Opening the print dialog…')
        await window.api.printRun(job, title)
      } catch (error) {
        console.error('Print failed', error)
        flash('Could not print')
      } finally {
        setBusy(false)
      }
    },
    [buildPagesPdf, setBusy, flash]
  )
}
