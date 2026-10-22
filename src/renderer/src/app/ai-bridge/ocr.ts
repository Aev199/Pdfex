import type { OcrWord } from '../../ocr/types'
import type { OcrStatus } from '../../search/engine'
import type { PageEntry } from '../../types'

const POLL_MS = 350
const TIMEOUT_MS = 45_000

export interface OcrAccess {
  getOcrWords(sourceKey: string): OcrWord[] | undefined
  ocrStatus(sourceKey: string): OcrStatus
  activateOcr?: () => void
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export async function awaitOcrWords(ocr: OcrAccess, page: PageEntry): Promise<OcrWord[] | null> {
  const key = `${page.source.id}:${page.pageIndex}`
  const start = Date.now()
  ocr.activateOcr?.()
  for (;;) {
    const status = ocr.ocrStatus(key)
    if (status === 'done') return ocr.getOcrWords(key) ?? []
    if (status === 'none') return null
    if (Date.now() - start > TIMEOUT_MS) return null
    await sleep(POLL_MS)
  }
}
