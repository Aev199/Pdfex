import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, sanitize } from './settings'

describe('settings file', () => {
  it('keeps known values and drops the rest', () => {
    expect(sanitize(null)).toEqual(DEFAULT_SETTINGS)
    const s = sanitize({ wheel: 'zoom', updateChannel: 'nightly', office: 'libreoffice', junk: 1 })
    expect(s.wheel).toBe('zoom')
    expect(s.updateChannel).toBe('stable')
    expect(s.office).toBe('libreoffice')
    expect('junk' in s).toBe(false)
    expect(sanitize({ ocrLanguage: '../../x' }).ocrLanguage).toBe('rus+eng')
    expect(sanitize({ skippedVersion: '1.0.4', checkedAt: 5 })).toMatchObject({
      skippedVersion: '1.0.4',
      checkedAt: 5
    })
  })
})
