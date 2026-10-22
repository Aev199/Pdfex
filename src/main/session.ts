import { app } from 'electron'
import { dirname, isAbsolute, join, relative, resolve } from 'path'
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'fs/promises'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { grantReadPath, isGranted } from './source-files'

// Sessions: the autosaved state of every tab, and .pdfxs files the user saves
// on purpose. Both are the same manifest (JSON written by the renderer, opaque
// here except for its source list) plus "blobs": bytes of documents that
// exist only inside PDFx — pasted, converted, assembled. PDFs opened from disk
// are not copied; they are recorded by path, size and modification time and
// read back from there.
//
// Autosave lives in <userData>/session: session.json (+ session.json.bak, the
// previous good save) and blobs/<source id>.bin. A .pdfxs is a ZIP holding
// session.json and blobs/<id>.bin.

export interface SessionSourceRecord {
  id: string
  // Absolute path of the original file, when it came from one.
  path?: string
  // The same path relative to the .pdfxs file (saved sessions only), tried
  // when the absolute one is gone — a folder moved, a USB drive letter changed.
  relPath?: string
  byteLength: number
  mtimeMs?: number
  // Stored as a blob instead of read from `path`.
  blob?: boolean
}

export interface SessionManifest {
  format: 'pdfx-session'
  version: number
  sources: SessionSourceRecord[]
  [key: string]: unknown
}

export type SourceStatus = 'ok' | 'changed' | 'missing'

export interface LoadedSession {
  manifest: SessionManifest
  bytes: Record<string, Uint8Array>
  status: Record<string, SourceStatus>
  // Where each file-backed source was actually found (may differ from the
  // recorded path when the relative path matched), and its current stamp.
  found: Record<string, { path: string; mtimeMs: number }>
}

const MAX_BLOB_BYTES = 1024 * 1024 * 1024
// Source ids are renderer-made UUIDs; anything else is refused so a blob name
// can never become a path traversal.
const SAFE_ID = /^[0-9a-f][0-9a-f-]{10,60}$/i

const sessionDir = (): string => join(app.getPath('userData'), 'session')
const blobsDir = (): string => join(sessionDir(), 'blobs')
const manifestPath = (): string => join(sessionDir(), 'session.json')
const backupPath = (): string => `${manifestPath()}.bak`

const isManifest = (value: unknown): value is SessionManifest => {
  const m = value as SessionManifest
  return (
    !!m && m.format === 'pdfx-session' && typeof m.version === 'number' && Array.isArray(m.sources)
  )
}

const blobIds = (manifest: SessionManifest): string[] =>
  manifest.sources.filter((s) => s.blob && SAFE_ID.test(s.id)).map((s) => s.id)

// ---- Autosave ---------------------------------------------------------------

// Saves are serialized and collapse to the newest: each manifest is a full
// snapshot, so a queued older one carries nothing the newer one lacks. Blobs
// of superseded saves are merged in so none is lost.
let running = false
let pending: { manifest: SessionManifest; blobs: Record<string, Uint8Array> } | null = null
let waiters: { resolve: () => void; reject: (error: unknown) => void }[] = []
let lastWritten: string | null = null

export async function saveSession(
  manifest: SessionManifest,
  blobs: Record<string, Uint8Array>
): Promise<void> {
  pending = { manifest, blobs: { ...(pending?.blobs ?? {}), ...blobs } }
  if (running) return new Promise((resolve, reject) => waiters.push({ resolve, reject }))
  running = true
  try {
    while (pending) {
      const job = pending
      pending = null
      const settling = waiters
      waiters = []
      try {
        await writeAutosave(job.manifest, job.blobs)
      } catch (error) {
        for (const w of settling) w.reject(error)
        throw error
      }
      for (const w of settling) w.resolve()
    }
  } finally {
    running = false
  }
}

async function writeAtomic(path: string, data: Uint8Array | string): Promise<void> {
  // Write-then-rename: a crash mid-write never leaves a torn file behind.
  await writeFile(`${path}.tmp`, data)
  await rename(`${path}.tmp`, path)
}

async function writeAutosave(
  manifest: SessionManifest,
  blobs: Record<string, Uint8Array>
): Promise<void> {
  if (!isManifest(manifest)) return
  const serialized = JSON.stringify(manifest)
  if (Object.keys(blobs).length === 0 && serialized === lastWritten) return

  await mkdir(blobsDir(), { recursive: true })
  for (const [id, data] of Object.entries(blobs)) {
    if (!SAFE_ID.test(id) || !ArrayBuffer.isView(data) || data.byteLength > MAX_BLOB_BYTES) continue
    const target = join(blobsDir(), `${id}.bin`)
    // A blob never changes under the same id: same size means already there.
    const existing = await stat(target).catch(() => null)
    if (existing?.size === data.byteLength) continue
    await writeAtomic(target, data)
  }
  // Keep the previous good save: if this one is somehow unreadable on the
  // next start, the backup still restores the session.
  await copyFile(manifestPath(), backupPath()).catch(() => {})
  await writeAtomic(manifestPath(), serialized)
  lastWritten = serialized
  await pruneBlobs([manifest])
}

// Delete blob files neither the current nor the backup manifest references.
async function pruneBlobs(keep: SessionManifest[]): Promise<void> {
  const referenced = new Set(keep.flatMap((m) => blobIds(m).map((id) => `${id}.bin`)))
  const backup = await readManifest(backupPath())
  if (backup) for (const id of blobIds(backup)) referenced.add(`${id}.bin`)
  for (const file of await readdir(blobsDir()).catch(() => [] as string[])) {
    if (!referenced.has(file)) await rm(join(blobsDir(), file), { force: true })
  }
}

async function readManifest(path: string): Promise<SessionManifest | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'))
    return isManifest(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function loadAutosave(): Promise<LoadedSession | null> {
  for (const path of [manifestPath(), backupPath()]) {
    const manifest = await readManifest(path)
    if (!manifest) continue
    lastWritten = JSON.stringify(manifest)
    return loadSources(manifest, async (id) => {
      const data = new Uint8Array(await readFile(join(blobsDir(), `${id}.bin`)))
      return data
    })
  }
  return null
}

// ---- Loading sources ----------------------------------------------------------

async function loadSources(
  manifest: SessionManifest,
  readBlob: (id: string) => Promise<Uint8Array>,
  baseDir?: string
): Promise<LoadedSession> {
  const bytes: Record<string, Uint8Array> = {}
  const status: Record<string, SourceStatus> = {}
  const found: LoadedSession['found'] = {}
  for (const source of manifest.sources) {
    if (!source || typeof source.id !== 'string') continue
    try {
      if (source.blob) {
        if (!SAFE_ID.test(source.id)) throw new Error('bad id')
        const data = await readBlob(source.id)
        if (data.byteLength !== source.byteLength) throw new Error('blob size mismatch')
        bytes[source.id] = data
        status[source.id] = 'ok'
        continue
      }
      const candidates = [
        source.path,
        baseDir && source.relPath ? resolve(baseDir, source.relPath) : undefined
      ]
      let located: string | null = null
      for (const candidate of candidates) {
        if (typeof candidate !== 'string' || !isAbsolute(candidate)) continue
        const info = await stat(candidate).catch(() => null)
        if (info?.isFile()) {
          located = candidate
          break
        }
      }
      if (!located) {
        status[source.id] = 'missing'
        continue
      }
      const info = await stat(located)
      const data = new Uint8Array(await readFile(located))
      grantReadPath(located)
      bytes[source.id] = data
      found[source.id] = { path: located, mtimeMs: info.mtimeMs }
      const same =
        info.size === source.byteLength &&
        (source.mtimeMs === undefined || Math.abs(info.mtimeMs - source.mtimeMs) <= 1)
      status[source.id] = same ? 'ok' : 'changed'
    } catch {
      status[source.id] = 'missing'
    }
  }
  return { manifest, bytes, status, found }
}

// ---- .pdfxs files ---------------------------------------------------------------

// The renderer can only write a session to a path the save dialog returned
// and only open one the user opened; paths inside it are read here, in main.
export async function writeSessionFile(
  path: string,
  manifest: SessionManifest,
  blobs: Record<string, Uint8Array>
): Promise<void> {
  if (typeof path !== 'string' || !isAbsolute(path) || !isManifest(manifest)) {
    throw new Error('save-session: invalid request')
  }
  const base = dirname(path)
  const withRelative: SessionManifest = {
    ...manifest,
    sources: manifest.sources.map((s) =>
      s.path && !s.blob ? { ...s, relPath: relative(base, s.path) } : s
    )
  }
  const files: Record<string, Uint8Array> = {
    'session.json': strToU8(JSON.stringify(withRelative, null, 1))
  }
  for (const id of blobIds(manifest)) {
    const data = blobs[id]
    if (!ArrayBuffer.isView(data) || data.byteLength > MAX_BLOB_BYTES) {
      throw new Error('save-session: missing document data')
    }
    // PDFs are already compressed; storing them avoids a slow, useless deflate.
    files[`blobs/${id}.bin`] = data
  }
  await writeAtomic(path, zipSync(files, { level: 0 }))
}

export async function openSessionFile(path: unknown): Promise<LoadedSession> {
  if (!isGranted(path)) throw new Error('open-session: file was not opened by the user')
  const entries = unzipSync(new Uint8Array(await readFile(path)))
  const raw = entries['session.json']
  const manifest = raw ? (JSON.parse(strFromU8(raw)) as unknown) : null
  if (!isManifest(manifest)) throw new Error('open-session: not a PDFx session')
  return loadSources(
    manifest,
    async (id) => {
      const data = entries[`blobs/${id}.bin`]
      if (!data) throw new Error('missing blob')
      return data
    },
    dirname(path)
  )
}
