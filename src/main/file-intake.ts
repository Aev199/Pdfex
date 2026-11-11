import { basename, join, resolve } from 'path'
import { rememberOpened } from './recent'
import { existsSync } from 'fs'
import { readFile, readdir, stat } from 'fs/promises'
import { grantReadPath } from './source-files'

export interface OpenedFile {
  name: string
  data: Uint8Array
  path?: string
  // Size and modification time when read, so a later re-read can tell
  // whether the file changed on disk in the meantime.
  size?: number
  mtimeMs?: number
}

export const IMPORTABLE =
  /\.(pdf|pdfx|pdfxs|docx?|docm|dotx?|dotm|odt|xlsx?|xlsm|xlsb|xltx?|xltm|ods|pptx?|pptm|ppsx?|potx?|odp|png|jpe?g|webp|gif|bmp|avif|txt|rtf|svg|html?)$/i

// Documents named on a command line (or dropped on pdfx.exe), made absolute against the directory that
// command ran in (a second launch's cwd differs from ours).
export function collectFileArgs(argv: string[], cwd = process.cwd()): string[] {
  return argv
    .filter((arg) => importable(arg))
    .map((arg) => resolve(cwd, arg))
    .filter((path) => existsSync(path))
}

export async function readFiles(paths: string[]): Promise<OpenedFile[]> {
  rememberOpened(paths)
  return Promise.all(
    paths.map(async (p) => {
      const info = await stat(p)
      const data = new Uint8Array(await readFile(p))
      grantReadPath(p)
      return { name: basename(p), data, path: p, size: info.size, mtimeMs: info.mtimeMs }
    })
  )
}

export const importable = (p: string): boolean => IMPORTABLE.test(p) && !basename(p).startsWith('.')

// Bound a single drag-drop expansion so a deeply nested or pathological directory
// tree can't make the renderer read an unbounded number of files into memory.
const MAX_DROP_FILES = 10_000

export async function expandDropPaths(paths: string[]): Promise<string[]> {
  const out: string[] = []
  for (const p of paths) {
    if (out.length >= MAX_DROP_FILES) break
    try {
      const info = await stat(p)
      if (info.isDirectory()) {
        const entries = await readdir(p, { recursive: true, withFileTypes: true })
        out.push(
          // isFile() is false for symlinks and directories, so symlinked entries
          // are skipped and the recursive walk never follows a link out of the tree.
          ...entries
            .filter((e) => e.isFile())
            .map((e) => join(e.parentPath ?? p, e.name))
            .filter(importable)
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
        )
      } else if (info.isFile() && importable(p)) {
        out.push(p)
      }
    } catch {
      continue
    }
  }
  return out.slice(0, MAX_DROP_FILES)
}
