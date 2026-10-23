import { readdir } from 'fs/promises'
import { join } from 'path'
import { readZipEntry } from './zip-entry'
import { compareVersions } from './version'
import type { UpdateOffer } from '../../preload/app-types'

// Pieces of the updater that need no Electron (unit-tested).

export interface Stamp {
  version: string
  commit: string
  channel: string
}

export function parseStamp(text: string): Stamp | null {
  try {
    const raw = JSON.parse(text) as Record<string, unknown>
    if (typeof raw.version !== 'string' || !raw.version) return null
    return {
      version: raw.version,
      commit: typeof raw.commit === 'string' ? raw.commit : '',
      channel: typeof raw.channel === 'string' ? raw.channel : ''
    }
  } catch {
    return null
  }
}

// Entry names must stay inside the target folder.
export function safeEntryName(name: string): boolean {
  if (!name || name.includes('\\') || name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return false
  return name.split('/').every((part) => part !== '..' && part !== '.')
}

const DOWNLOADED = /^pdfx-windows-portable.*\.zip$/i

// The newest PDFx ZIP in a folder (the browser's Downloads) that is newer
// than `current`; its version comes from version.json inside the archive.
export async function findDownloaded(folder: string, current: string): Promise<UpdateOffer | null> {
  const names = await readdir(folder).catch(() => [] as string[])
  let best: UpdateOffer | null = null
  for (const name of names.filter((n) => DOWNLOADED.test(n))) {
    const path = join(folder, name)
    const entry = await readZipEntry(path, 'version.json').catch(() => null)
    const stamp = entry && parseStamp(entry.toString('utf8'))
    if (!stamp || compareVersions(stamp.version, current) <= 0) continue
    if (best && compareVersions(stamp.version, best.version) <= 0) continue
    best = {
      version: stamp.version,
      commit: stamp.commit,
      notes: [],
      sha256: '',
      url: path,
      page: folder,
      prerelease: stamp.channel === 'beta'
    }
  }
  return best
}
