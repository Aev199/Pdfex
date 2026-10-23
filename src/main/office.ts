import { app } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { queryAppPath } from './open-with'

// Office documents → PDF with what the user already has installed: Microsoft
// Office driven over COM (PowerShell), the most faithful, or else LibreOffice
// in headless mode. Nothing is bundled and nothing goes online. Macros are
// force-disabled (AutomationSecurity = 3) so opening an untrusted file can't
// run code. Ported from PDFx Plus for Windows; LibreOffice added here.

const execFileAsync = promisify(execFile)

export type OfficeApp = 'word' | 'excel' | 'powerpoint'
export type OfficeCaps = Record<OfficeApp, boolean>

const APP_EXE: Record<OfficeApp, string> = {
  word: 'WINWORD.EXE',
  excel: 'EXCEL.EXE',
  powerpoint: 'POWERPNT.EXE'
}

// Current and 97–2003 formats, templates, macro-enabled files, shows.
const EXT_APP: Record<string, OfficeApp> = {
  doc: 'word',
  docx: 'word',
  docm: 'word',
  dot: 'word',
  dotx: 'word',
  dotm: 'word',
  odt: 'word',
  xls: 'excel',
  xlsx: 'excel',
  xlsm: 'excel',
  xlsb: 'excel',
  xlt: 'excel',
  xltx: 'excel',
  xltm: 'excel',
  ods: 'excel',
  ppt: 'powerpoint',
  pptx: 'powerpoint',
  pptm: 'powerpoint',
  pps: 'powerpoint',
  ppsx: 'powerpoint',
  pot: 'powerpoint',
  potx: 'powerpoint',
  odp: 'powerpoint'
}

const MAX_OFFICE_BYTES = 512 * 1024 * 1024
const CONVERT_TIMEOUT_MS = 5 * 60 * 1000

let capsPromise: Promise<OfficeCaps> | null = null

export function officeCapabilities(): Promise<OfficeCaps> {
  if (process.platform !== 'win32') {
    return Promise.resolve({ word: false, excel: false, powerpoint: false })
  }
  return (capsPromise ??= (async () => ({
    word: (await queryAppPath(APP_EXE.word)) !== null,
    excel: (await queryAppPath(APP_EXE.excel)) !== null,
    powerpoint: (await queryAppPath(APP_EXE.powerpoint)) !== null
  }))())
}

let sofficePromise: Promise<string | null> | null = null

// LibreOffice's soffice, from its App Paths entry or the usual install folders.
export function findSoffice(): Promise<string | null> {
  return (sofficePromise ??= (async () => {
    if (process.platform === 'win32') {
      const registered = await queryAppPath('soffice.exe')
      if (registered) return registered
      for (const root of [process.env['ProgramFiles'], process.env['ProgramFiles(x86)']]) {
        const candidate = root && join(root, 'LibreOffice', 'program', 'soffice.exe')
        if (candidate && existsSync(candidate)) return candidate
      }
      return null
    }
    for (const candidate of [
      '/usr/bin/soffice',
      '/usr/bin/libreoffice',
      '/Applications/LibreOffice.app/Contents/MacOS/soffice'
    ]) {
      if (existsSync(candidate)) return candidate
    }
    return null
  })())
}

// Which converter can take each kind of document, for the user-facing message.
export async function converterFor(kind: OfficeApp): Promise<'office' | 'libreoffice' | null> {
  if ((await officeCapabilities())[kind]) return 'office'
  return (await findSoffice()) ? 'libreoffice' : null
}

// Single quotes inside a PowerShell single-quoted string are doubled.
const psQuote = (p: string): string => `'${p.replace(/'/g, "''")}'`

function conversionScript(kind: OfficeApp, input: string, output: string): string {
  const IN = psQuote(input)
  const OUT = psQuote(output)
  if (kind === 'word') {
    // SaveAs2 wdFormatPDF = 17; Open(ConfirmConversions:=false, ReadOnly:=true)
    return `$ErrorActionPreference='Stop'
$app = New-Object -ComObject Word.Application
try {
  $app.Visible = $false
  $app.DisplayAlerts = 0
  $app.AutomationSecurity = 3
  $doc = $app.Documents.Open(${IN}, $false, $true, $false)
  $doc.SaveAs2(${OUT}, 17)
  $doc.Close(0)
} finally {
  $app.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app)
}`
  }
  if (kind === 'excel') {
    // ExportAsFixedFormat xlTypePDF = 0; Open(UpdateLinks:=0, ReadOnly:=true)
    return `$ErrorActionPreference='Stop'
$app = New-Object -ComObject Excel.Application
try {
  $app.Visible = $false
  $app.DisplayAlerts = $false
  $app.AutomationSecurity = 3
  $wb = $app.Workbooks.Open(${IN}, 0, $true)
  $wb.ExportAsFixedFormat(0, ${OUT})
  $wb.Close($false)
} finally {
  $app.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app)
}`
  }
  // PowerPoint booleans are MsoTriState (msoTrue = -1, msoFalse = 0); the app
  // window cannot be hidden via Visible, so open WithWindow:=msoFalse instead.
  // SaveAs ppSaveAsPDF = 32.
  return `$ErrorActionPreference='Stop'
$app = New-Object -ComObject PowerPoint.Application
try {
  $app.AutomationSecurity = 3
  $pres = $app.Presentations.Open(${IN}, -1, 0, 0)
  $pres.SaveAs(${OUT}, 32)
  $pres.Close()
} finally {
  $app.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app)
}`
}

const tempDir = (): string => join(app.getPath('temp'), 'pdfx-office')

// One conversion at a time: concurrent instances of the same Office app over
// COM step on each other.
let chain: Promise<unknown> = Promise.resolve()

export function officeConvert(ext: string, data: Uint8Array): Promise<Uint8Array> {
  const run = chain.then(() => doConvert(ext, data))
  chain = run.catch(() => {})
  return run
}

async function doConvert(ext: string, data: Uint8Array): Promise<Uint8Array> {
  const kind = EXT_APP[String(ext).toLowerCase()]
  if (!kind) throw new Error(`office-convert: unsupported extension ${ext}`)
  if (!ArrayBuffer.isView(data) || data.byteLength > MAX_OFFICE_BYTES) {
    throw new Error('office-convert: invalid payload')
  }
  const via = await converterFor(kind)
  if (!via) throw new Error(`office-convert: no converter for ${kind}`)

  const dir = tempDir()
  await mkdir(dir, { recursive: true })
  const id = randomUUID()
  const input = join(dir, `${id}.${ext.toLowerCase()}`)
  const output = join(dir, `${id}.pdf`)
  try {
    await writeFile(input, data)
    if (via === 'libreoffice') return await viaLibreOffice(input, dir, id)
    const script = conversionScript(kind, input, output)
    // -EncodedCommand sidesteps every quoting pitfall of nested shells. If the
    // timeout kills PowerShell mid-run, the finally/Quit never executes and an
    // Office process may linger — rare, and the next conversion reuses it.
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { timeout: CONVERT_TIMEOUT_MS, windowsHide: true }
    )
    return new Uint8Array(await readFile(output))
  } finally {
    await rm(input, { force: true }).catch(() => {})
    await rm(output, { force: true }).catch(() => {})
  }
}

// Headless LibreOffice with its own throwaway profile, so it works even
// while the user has LibreOffice open.
async function viaLibreOffice(input: string, dir: string, id: string): Promise<Uint8Array> {
  const soffice = (await findSoffice())!
  const outDir = join(dir, `${id}-out`)
  const profile = join(dir, `${id}-profile`)
  await mkdir(outDir, { recursive: true })
  try {
    await execFileAsync(
      soffice,
      [
        `-env:UserInstallation=file:///${profile.replace(/\\/g, '/')}`,
        '--headless',
        '--norestore',
        '--convert-to',
        'pdf',
        '--outdir',
        outDir,
        input
      ],
      { timeout: CONVERT_TIMEOUT_MS, windowsHide: true }
    )
    const [pdf] = (await readdir(outDir)).filter((f) => f.toLowerCase().endsWith('.pdf'))
    if (!pdf) throw new Error('office-convert: LibreOffice produced no PDF')
    return new Uint8Array(await readFile(join(outDir, pdf)))
  } finally {
    await rm(outDir, { recursive: true, force: true }).catch(() => {})
    await rm(profile, { recursive: true, force: true }).catch(() => {})
  }
}
