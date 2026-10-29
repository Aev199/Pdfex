import { uniqueDocName } from '../names'
import type { DocEntry } from '../../types'
import type { PageRef } from '../types'
import type { PagePlacement } from '../undo'

export function movePageInto(
  docs: DocEntry[],
  source: PageRef,
  targetDocId: string,
  index: number
): DocEntry[] {
  const page = docs.find((d) => d.id === source.docId)?.pages.find((p) => p.id === source.pageId)
  if (!page) return docs
  if (source.docId === targetDocId) {
    const di = docs.findIndex((d) => d.id === targetDocId)
    const doc = docs[di]
    const without = doc.pages.filter((p) => p.id !== source.pageId)
    const to = Math.max(0, Math.min(without.length, index))
    const pages = [...without.slice(0, to), page, ...without.slice(to)]
    if (pages.length === doc.pages.length && pages.every((p, i) => p === doc.pages[i])) return docs
    const next = [...docs]
    next[di] = { ...doc, pages }
    return next
  }
  return docs
    .map((d) => {
      if (d.id === source.docId) {
        return { ...d, pages: d.pages.filter((p) => p.id !== source.pageId) }
      }
      if (d.id === targetDocId) {
        const clamped = Math.max(0, Math.min(d.pages.length, index))
        return { ...d, pages: [...d.pages.slice(0, clamped), page, ...d.pages.slice(clamped)] }
      }
      return d
    })
    .filter((d) => d.pages.length > 0)
}

export function movePageToNewDoc(
  docs: DocEntry[],
  source: PageRef,
  docIndex: number,
  newDocId: string
): DocEntry[] {
  const sdi = docs.findIndex((d) => d.id === source.docId)
  if (sdi === -1) return docs
  const sourceDoc = docs[sdi]
  const page = sourceDoc.pages.find((p) => p.id === source.pageId)
  if (!page) return docs
  const remaining = sourceDoc.pages.filter((p) => p.id !== source.pageId)
  let next = docs.map((d) => (d.id === source.docId ? { ...d, pages: remaining } : d))
  let insertAt = docIndex
  if (remaining.length === 0) {
    next = next.filter((d) => d.id !== source.docId)
    if (sdi < docIndex) insertAt -= 1
  }
  insertAt = Math.max(0, Math.min(next.length, insertAt))
  const name = uniqueDocName(sourceDoc.name, new Set(next.map((d) => d.name)))
  const newDoc: DocEntry = { id: newDocId, name, pages: [page] }
  return [...next.slice(0, insertAt), newDoc, ...next.slice(insertAt)]
}

// Ctrl-drag: a copy of the page (new id) lands at the drop target, the
// original stays put. Index counts every page of the target document.
export function copyPageInto(
  docs: DocEntry[],
  source: PageRef,
  copyId: string,
  targetDocId: string,
  index: number
): DocEntry[] {
  const page = docs.find((d) => d.id === source.docId)?.pages.find((p) => p.id === source.pageId)
  if (!page || !docs.some((d) => d.id === targetDocId)) return docs
  const copy = { ...page, id: copyId }
  return docs.map((d) => {
    if (d.id !== targetDocId) return d
    const at = Math.max(0, Math.min(d.pages.length, index))
    return { ...d, pages: [...d.pages.slice(0, at), copy, ...d.pages.slice(at)] }
  })
}

export function copyPageToNewDoc(
  docs: DocEntry[],
  source: PageRef,
  copyId: string,
  docIndex: number,
  newDocId: string
): DocEntry[] {
  const sourceDoc = docs.find((d) => d.id === source.docId)
  const page = sourceDoc?.pages.find((p) => p.id === source.pageId)
  if (!sourceDoc || !page) return docs
  const name = uniqueDocName(sourceDoc.name, new Set(docs.map((d) => d.name)))
  const newDoc: DocEntry = { id: newDocId, name, pages: [{ ...page, id: copyId }] }
  const at = Math.max(0, Math.min(docs.length, docIndex))
  return [...docs.slice(0, at), newDoc, ...docs.slice(at)]
}

export function pagePlacement(docs: DocEntry[], pageId: string): PagePlacement | null {
  const docIndex = docs.findIndex((d) => d.pages.some((p) => p.id === pageId))
  if (docIndex === -1) return null
  const doc = docs[docIndex]
  return {
    docId: doc.id,
    docName: doc.name,
    docIndex,
    pageIndex: doc.pages.findIndex((p) => p.id === pageId)
  }
}

export function placePage(docs: DocEntry[], pageId: string, at: PagePlacement): DocEntry[] {
  const holder = docs.find((d) => d.pages.some((p) => p.id === pageId))
  if (!holder) return docs
  if (docs.some((d) => d.id === at.docId)) {
    return movePageInto(docs, { docId: holder.id, pageId }, at.docId, at.pageIndex)
  }
  const page = holder.pages.find((p) => p.id === pageId)
  if (!page) return docs
  const remaining = docs
    .map((d) => (d.id === holder.id ? { ...d, pages: d.pages.filter((p) => p.id !== pageId) } : d))
    .filter((d) => d.pages.length > 0)
  const insertAt = Math.max(0, Math.min(remaining.length, at.docIndex))
  const restored: DocEntry = { id: at.docId, name: at.docName, pages: [page] }
  return [...remaining.slice(0, insertAt), restored, ...remaining.slice(insertAt)]
}

// Several selected pages dragged at once. The drop index is counted the way
// the canvas shows it while dragging: in the target document without the
// grabbed page. The group lands, in document order, before the first page
// there that isn't moving (or at the end).
function anchorAfterDrop(
  doc: DocEntry,
  grabbedId: string,
  index: number,
  moving: Set<string>
): string | null {
  const shown = doc.pages.filter((p) => p.id !== grabbedId)
  return shown.slice(Math.max(0, index)).find((p) => !moving.has(p.id))?.id ?? null
}

const pagesOf = (docs: DocEntry[], refs: PageRef[]): DocEntry['pages'] => {
  const ids = new Set(refs.map((r) => r.pageId))
  return docs.flatMap((d) => d.pages.filter((p) => ids.has(p.id)))
}

function insertBefore(
  pages: DocEntry['pages'],
  anchorId: string | null,
  group: DocEntry['pages']
): DocEntry['pages'] {
  const at = anchorId === null ? pages.length : pages.findIndex((p) => p.id === anchorId)
  const i = at === -1 ? pages.length : at
  return [...pages.slice(0, i), ...group, ...pages.slice(i)]
}

export function movePagesInto(
  docs: DocEntry[],
  refs: PageRef[],
  grabbedId: string,
  targetDocId: string,
  index: number
): DocEntry[] {
  const target = docs.find((d) => d.id === targetDocId)
  const group = pagesOf(docs, refs)
  if (!target || group.length === 0) return docs
  const moving = new Set(group.map((p) => p.id))
  const anchor = anchorAfterDrop(target, grabbedId, index, moving)
  const next = docs
    .map((d) => {
      const kept = d.pages.filter((p) => !moving.has(p.id))
      return d.id === targetDocId
        ? { ...d, pages: insertBefore(kept, anchor, group) }
        : { ...d, pages: kept }
    })
    .filter((d) => d.pages.length > 0)
  const same =
    next.length === docs.length &&
    next.every(
      (d, i) =>
        d.pages.length === docs[i].pages.length && d.pages.every((p, j) => p === docs[i].pages[j])
    )
  return same ? docs : next
}

// Before the document at `docIndex` (counted with every document present).
export function movePagesToNewDoc(
  docs: DocEntry[],
  refs: PageRef[],
  grabbed: PageRef,
  docIndex: number,
  newDocId: string
): DocEntry[] {
  const group = pagesOf(docs, refs)
  const from = docs.find((d) => d.id === grabbed.docId)
  if (group.length === 0 || !from) return docs
  const moving = new Set(group.map((p) => p.id))
  const before = docs.slice(Math.max(0, docIndex)).map((d) => d.id)
  const remaining = docs
    .map((d) => ({ ...d, pages: d.pages.filter((p) => !moving.has(p.id)) }))
    .filter((d) => d.pages.length > 0)
  const anchor = before.find((id) => remaining.some((d) => d.id === id))
  const at = anchor ? remaining.findIndex((d) => d.id === anchor) : remaining.length
  const name = uniqueDocName(from.name, new Set(remaining.map((d) => d.name)))
  return [...remaining.slice(0, at), { id: newDocId, name, pages: group }, ...remaining.slice(at)]
}

// Ctrl-drag of several pages: copies (new ids, in `copyIds` order) land at
// the drop target; the originals stay.
export function copyPagesInto(
  docs: DocEntry[],
  refs: PageRef[],
  copyIds: string[],
  targetDocId: string,
  index: number
): DocEntry[] {
  const target = docs.find((d) => d.id === targetDocId)
  const group = pagesOf(docs, refs)
  if (!target || group.length === 0) return docs
  // Copying keeps the grabbed page where it was, so the index counts it.
  const copies = group.map((p, i) => ({ ...p, id: copyIds[i] }))
  const anchor = target.pages[Math.max(0, index)]?.id ?? null
  return docs.map((d) =>
    d.id === targetDocId ? { ...d, pages: insertBefore(d.pages, anchor, copies) } : d
  )
}

export function copyPagesToNewDoc(
  docs: DocEntry[],
  refs: PageRef[],
  copyIds: string[],
  grabbed: PageRef,
  docIndex: number,
  newDocId: string
): DocEntry[] {
  const group = pagesOf(docs, refs)
  const from = docs.find((d) => d.id === grabbed.docId)
  if (group.length === 0 || !from) return docs
  const name = uniqueDocName(from.name, new Set(docs.map((d) => d.name)))
  const copies = group.map((p, i) => ({ ...p, id: copyIds[i] }))
  const at = Math.max(0, Math.min(docs.length, docIndex))
  return [...docs.slice(0, at), { id: newDocId, name, pages: copies }, ...docs.slice(at)]
}
