import { app, shell } from 'electron'
import { execFile } from 'child_process'
import { writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { getSettings, onSettingsChanged, rememberForUpdater, updaterMemory } from './settings'

// "Open PDFs in PDFx" on Windows, for the current user only (HKCU, no
// administrator rights): PDFx is offered in Open with and gets an "Open in
// PDFx" item on PDFs in Explorer; .pdfxs and .pdfx open in it directly.
// Windows lets only the user choose the default PDF program, so PDFx then
// opens its page in Settings → Default apps. Turning the setting off removes
// every key written here. The portable folder can move, so the command is
// rewritten whenever pdfx.exe starts from another place.

const PROG_ID = 'PDFx.Document'
const SESSION_PROG_ID = 'PDFx.Session'
const CLASSES = 'HKEY_CURRENT_USER\\Software\\Classes'
const CAPABILITIES = 'Software\\PDFx\\Capabilities'

// The command Explorer runs: the packaged exe, or electron + the app folder
// when running from source (tests).
export function openCommand(exe: string, appPath: string | null): string {
  return appPath ? `"${exe}" "${appPath}" "%1"` : `"${exe}" "%1"`
}

const regString = (value: string): string =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

export function registrationFile(exe: string, command: string): string {
  const icon = regString(`${exe},0`)
  const open = regString(command)
  return [
    'Windows Registry Editor Version 5.00',
    '',
    `[${CLASSES}\\${PROG_ID}]`,
    `@=${regString('PDF Document')}`,
    `"FriendlyTypeName"=${regString('PDF Document')}`,
    `[${CLASSES}\\${PROG_ID}\\DefaultIcon]`,
    `@=${icon}`,
    `[${CLASSES}\\${PROG_ID}\\shell\\open\\command]`,
    `@=${open}`,
    `[${CLASSES}\\${SESSION_PROG_ID}]`,
    `@=${regString('PDFx session')}`,
    `[${CLASSES}\\${SESSION_PROG_ID}\\DefaultIcon]`,
    `@=${icon}`,
    `[${CLASSES}\\${SESSION_PROG_ID}\\shell\\open\\command]`,
    `@=${open}`,
    `[${CLASSES}\\.pdf\\OpenWithProgids]`,
    `"${PROG_ID}"=""`,
    `[${CLASSES}\\.pdfx]`,
    `@=${regString(PROG_ID)}`,
    `[${CLASSES}\\.pdfxs]`,
    `@=${regString(SESSION_PROG_ID)}`,
    `[${CLASSES}\\SystemFileAssociations\\.pdf\\shell\\PDFx]`,
    `@=${regString('Open in PDFx')}`,
    `"Icon"=${icon}`,
    `[${CLASSES}\\SystemFileAssociations\\.pdf\\shell\\PDFx\\command]`,
    `@=${open}`,
    `[${CLASSES}\\Applications\\pdfx.exe\\shell\\open\\command]`,
    `@=${open}`,
    `[${CLASSES}\\Applications\\pdfx.exe\\SupportedTypes]`,
    `".pdf"=""`,
    `".pdfx"=""`,
    `".pdfxs"=""`,
    `[HKEY_CURRENT_USER\\${CAPABILITIES}]`,
    `"ApplicationName"=${regString('PDFx')}`,
    `"ApplicationDescription"=${regString('PDF viewer and editor')}`,
    `[HKEY_CURRENT_USER\\${CAPABILITIES}\\FileAssociations]`,
    `".pdf"=${regString(PROG_ID)}`,
    `".pdfx"=${regString(PROG_ID)}`,
    `".pdfxs"=${regString(SESSION_PROG_ID)}`,
    `[HKEY_CURRENT_USER\\Software\\RegisteredApplications]`,
    `"PDFx"=${regString(CAPABILITIES)}`,
    ''
  ].join('\r\n')
}

export function removalFile(): string {
  return [
    'Windows Registry Editor Version 5.00',
    '',
    `[-${CLASSES}\\${PROG_ID}]`,
    `[-${CLASSES}\\${SESSION_PROG_ID}]`,
    `[${CLASSES}\\.pdf\\OpenWithProgids]`,
    `"${PROG_ID}"=-`,
    `[-${CLASSES}\\SystemFileAssociations\\.pdf\\shell\\PDFx]`,
    `[-${CLASSES}\\Applications\\pdfx.exe]`,
    // PDFx's own file types.
    `[-${CLASSES}\\.pdfx]`,
    `[-${CLASSES}\\.pdfxs]`,
    `[-HKEY_CURRENT_USER\\Software\\PDFx]`,
    `[HKEY_CURRENT_USER\\Software\\RegisteredApplications]`,
    `"PDFx"=-`,
    ''
  ].join('\r\n')
}

async function importReg(text: string): Promise<void> {
  const file = join(tmpdir(), `pdfx-${process.pid}-${Date.now()}.reg`)
  // reg.exe reads UTF-16 with a BOM, which keeps non-ASCII folder names.
  await writeFile(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]))
  try {
    await new Promise<void>((resolve, reject) =>
      execFile('reg.exe', ['import', file], { windowsHide: true }, (error) =>
        error ? reject(error) : resolve()
      )
    )
  } finally {
    await rm(file, { force: true })
  }
}

function currentCommand(): string {
  return openCommand(process.execPath, app.isPackaged ? null : app.getAppPath())
}

export async function setFileAssociation(enabled: boolean): Promise<void> {
  if (process.platform !== 'win32') return
  if (enabled) await importReg(registrationFile(process.execPath, currentCommand()))
  else await importReg(removalFile())
  rememberForUpdater({ associatedCommand: enabled ? currentCommand() : undefined })
}

// Windows' own page for picking PDFx as the default (Windows 11 22H2 opens
// PDFx's entry directly; older versions show the Default apps list).
export async function openDefaultAppsSettings(): Promise<void> {
  await shell.openExternal('ms-settings:defaultapps?registeredAppUser=PDFx')
}

// Keeps the registration in step with the setting and with where pdfx.exe
// now lives.
export function initFileAssociation(): void {
  if (process.platform !== 'win32') return
  let enabled = getSettings().openPdfs
  if (enabled && updaterMemory().associatedCommand !== currentCommand()) {
    void setFileAssociation(true).catch((e) => console.error('association: refresh failed', e))
  }
  onSettingsChanged((settings) => {
    if (settings.openPdfs === enabled) return
    enabled = settings.openPdfs
    void setFileAssociation(enabled).catch((e) => console.error('association: failed', e))
  })
}
