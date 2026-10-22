import { describe, expect, it } from 'vitest'
import {
  deletePages,
  duplicateDoc,
  duplicatePages,
  extractPages,
  pageRange,
  splitDocAt,
  swapSource
} from './selection-ops'
import type { DocEntry, PageEntry, PdfSource } from '../../types'

const source = { id: 'src' } as PdfSource
const page = (id: string): PageEntry => ({ id, source, pageIndex: 0, width: 600, height: 800 })
const doc = (id: string, ...pages: string[]): DocEntry => ({ id, name: id, pages: pages.map(page) })
const ids = (docs: DocEntry[]) => docs.map((d) => `${d.name}:${d.pages.map((p) => p.id).join(',')}`)
const ref = (docId: string, pageId: string) => ({ docId, pageId })

describe('selection ops', () => {
  const docs = [doc('A', 'a1', 'a2', 'a3'), doc('B', 'b1', 'b2')]

  it('duplicates pages right after themselves and reports origins', () => {
    const { docs: next, origins, created } = duplicatePages(docs, [ref('A', 'a2'), ref('B', 'b1')])
    expect(next[0].pages.map((p) => origins.get(p.id) ?? p.id)).toEqual(['a1', 'a2', 'a2', 'a3'])
    expect(next[1].pages.map((p) => origins.get(p.id) ?? p.id)).toEqual(['b1', 'b1', 'b2'])
    expect(created).toHaveLength(2)
  })

  it('duplicates a document after itself under a new name', () => {
    const { docs: next } = duplicateDoc(docs, 'A')
    expect(next.map((d) => d.name)).toEqual(['A', 'A (copy)', 'B'])
    expect(next[1].pages[0].id).not.toBe('a1')
  })

  it('deletes pages and drops emptied documents', () => {
    expect(ids(deletePages(docs, [ref('B', 'b1'), ref('B', 'b2'), ref('A', 'a1')]))).toEqual([
      'A:a2,a3'
    ])
  })

  it('extracts pages in reading order into a document after the source', () => {
    const { docs: next } = extractPages(docs, [ref('B', 'b1'), ref('A', 'a3')])
    expect(ids(next)).toEqual(['A:a1,a2', 'A (extract):a3,b1', 'B:b2'])
  })

  it('extracting a whole document keeps its position', () => {
    const { docs: next } = extractPages(docs, [ref('B', 'b1'), ref('B', 'b2')])
    expect(ids(next)).toEqual(['A:a1,a2,a3', 'B (extract):b1,b2'])
  })

  it('splits a document before the given page', () => {
    expect(ids(splitDocAt(docs, 'A', 'a2'))).toEqual(['A:a1', 'A (part 2):a2,a3', 'B:b1,b2'])
    expect(splitDocAt(docs, 'A', 'a1')).toBe(docs)
  })

  it('ranges across documents in reading order, either direction', () => {
    expect(pageRange(docs, ref('B', 'b1'), ref('A', 'a2')).map((r) => r.pageId)).toEqual([
      'a2',
      'a3',
      'b1'
    ])
  })
})

describe('swapSource', () => {
  const old = { id: 'old', pdf: { numPages: 3 } } as unknown as PdfSource
  const next = { id: 'new', pdf: { numPages: 4 } } as unknown as PdfSource
  const pg = (id: string, i: number, src = old): PageEntry => ({
    id,
    source: src,
    pageIndex: i,
    width: 1,
    height: 1
  })
  const sizes = (n: number) => Array.from({ length: n }, () => ({ width: 2, height: 3 }))

  it('keeps page ids and appends growth to a whole-file document', () => {
    const docs = [{ id: 'D', name: 'D', pages: [pg('p0', 0), pg('p1', 1), pg('p2', 2)] }]
    const out = swapSource(docs, 'old', next, sizes(4))
    expect(out[0].pages.map((p) => p.id).slice(0, 3)).toEqual(['p0', 'p1', 'p2'])
    expect(out[0].pages).toHaveLength(4)
    expect(out[0].pages.every((p) => p.source === next && p.width === 2)).toBe(true)
  })

  it('drops pages past the new end and leaves other sources alone', () => {
    const other = { id: 'x' } as PdfSource
    const docs = [{ id: 'D', name: 'D', pages: [pg('p2', 2), pg('q', 0, other), pg('p0', 0)] }]
    const out = swapSource(docs, 'old', next, sizes(2))
    expect(out[0].pages.map((p) => p.id)).toEqual(['q', 'p0'])
  })
})
