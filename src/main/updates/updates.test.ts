import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { strToU8, zipSync } from 'fflate'
import { compareVersions } from './version'
import { offerFrom, parseManifest, pickRelease, ZIP_ASSET } from './releases'
import { readZipEntry } from './zip-entry'
import { findDownloaded, parseStamp, safeEntryName } from './local'

const SHA = 'a'.repeat(64)
const release = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  html_url: `https://github.com/x/releases/${tag}`,
  assets: [
    { name: ZIP_ASSET, browser_download_url: `https://dl/${tag}.zip` },
    { name: 'latest.json', browser_download_url: `https://dl/${tag}.json` }
  ],
  ...extra
})

describe('versions', () => {
  it('compares numerically, ignoring v and suffixes', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1)
    expect(compareVersions('v1.0.3', '1.0.3')).toBe(0)
    expect(compareVersions('1.0', '1.0.1')).toBe(-1)
    expect(compareVersions('1.0.0-dev', '1.0.1')).toBe(-1)
  })
})

describe('releases', () => {
  const list = [
    release('v1.0.3'),
    release('v1.0.12', { prerelease: true }),
    release('v1.0.20', { draft: true }),
    release('beta', { prerelease: true }),
    { ...release('v1.0.30'), assets: [] }
  ]

  it('stable takes the newest full release, beta also pre-releases', () => {
    expect(pickRelease(list, 'stable')?.version).toBe('1.0.3')
    expect(pickRelease(list, 'beta')?.version).toBe('1.0.12')
    expect(pickRelease([], 'stable')).toBeNull()
  })

  it('latest.json must be complete and match its release', () => {
    const candidate = pickRelease(list, 'stable')!
    const manifest = parseManifest({ version: '1.0.3', sha256: SHA.toUpperCase(), notes: ['a', 1] })
    expect(offerFrom(candidate, manifest)).toMatchObject({
      version: '1.0.3',
      sha256: SHA,
      notes: ['a'],
      url: 'https://dl/v1.0.3.zip'
    })
    expect(() => parseManifest({ version: '1.0.3', sha256: 'short' })).toThrow()
    expect(() => offerFrom(candidate, parseManifest({ version: '1.0.4', sha256: SHA }))).toThrow()
    expect(() => pickRelease({ message: 'rate limited' }, 'stable')).toThrow()
  })
})

describe('local update files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pdfx-update-'))
  const stamp = (version: string) =>
    strToU8(JSON.stringify({ version, commit: 'c', channel: 'stable' }))
  writeFileSync(
    join(dir, 'PDFx-Windows-Portable.zip'),
    zipSync({ 'pdfx.exe': strToU8('MZ'), 'version.json': stamp('1.0.7') })
  )
  writeFileSync(
    join(dir, 'PDFx-Windows-Portable (1).zip'),
    zipSync({ 'version.json': [stamp('1.0.9'), { level: 0 }] })
  )
  writeFileSync(join(dir, 'other.zip'), zipSync({ 'version.json': stamp('9.0.0') }))
  writeFileSync(join(dir, 'PDFx-Windows-Portable (2).zip'), 'not a zip')

  it('reads one entry of a ZIP, stored or deflated', async () => {
    const entry = await readZipEntry(join(dir, 'PDFx-Windows-Portable.zip'), 'version.json')
    expect(parseStamp(entry!.toString('utf8'))?.version).toBe('1.0.7')
    expect(await readZipEntry(join(dir, 'PDFx-Windows-Portable.zip'), 'missing')).toBeNull()
    expect(
      await readZipEntry(join(dir, 'PDFx-Windows-Portable (2).zip'), 'version.json')
    ).toBeNull()
  })

  it('finds the newest PDFx ZIP in Downloads that is newer than this version', async () => {
    expect((await findDownloaded(dir, '1.0.5'))?.version).toBe('1.0.9')
    expect(await findDownloaded(dir, '1.0.9')).toBeNull()
    expect(await findDownloaded(join(dir, 'nope'), '1.0.0')).toBeNull()
  })

  it('refuses entry names that leave the folder', () => {
    expect(safeEntryName('resources/app.asar')).toBe(true)
    expect(safeEntryName('../evil.exe')).toBe(false)
    expect(safeEntryName('a/../../b')).toBe(false)
    expect(safeEntryName('/etc/x')).toBe(false)
    expect(safeEntryName('C:/x')).toBe(false)
    expect(safeEntryName('a\\b')).toBe(false)
  })
})
