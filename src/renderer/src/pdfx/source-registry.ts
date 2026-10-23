import { forget } from './pdf-activity'
import type { PdfSource } from '../types'

// Every loaded source, so documents nothing refers to any more (removed,
// in a closed tab, dropped out of undo history) can be destroyed: a pdf.js
// document holds its whole file and caches in the worker until then.

// A source younger than this may still be on its way into a document (an
// import awaiting more work between loading and adding).
const GRACE_MS = 60_000

const loaded = new Map<PdfSource, number>()

export function registerSource(source: PdfSource): void {
  loaded.set(source, Date.now())
}

// Destroy every source not in `live`. Returns how many were released.
export function releaseUnused(live: ReadonlySet<string>, now = Date.now()): number {
  let released = 0
  for (const [source, born] of loaded) {
    if (live.has(source.id) || now - born < GRACE_MS) continue
    loaded.delete(source)
    forget(source.pdf)
    void source.pdf.destroy().catch(() => {})
    released++
  }
  return released
}

export const loadedSourceCount = (): number => loaded.size
