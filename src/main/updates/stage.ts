import { createHash } from 'crypto'
// original-fs: Electron's fs treats *.asar files as folders, and an update
// carries resources/app.asar that must be written and checked as a file.
import originalFs from 'original-fs'
import { dirname, join } from 'path'
import { net } from 'electron'
import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate'
import { parseStamp, safeEntryName } from './local'
import { compareVersions } from './version'

const { closeSync, createReadStream, createWriteStream, mkdirSync, openSync, writeSync } =
  originalFs
const { mkdir, readFile, stat } = originalFs.promises

export type Progress = (done: number, total: number | null) => void

// The server answered, but not with the file (rate limit, missing asset).
export class HttpError extends Error {
  constructor(readonly status: number) {
    super(
      status === 403 || status === 429
        ? 'GitHub is limiting requests for now, try again in an hour'
        : `the server answered ${status}`
    )
  }
}

// Chromium's network stack: the system proxy, as in the browser.
async function get(url: string): Promise<Response> {
  const response = await net.fetch(url, {
    headers: { Accept: 'application/vnd.github+json, application/octet-stream' }
  })
  if (!response.ok) throw new HttpError(response.status)
  return response
}

export async function getJson(location: string): Promise<unknown> {
  if (!location.startsWith('https://')) return JSON.parse(await readFile(location, 'utf8'))
  return (await get(location)).json()
}

// Copies the ZIP (https URL or a local file) to `target`; returns its SHA-256.
export async function fetchZip(
  location: string,
  target: string,
  progress: Progress
): Promise<string> {
  await mkdir(dirname(target), { recursive: true })
  const hash = createHash('sha256')
  const out = createWriteStream(target)
  const write = (chunk: Uint8Array): Promise<void> =>
    new Promise((resolve, reject) => {
      hash.update(chunk)
      out.write(chunk, (error) => (error ? reject(error) : resolve()))
    })
  let done = 0
  try {
    if (location.startsWith('https://')) {
      const response = await get(location)
      const length = Number(response.headers.get('content-length'))
      const total = Number.isFinite(length) && length > 0 ? length : null
      const reader = response.body!.getReader()
      for (;;) {
        const { done: end, value } = await reader.read()
        if (end) break
        await write(value)
        progress((done += value.length), total)
      }
    } else {
      const total = (await stat(location)).size
      for await (const chunk of createReadStream(location, { highWaterMark: 1 << 20 })) {
        await write(chunk as Buffer)
        progress((done += (chunk as Buffer).length), total)
      }
    }
  } finally {
    await new Promise<void>((resolve) => out.end(resolve))
  }
  return hash.digest('hex')
}

// Streams the archive into `dir`; nothing is held in memory but one chunk.
export async function extractZip(zipPath: string, dir: string): Promise<void> {
  mkdirSync(dir, { recursive: true })
  let failure: Error | null = null
  const unzip = new Unzip((entry) => {
    if (failure) return
    if (!safeEntryName(entry.name)) {
      failure = new Error(`unexpected path in the update: ${entry.name}`)
      return
    }
    const path = join(dir, entry.name)
    if (entry.name.endsWith('/')) {
      mkdirSync(path, { recursive: true })
      return
    }
    mkdirSync(dirname(path), { recursive: true })
    const fd = openSync(path, 'w')
    entry.ondata = (error, chunk, final) => {
      if (error) {
        failure = error
        closeSync(fd)
        return
      }
      writeSync(fd, chunk)
      if (final) closeSync(fd)
    }
    entry.start()
  })
  unzip.register(UnzipInflate)
  unzip.register(UnzipPassThrough)
  for await (const chunk of createReadStream(zipPath, { highWaterMark: 1 << 20 })) {
    unzip.push(chunk as Buffer)
    if (failure) throw failure
  }
  unzip.push(new Uint8Array(0), true)
  if (failure) throw failure
}

// An unpacked release has the program and its stamp; the stamp must name the
// version that was offered.
export async function verifyUnpacked(dir: string, version: string): Promise<void> {
  for (const part of ['pdfx.exe', join('resources', 'app.asar')]) {
    await stat(join(dir, part)).catch(() => {
      throw new Error(`the update is incomplete: ${part} is missing`)
    })
  }
  const stamp = parseStamp(await readFile(join(dir, 'version.json'), 'utf8').catch(() => ''))
  if (!stamp || compareVersions(stamp.version, version) !== 0) {
    throw new Error('the unpacked update has a different version')
  }
}
