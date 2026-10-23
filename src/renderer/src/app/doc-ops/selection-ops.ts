import { uniqueDocName } from '../names'
import type { DocEntry, PageEntry, PdfSource } from '../../types'
import type { PageRef } from '../types'

// Operations on a set of selected pages and on whole documents. Pure: they
// return a new document list (or the same one when nothing changes) and,
// where pages are created, which new page came from which original so the
// caller can carry annotations over.

export interface Copied {
  docs: DocEntry[]
  // new page id -> original page id
  origins: Map<string, string>
  // The pages created, in order.
  created: PageRef[]
}

const copyPage = (page: PageEntry): PageEntry => ({ ...page, id: crypto.randomUUID() })

const taken = (docs: DocEntry[]): Set<string> => new Set(docs.map((d) => d.name))

export function duplicateDoc(docs: DocEntry[], docId: string): Copied {
  const index = docs.findIndex((d) => d.id === docId)
  const origins = new Map<string, string>()
  if (index === -1) return { docs, origins, created: [] }
  const doc = docs[index]
  const pages = doc.pages.map((p) => {
    const copy = copyPage(p)
    origins.set(copy.id, p.id)
    return copy
  })
  const copy: DocEntry = {
    id: crypto.randomUUID(),
    name: uniqueDocName(`${doc.name} (copy)`, taken(docs)),
    pages
  }
  const created = pages.map((p) => ({ docId: copy.id, pageId: p.id }))
  return { docs: [...docs.slice(0, index + 1), copy, ...docs.slice(index + 1)], origins, created }
}

// Each selected page gets its copy right after it.
export function duplicatePages(docs: DocEntry[], refs: PageRef[]): Copied {
  const ids = new Set(refs.map((r) => r.pageId))
  const origins = new Map<string, string>()
  const created: PageRef[] = []
  const next = docs.map((doc) => {
    if (!doc.pages.some((p) => ids.has(p.id))) return doc
    const pages: PageEntry[] = []
    for (const page of doc.pages) {
      pages.push(page)
      if (!ids.has(page.id)) continue
      const copy = copyPage(page)
      origins.set(copy.id, page.id)
      created.push({ docId: doc.id, pageId: copy.id })
      pages.push(copy)
    }
    return { ...doc, pages }
  })
  return { docs: created.length > 0 ? next : docs, origins, created }
}

// Removes the pages; documents left empty disappear.
export function deletePages(docs: DocEntry[], refs: PageRef[]): DocEntry[] {
  const ids = new Set(refs.map((r) => r.pageId))
  if (ids.size === 0) return docs
  return docs
    .map((doc) =>
      doc.pages.some((p) => ids.has(p.id))
        ? { ...doc, pages: doc.pages.filter((p) => !ids.has(p.id)) }
        : doc
    )
    .filter((doc) => doc.pages.length > 0)
}

// Moves the selected pages, in document order, into a new document placed
// after the first document they came from.
export function extractPages(
  docs: DocEntry[],
  refs: PageRef[]
): { docs: DocEntry[]; docId: string | null } {
  const ids = new Set(refs.map((r) => r.pageId))
  const picked: PageEntry[] = []
  let firstDoc: DocEntry | null = null
  for (const doc of docs) {
    for (const page of doc.pages) {
      if (!ids.has(page.id)) continue
      picked.push(page)
      firstDoc ??= doc
    }
  }
  if (!firstDoc || picked.length === 0) return { docs, docId: null }
  const extracted: DocEntry = {
    id: crypto.randomUUID(),
    name: uniqueDocName(`${firstDoc.name} (extract)`, taken(docs)),
    pages: picked
  }
  const remaining = deletePages(docs, refs)
  // Right after the source document, or in its place if it emptied out.
  const sourceIndex = docs.indexOf(firstDoc)
  const survivors = new Set(remaining.map((d) => d.id))
  const at = docs.slice(0, sourceIndex + 1).filter((d) => survivors.has(d.id)).length
  return {
    docs: [...remaining.slice(0, at), extracted, ...remaining.slice(at)],
    docId: extracted.id
  }
}

// Splits a document so `pageId` starts a new document right after it.
export function splitDocAt(docs: DocEntry[], docId: string, pageId: string): DocEntry[] {
  const index = docs.findIndex((d) => d.id === docId)
  const doc = docs[index]
  const at = doc?.pages.findIndex((p) => p.id === pageId) ?? -1
  if (!doc || at <= 0) return docs
  const head: DocEntry = { ...doc, pages: doc.pages.slice(0, at) }
  const tail: DocEntry = {
    id: crypto.randomUUID(),
    name: uniqueDocName(`${doc.name} (part 2)`, taken(docs)),
    pages: doc.pages.slice(at)
  }
  return [...docs.slice(0, index), head, tail, ...docs.slice(index + 1)]
}

// Replaces a document's pages (e.g. with a newer version of its file),
// keeping its place and name.
export function replaceDocPages(docs: DocEntry[], docId: string, pages: PageEntry[]): DocEntry[] {
  if (pages.length === 0) return docs
  return docs.map((d) => (d.id === docId ? { ...d, pages } : d))
}

// Every page from `anchor` to `target` in reading order (documents top to
// bottom, pages left to right), for Shift+click.
export function pageRange(docs: DocEntry[], anchor: PageRef, target: PageRef): PageRef[] {
  const flat: PageRef[] = docs.flatMap((d) => d.pages.map((p) => ({ docId: d.id, pageId: p.id })))
  const a = flat.findIndex((r) => r.pageId === anchor.pageId)
  const b = flat.findIndex((r) => r.pageId === target.pageId)
  if (a === -1 || b === -1) return [target]
  const [lo, hi] = a <= b ? [a, b] : [b, a]
  return flat.slice(lo, hi + 1)
}

export const allPages = (docs: DocEntry[]): PageRef[] =>
  docs.flatMap((d) => d.pages.map((p) => ({ docId: d.id, pageId: p.id })))

const turned = (
  size: { width: number; height: number },
  rotation: number | undefined
): { width: number; height: number } =>
  rotation === 90 || rotation === 270 ? { width: size.height, height: size.width } : size

// Point every page of `oldId` at `next` (a re-read of the same file after it
// changed on disk). Page ids stay, so their annotations stay. Pages past the
// new end disappear; a document that showed the whole old file in order
// also gains the pages the file grew by.
export function swapSource(
  docs: DocEntry[],
  oldId: string,
  next: PdfSource,
  sizes: { width: number; height: number }[]
): DocEntry[] {
  const count = sizes.length
  const result = docs.map((doc) => {
    if (!doc.pages.some((p) => p.source.id === oldId)) return doc
    const whole =
      doc.pages.length > 0 &&
      doc.pages.every((p, i) => p.source.id === oldId && p.pageIndex === i) &&
      doc.pages.length === doc.pages[0].source.pdf.numPages
    const pages: PageEntry[] = []
    for (const page of doc.pages) {
      if (page.source.id !== oldId) pages.push(page)
      else if (page.pageIndex < count)
        pages.push({ ...page, source: next, ...turned(sizes[page.pageIndex], page.rotation) })
    }
    if (whole) {
      for (let i = doc.pages.length; i < count; i++) {
        pages.push({ id: crypto.randomUUID(), source: next, pageIndex: i, ...sizes[i] })
      }
    }
    return { ...doc, pages }
  })
  return result.filter((d) => d.pages.length > 0)
}

// Turn pages by ±90° (display size swaps with the turn).
export function rotatePages(docs: DocEntry[], refs: PageRef[], delta: 90 | -90): DocEntry[] {
  const ids = new Set(refs.map((r) => r.pageId))
  if (ids.size === 0) return docs
  return docs.map((doc) =>
    doc.pages.some((p) => ids.has(p.id))
      ? {
          ...doc,
          pages: doc.pages.map((p) =>
            ids.has(p.id)
              ? {
                  ...p,
                  rotation: ((((p.rotation ?? 0) + delta) % 360) + 360) % 360,
                  width: p.height,
                  height: p.width
                }
              : p
          )
        }
      : doc
  )
}
