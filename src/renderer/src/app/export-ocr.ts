import type { OcrStatus } from '../search/engine'
import type { OcrWord } from '../ocr/types'
import type { PageEntry } from '../types'

// What the export needs from the search index to make scans searchable.
export interface ExportOcr {
  words: (sourceKey: string) => OcrWord[] | undefined
  status: (sourceKey: string) => OcrStatus
  activate: () => void
}

export const ocrKey = (page: PageEntry): string => `${page.source.id}:${page.pageIndex}`

// Stop waiting when recognition makes no progress for this long.
const STALL_MS = 90_000
const POLL_MS = 400

// Recognizes the scanned pages among `pages` (those not read yet), reporting
// how many are left. Resolves when every page is read, or recognition stalls.
export async function recognizeScans(
  pages: PageEntry[],
  ocr: ExportOcr,
  progress: (left: number) => void
): Promise<void> {
  const keys = [...new Set(pages.map(ocrKey))]
  const waiting = (): number =>
    keys.filter((k) => {
      const status = ocr.status(k)
      return status === 'pending' || status === 'unknown'
    }).length
  let left = waiting()
  if (left === 0) return
  ocr.activate()
  let since = Date.now()
  while (left > 0 && Date.now() - since < STALL_MS) {
    progress(left)
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    const now = waiting()
    if (now < left) since = Date.now()
    left = now
  }
}
