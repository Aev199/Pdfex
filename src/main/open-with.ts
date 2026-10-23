import { app, shell } from 'electron'
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { mkdir, writeFile, readdir, stat, unlink, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { isGranted } from './source-files'

const execFileAsync = promisify(execFile)

export interface ExternalApp {
  name: string
  path: string
}

export type OpenAction =
  | { type: 'default' }
  | { type: 'explorer' }
  | { type: 'pick' }
  | { type: 'app'; path: string }

export type OpenSource = { path: string } | { bytes: Uint8Array; name: string }

const isWin = process.platform === 'win32'
const MAX_OPEN_BYTES = 1024 * 1024 * 1024 // 1 GiB
// Temp exports are one-shot handoffs to another app; keep them briefly so an app
// that re-reads the file still finds it, then reclaim the space.
const PRUNE_AFTER_MS = 60 * 60 * 1000 // 1 hour

const RUNDLL32 = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'rundll32.exe')

// Well-known desktop apps worth surfacing as one-click "Open with" targets.
const KNOWN_APPS: { name: string; exe: string }[] = [
  { name: 'Google Chrome', exe: 'chrome.exe' },
  { name: 'Microsoft Edge', exe: 'msedge.exe' },
  { name: 'Firefox', exe: 'firefox.exe' },
  { name: 'Inkscape', exe: 'inkscape.exe' },
  { name: 'Adobe Acrobat', exe: 'Acrobat.exe' },
  { name: 'Acrobat Reader', exe: 'AcroRd32.exe' }
]

const APP_PATHS_ROOTS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths',
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths'
]

// Only executables we resolved ourselves may be spawned, so a compromised
// renderer can't turn "open with" into an arbitrary-process launcher.
let allowedPaths = new Set<string>()

export async function queryAppPath(exe: string): Promise<string | null> {
  for (const root of APP_PATHS_ROOTS) {
    try {
      const { stdout } = await execFileAsync('reg', ['query', `${root}\\${exe}`, '/ve'])
      const match = stdout.match(/REG_SZ\s+(.+)/)
      if (match) {
        const resolved = match[1].trim().replace(/^"|"$/g, '')
        if (resolved && existsSync(resolved)) return resolved
      }
    } catch {
      // Key missing under this root; try the next.
    }
  }
  return null
}

export async function listExternalApps(): Promise<ExternalApp[]> {
  if (!isWin) {
    allowedPaths = new Set()
    return []
  }
  const found: ExternalApp[] = []
  const seen = new Set<string>()
  for (const { name, exe } of KNOWN_APPS) {
    const path = await queryAppPath(exe)
    if (path && !seen.has(path)) {
      seen.add(path)
      found.push({ name, path })
    }
  }
  allowedPaths = new Set(found.map((a) => a.path))
  return found
}

const openDir = (): string => join(app.getPath('temp'), 'pdfx-open')
const ILLEGAL_FILENAME = /["*/:<>?\\|]/g

async function pruneOld(dir: string): Promise<void> {
  try {
    const now = Date.now()
    for (const entry of await readdir(dir)) {
      const p = join(dir, entry)
      try {
        const info = await stat(p)
        if (now - info.mtimeMs > PRUNE_AFTER_MS) await unlink(p)
      } catch {
        // ignore files that vanished or are locked
      }
    }
  } catch {
    // dir doesn't exist yet
  }
}

// Best-effort wipe of the temp exports handed to other apps (startup/quit).
export async function cleanupTempExports(): Promise<void> {
  const tmp = app.getPath('temp')
  for (const dir of ['pdfx-open', 'pdfx-print', 'pdfx-office']) {
    // Ignore failures: nothing to clean, or files locked by another app.
    await rm(join(tmp, dir), { recursive: true, force: true }).catch(() => {})
  }
}

async function writeTemp(name: string, bytes: Uint8Array): Promise<string> {
  const dir = openDir()
  await mkdir(dir, { recursive: true })
  await pruneOld(dir)
  let base = (name || 'document').replace(ILLEGAL_FILENAME, '-').trim() || 'document'
  if (!/\.pdf$/i.test(base)) base += '.pdf'
  const target = join(dir, base)
  await writeFile(target, bytes)
  return target
}

// Resolve the concrete file to act on: an existing on-disk original, or a
// freshly written temp export. Also used for Explorer drag-out.
export async function resolveFile(source: OpenSource): Promise<string> {
  if ('path' in source) {
    // Only files the user opened; never an arbitrary path from the renderer.
    if (!isGranted(source.path) || !existsSync(source.path)) {
      throw new Error('open-external: file not found')
    }
    return source.path
  }
  if (!ArrayBuffer.isView(source.bytes) || source.bytes.byteLength > MAX_OPEN_BYTES) {
    throw new Error('open-external: invalid payload')
  }
  return writeTemp(source.name, source.bytes)
}

// Launch a detached child that outlives us, and never let a failed launch throw
// an uncaught exception into the main process (that would strand the
// single-instance lock and make the app un-relaunchable).
function launchDetached(exe: string, args: string[]): void {
  try {
    const child = spawn(exe, args, { detached: true, stdio: 'ignore' })
    child.on('error', (error) => console.error('open-external: launch failed', exe, error))
    child.unref()
  } catch (error) {
    console.error('open-external: spawn threw', exe, error)
  }
}

export async function openExternal(action: OpenAction, source: OpenSource): Promise<void> {
  const file = await resolveFile(source)

  switch (action.type) {
    case 'explorer':
      shell.showItemInFolder(file)
      return
    case 'default': {
      const error = await shell.openPath(file)
      if (error) throw new Error(error)
      return
    }
    case 'pick':
      if (isWin) {
        launchDetached(RUNDLL32, ['shell32.dll,OpenAs_RunDLL', file])
      } else {
        const error = await shell.openPath(file)
        if (error) throw new Error(error)
      }
      return
    case 'app': {
      if (!allowedPaths.has(action.path)) {
        await listExternalApps()
        if (!allowedPaths.has(action.path)) throw new Error('open-external: app not allowed')
      }
      launchDetached(action.path, [file])
      return
    }
    default:
      throw new Error('open-external: unknown action')
  }
}
