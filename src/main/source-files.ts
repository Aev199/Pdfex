import { readFile, stat } from 'fs/promises'
import { resolve } from 'path'

// Files the user opened (dialog, drag-drop, command line, session restore)
// may be read back later by the renderer — to export a document whose bytes
// were dropped from memory, or to check whether the file changed on disk.
// Nothing else is readable: a compromised renderer can't turn this into an
// arbitrary file read.

const granted = new Set<string>()
const key = (path: string): string =>
  process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path)

export function grantReadPath(path: string): void {
  granted.add(key(path))
}

export const isGranted = (path: unknown): path is string =>
  typeof path === 'string' && path.length > 0 && !path.includes('\0') && granted.has(key(path))

export interface FileStamp {
  size: number
  mtimeMs: number
}

export interface SourceRead extends FileStamp {
  data: Uint8Array
}

export async function statSource(path: unknown): Promise<FileStamp | null> {
  if (!isGranted(path)) return null
  try {
    const info = await stat(path)
    return info.isFile() ? { size: info.size, mtimeMs: info.mtimeMs } : null
  } catch {
    return null
  }
}

export async function fileInfo(
  path: unknown
): Promise<{ size: number; createdMs: number; modifiedMs: number } | null> {
  if (!isGranted(path)) return null
  try {
    const info = await stat(path)
    return { size: info.size, createdMs: info.birthtimeMs, modifiedMs: info.mtimeMs }
  } catch {
    return null
  }
}

export async function readSource(path: unknown): Promise<SourceRead | null> {
  const stamp = await statSource(path)
  if (!stamp) return null
  try {
    return { ...stamp, data: new Uint8Array(await readFile(path as string)) }
  } catch {
    return null
  }
}
