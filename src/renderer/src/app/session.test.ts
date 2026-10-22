import { describe, expect, it, vi } from 'vitest'

vi.mock('../pdfx/source', () => ({ loadSource: vi.fn() }))

import { serializeSession } from './session'
import { emptySnapshot, newWorkspace } from './workspaces'
import type { DocEntry, PdfSource } from '../types'

const onDisk = {
  id: 'disk-1',
  path: 'C:\\docs\\report.pdf',
  byteLength: 10,
  mtimeMs: 5,
  pristine: true
} as PdfSource
const pasted = { id: 'mem-1', bytes: new Uint8Array(3), byteLength: 3 } as PdfSource
const doc: DocEntry = {
  id: 'd1',
  name: 'Отчёт',
  pages: [
    { id: 'p1', source: onDisk, pageIndex: 0, width: 595, height: 842 },
    { id: 'p2', source: pasted, pageIndex: 0, width: 595, height: 842 }
  ]
}

describe('serializeSession', () => {
  it('references files by path, stores in-memory documents as blobs', () => {
    const ws = newWorkspace('Tab 1')
    const snapshot = {
      ...emptySnapshot([doc]),
      marks: {
        p1: [{ id: 'm', kind: 'highlight' as const, color: 'yellow' as const, rects: [] }],
        gone: []
      },
      formValues: { 'disk-1': { name: 'x' }, stale: { a: 'b' } }
    }
    const { manifest, blobSources } = serializeSession([{ workspace: ws, snapshot }], ws.id)
    expect(manifest.sources).toEqual([
      { id: 'disk-1', path: 'C:\\docs\\report.pdf', byteLength: 10, mtimeMs: 5, blob: false },
      { id: 'mem-1', path: undefined, byteLength: 3, mtimeMs: undefined, blob: true }
    ])
    expect(blobSources).toEqual([pasted])
    const saved = manifest.workspaces[0]
    expect(saved.docs[0].pages.map((p) => p.source)).toEqual(['disk-1', 'mem-1'])
    // Annotations of pages and values of sources that are gone are dropped.
    expect(Object.keys(saved.marks)).toEqual(['p1'])
    expect(Object.keys(saved.formValues)).toEqual(['disk-1'])
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest)
  })
})
