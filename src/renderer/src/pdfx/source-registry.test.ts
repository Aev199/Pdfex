import { describe, expect, it, vi } from 'vitest'
import { registerSource, releaseUnused } from './source-registry'
import type { PdfSource } from '../types'

const source = (id: string) =>
  ({ id, pdf: { destroy: vi.fn(() => Promise.resolve()) } }) as unknown as PdfSource

describe('releaseUnused', () => {
  it('destroys only old sources nothing refers to', () => {
    const kept = source('kept')
    const dropped = source('dropped')
    registerSource(kept)
    registerSource(dropped)
    const later = Date.now() + 120_000
    expect(releaseUnused(new Set(['kept']), later)).toBe(1)
    expect(dropped.pdf.destroy).toHaveBeenCalled()
    expect(kept.pdf.destroy).not.toHaveBeenCalled()
  })

  it('spares a fresh source that may still be importing', () => {
    const fresh = source('fresh')
    registerSource(fresh)
    expect(releaseUnused(new Set())).toBe(0)
    expect(fresh.pdf.destroy).not.toHaveBeenCalled()
  })
})
