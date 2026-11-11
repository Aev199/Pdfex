import { describe, expect, it } from 'vitest'
import { copyPagesInto, copyPagesToNewDoc, movePagesInto, movePagesToNewDoc } from './move'
import type { DocEntry } from '../../types'

const page = (id: string) => ({ id }) as DocEntry['pages'][number]
const doc = (id: string, ...ids: string[]): DocEntry => ({ id, name: id, pages: ids.map(page) })
const ids = (docs: DocEntry[]) => docs.map((d) => `${d.id}:${d.pages.map((p) => p.id).join('')}`)

describe('moving several pages at once', () => {
  const docs = [doc('A', 'a', 'b', 'c', 'd', 'e'), doc('B', 'x', 'y')]
  const refs = [
    { docId: 'A', pageId: 'b' },
    { docId: 'A', pageId: 'd' }
  ]

  it('moves the selection, in order, to where the grabbed page was dropped', () => {
    // Grabbed "b"; the strip shows a c d e, the drop goes after "e".
    expect(ids(movePagesInto(docs, refs, 'b', 'A', 4))).toEqual(['A:acebd', 'B:xy'])
    // Before "a".
    expect(ids(movePagesInto(docs, refs, 'd', 'A', 0))).toEqual(['A:bdace', 'B:xy'])
    // Between "x" and "y" of the other document.
    expect(ids(movePagesInto(docs, refs, 'b', 'B', 1))).toEqual(['A:ace', 'B:xbdy'])
  })

  it('leaves everything when dropped where the group already is', () => {
    const together = [doc('A', 'a', 'b', 'd', 'e')]
    expect(movePagesInto(together, refs, 'b', 'A', 1)).toBe(together)
  })

  it('moves to a new document and drops emptied ones', () => {
    const all = [doc('A', 'a'), doc('B', 'x', 'y')]
    const next = movePagesToNewDoc(
      all,
      [
        { docId: 'A', pageId: 'a' },
        { docId: 'B', pageId: 'y' }
      ],
      { docId: 'A', pageId: 'a' },
      2,
      'N'
    )
    expect(ids(next)).toEqual(['B:x', 'N:ay'])
  })

  it('copies with new ids and keeps the originals', () => {
    expect(ids(copyPagesInto(docs, refs, ['1', '2'], 'B', 2))).toEqual(['A:abcde', 'B:xy12'])
    expect(ids(copyPagesToNewDoc(docs, refs, ['1', '2'], refs[0], 0, 'N'))).toEqual([
      'N:12',
      'A:abcde',
      'B:xy'
    ])
  })
})
