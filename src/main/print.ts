import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { mkdir, rm, writeFile } from 'fs/promises'

// Printing: the renderer draws each page (with its marks and shapes) to a
// JPEG and spools them here; a hidden window lays them out one per sheet,
// each at its own paper size, and opens the system print dialog. Going
// through images keeps printing independent of any PDF plug-in and prints
// exactly what is on screen.

interface Job {
  dir: string
  pages: { file: string; widthPt: number; heightPt: number }[]
}

const jobs = new Map<string, Job>()
const SAFE_JOB = /^[0-9a-f-]{8,64}$/i
const MAX_PAGE_BYTES = 64 * 1024 * 1024

const printDir = (id: string): string => join(app.getPath('temp'), 'pdfx-print', id)

export async function spoolPage(
  id: string,
  index: number,
  jpeg: Uint8Array,
  widthPt: number,
  heightPt: number
): Promise<void> {
  if (!SAFE_JOB.test(id) || !Number.isInteger(index) || index < 0 || index > 100_000) {
    throw new Error('print: invalid page')
  }
  if (!ArrayBuffer.isView(jpeg) || jpeg.byteLength > MAX_PAGE_BYTES)
    throw new Error('print: invalid image')
  let job = jobs.get(id)
  if (!job) {
    job = { dir: printDir(id), pages: [] }
    jobs.set(id, job)
    await mkdir(job.dir, { recursive: true })
  }
  const file = `p${index}.jpg`
  await writeFile(join(job.dir, file), jpeg)
  job.pages[index] = { file, widthPt: Number(widthPt) || 595, heightPt: Number(heightPt) || 842 }
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export async function runPrint(id: string, title: string): Promise<boolean> {
  const job = jobs.get(id)
  jobs.delete(id)
  if (!job) return false
  const pages = job.pages.filter(Boolean)
  // One named @page per distinct size, so mixed A4 / A3 / A1 sheets each
  // print at their own size (the printer driver still decides how to fit).
  const sizes = new Map<string, string>()
  for (const p of pages) {
    const key = `${Math.round(p.widthPt)}x${Math.round(p.heightPt)}`
    if (!sizes.has(key)) sizes.set(key, `s${sizes.size}`)
  }
  const css = [...sizes]
    .map(([key, name]) => {
      const [w, h] = key.split('x')
      return `@page ${name} { size: ${w}pt ${h}pt; margin: 0 }`
    })
    .join('\n')
  const body = pages
    .map((p) => {
      const name = sizes.get(`${Math.round(p.widthPt)}x${Math.round(p.heightPt)}`)
      return `<div class="sheet" style="page:${name};width:${p.widthPt}pt;height:${p.heightPt}pt"><img src="${p.file}"></div>`
    })
    .join('\n')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
${css}
html, body { margin: 0; padding: 0; background: #fff; }
.sheet { break-after: page; overflow: hidden; }
.sheet:last-child { break-after: auto; }
.sheet img { display: block; width: 100%; height: 100%; }
</style></head><body>${body}</body></html>`
  const file = join(job.dir, 'print.html')
  await writeFile(file, html)

  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, javascript: false }
  })
  try {
    await win.loadFile(file)
    return await new Promise<boolean>((resolve) => {
      win.webContents.print({ silent: false, printBackground: true }, (success) => resolve(success))
    })
  } finally {
    win.destroy()
    await rm(job.dir, { recursive: true, force: true }).catch(() => {})
  }
}
