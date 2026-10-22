import { useCallback, useEffect, useRef, useState } from 'react'
import { loadSource } from '../pdfx/source'
import type { DocEntry, PdfSource } from '../types'

// Notices when a file behind an open document was changed or removed by
// another program, and re-reads it on request. Checked when the window gets
// focus back (the usual moment: the user edited the file elsewhere) and
// every so often while it has focus.

const POLL_MS = 15_000

export interface WatchedChange {
  source: PdfSource
  kind: 'changed' | 'missing'
}

const stampKey = (s: { size: number; mtimeMs: number } | null): string =>
  s ? `${s.size}:${Math.round(s.mtimeMs)}` : 'gone'

export function useSourceWatch(
  docs: DocEntry[],
  swapSource: (oldId: string, next: PdfSource, sizes: { width: number; height: number }[]) => void,
  flash: (message: string) => void
) {
  const [changes, setChanges] = useState<WatchedChange[]>([])
  const docsRef = useRef(docs)
  docsRef.current = docs
  // Stamps the user chose to ignore, so the same change isn't raised again.
  const ignored = useRef(new Map<string, string>())

  const check = useCallback(async () => {
    const sources = new Map<string, PdfSource>()
    for (const doc of docsRef.current) {
      for (const page of doc.pages) {
        const s = page.source
        if (s.pristine && s.path && !s.bytes) sources.set(s.id, s)
      }
    }
    const list = [...sources.values()]
    if (list.length === 0) {
      setChanges((prev) => (prev.length ? [] : prev))
      return
    }
    const stamps = await window.api.statSources(list.map((s) => s.path!))
    const found: WatchedChange[] = []
    list.forEach((source, i) => {
      const stamp = stamps[i]
      const same =
        !!stamp &&
        stamp.size === source.byteLength &&
        (source.mtimeMs === undefined || Math.abs(stamp.mtimeMs - source.mtimeMs) <= 1)
      if (same || ignored.current.get(source.id) === stampKey(stamp)) return
      found.push({ source, kind: stamp ? 'changed' : 'missing' })
    })
    setChanges((prev) =>
      prev.length === found.length &&
      prev.every((c, i) => c.source === found[i].source && c.kind === found[i].kind)
        ? prev
        : found
    )
  }, [])

  useEffect(() => {
    const onFocus = (): void => void check()
    window.addEventListener('focus', onFocus)
    const timer = window.setInterval(() => {
      if (document.hasFocus()) void check()
    }, POLL_MS)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.clearInterval(timer)
    }
  }, [check])

  // A document set change (e.g. a reload just happened) re-evaluates soon.
  useEffect(() => {
    const timer = window.setTimeout(() => void check(), 300)
    return () => window.clearTimeout(timer)
  }, [docs, check])

  const reload = useCallback(
    async (source: PdfSource) => {
      try {
        const read = await window.api.readSource(source.path!)
        if (!read) throw new Error('unreadable')
        const { source: next, sizes } = await loadSource(read.data, {
          path: source.path,
          mtimeMs: read.mtimeMs,
          pristine: true
        })
        swapSource(source.id, next, sizes)
        flash(`Updated from ${source.path!.split(/[\\/]/).pop()}`)
      } catch (error) {
        console.error('Reload failed', error)
        flash('Could not read the updated file')
      }
    },
    [swapSource, flash]
  )

  const ignore = useCallback(async (source: PdfSource) => {
    const [stamp] = await window.api.statSources([source.path!])
    ignored.current.set(source.id, stampKey(stamp))
    setChanges((prev) => prev.filter((c) => c.source !== source))
  }, [])

  return { changes, reload, ignore }
}
