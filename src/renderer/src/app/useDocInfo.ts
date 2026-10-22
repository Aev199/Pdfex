import { useEffect, useMemo, useRef, useState } from 'react'
import type { DocEntry, PdfSource } from '../types'

type FileInfo = NonNullable<Awaited<ReturnType<Window['api']['fileInfo']>>>

export interface DocInfo {
  name: string
  pageCount: number
  // Bytes: the origin file's real size when the document came from one file,
  // otherwise the in-memory size of the PDF data behind it.
  sizeBytes: number
  // Containing folder of the origin file, when there is exactly one.
  folder: string | null
  fileName: string | null
  // Number of distinct sources; >1 means the document was assembled from
  // several files, so folder/date fields don't describe a single origin.
  sourceCount: number
  createdMs: number | null
  modifiedMs: number | null
}

const dirOf = (path: string): string => path.replace(/[\\/][^\\/]*$/, '')
const baseOf = (path: string): string => path.split(/[\\/]/).pop() ?? path

// Metadata for the document under the pointer. Everything except the file
// timestamps is already in memory; those come from one cached IPC call per
// path, so sweeping the mouse over the board doesn't hit the disk repeatedly.
export function useDocInfo(doc: DocEntry | null): DocInfo | null {
  const [resolved, setResolved] = useState<{ path: string; info: FileInfo } | null>(null)
  const cacheRef = useRef(new Map<string, FileInfo | null>())

  const sources = useMemo(() => {
    if (!doc) return [] as PdfSource[]
    const unique = new Map<string, PdfSource>()
    for (const page of doc.pages) unique.set(page.source.id, page.source)
    return [...unique.values()]
  }, [doc])

  const soloPath = sources.length === 1 ? (sources[0].path ?? null) : null

  useEffect(() => {
    if (!soloPath) {
      setResolved(null)
      return
    }
    const cached = cacheRef.current.get(soloPath)
    if (cached !== undefined) {
      setResolved(cached ? { path: soloPath, info: cached } : null)
      return
    }
    let alive = true
    void window.api
      .fileInfo(soloPath)
      .then((info) => {
        cacheRef.current.set(soloPath, info)
        if (alive) setResolved(info ? { path: soloPath, info } : null)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [soloPath])

  if (!doc) return null

  // Guard against a stale async result arriving for a different document.
  const info = resolved && resolved.path === soloPath ? resolved.info : null
  const inMemoryBytes = sources.reduce((sum, s) => sum + s.byteLength, 0)

  return {
    name: doc.name,
    pageCount: doc.pages.length,
    sizeBytes: info?.size ?? inMemoryBytes,
    folder: soloPath ? dirOf(soloPath) : null,
    fileName: soloPath ? baseOf(soloPath) : null,
    sourceCount: sources.length,
    createdMs: info?.createdMs ?? null,
    modifiedMs: info?.modifiedMs ?? null
  }
}
