import { clipboard } from 'electron'
import { fileURLToPath } from 'url'

// The clipboard API is asynchronous and W3C-shaped (Electron 44): read()
// lists what the system clipboard offers, by MIME type, plus the platform's
// own formats as `electron application/osclipboard;format="..."`.

const raw = (format: string): string => `electron application/osclipboard;format="${format}"`

async function payload(item: Electron.ClipboardItem, type: string): Promise<Buffer | null> {
  if (!item.types.includes(type)) return null
  try {
    const blob = await item.getType(type)
    return blob instanceof Blob ? Buffer.from(await blob.arrayBuffer()) : null
  } catch {
    return null
  }
}

// file:// URLs, one per line (text/uri-list, Linux file managers' text).
export function fileUrlPaths(text: string): string[] {
  const paths: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const url = line.trim()
    if (!url.startsWith('file://')) continue
    try {
      paths.push(fileURLToPath(url))
    } catch {
      // Not a local file.
    }
  }
  return paths
}

// Explorer's file list (a DROPFILES header, then the names separated by
// NULs and ended by an empty one).
export function dropFiles(data: Buffer): string[] {
  if (data.length < 20) return []
  const start = data.readUInt32LE(0)
  const wide = data.readUInt32LE(16) !== 0
  if (start < 20 || start >= data.length) return []
  const text = wide
    ? data.subarray(start, start + ((data.length - start) & ~1)).toString('ucs2')
    : data.subarray(start).toString('latin1')
  const end = text.indexOf('\0\0')
  return (end === -1 ? text : text.slice(0, end)).split('\0').filter(Boolean)
}

// Files copied in Explorer, Finder or a Linux file manager.
export async function clipboardFilePaths(): Promise<string[]> {
  const items = await clipboard.read().catch(() => [])
  for (const item of items) {
    const uris = await payload(item, 'text/uri-list')
    if (uris) {
      const paths = fileUrlPaths(uris.toString('utf8'))
      if (paths.length > 0) return paths
    }
    if (process.platform === 'win32') {
      const drop = await payload(item, raw('CF_HDROP'))
      const dropped = drop ? dropFiles(drop) : []
      if (dropped.length > 0) return dropped
      const name = await payload(item, raw('FileNameW'))
      const path = name?.toString('ucs2').replace(/\0+$/g, '')
      if (path) return [path]
    }
    if (process.platform === 'darwin') {
      const plist = await payload(item, raw('NSFilenamesPboardType'))
      const paths = [
        ...(plist?.toString('utf8') ?? '').matchAll(/<string>([\s\S]*?)<\/string>/g)
      ].map((m) => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
      if (paths.length > 0) return paths
      const url = await payload(item, raw('public.file-url'))
      if (url) return fileUrlPaths(url.toString('utf8'))
    }
  }
  if (process.platform === 'linux') return fileUrlPaths(await clipboard.readText().catch(() => ''))
  return []
}

const FILE_LISTS = [
  'text/uri-list',
  raw('CF_HDROP'),
  raw('FileNameW'),
  raw('NSFilenamesPboardType')
]

// Edit → Paste. Chromium's own paste reads a copied file list too, and in
// Electron 44 that crashes the app when a file name is not ASCII (seen on
// Linux; not worth the risk elsewhere). Files are PDFx's to paste (as
// documents), so the built-in paste only runs for text and pictures.
export async function safePaste(contents: Electron.WebContents): Promise<void> {
  const items = await clipboard.read().catch(() => [])
  if (items.some((item) => item.types.some((t) => FILE_LISTS.includes(t)))) return
  if (!contents.isDestroyed()) contents.paste()
}

// A picture copied from another program, as PNG.
export async function clipboardImage(): Promise<Uint8Array | null> {
  const items = await clipboard.read().catch(() => [])
  for (const item of items) {
    const png = await payload(item, 'image/png')
    if (png && png.length > 0) return new Uint8Array(png)
  }
  return null
}
