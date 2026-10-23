import { ipcMain, dialog, clipboard, nativeImage } from 'electron'
import { basename, isAbsolute } from 'path'
import { existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { markupToPdf } from './markup'
import { OpenedFile, IMPORTABLE, readFiles, expandDropPaths } from './file-intake'
import { clipboardFilePaths } from './clipboard'
import { readResource } from './resource'
import { fileInfo, readSource, statSource } from './source-files'
import { listExternalApps, openExternal, resolveFile } from './open-with'
import { runPrint, spoolPage } from './print'
import { converterFor, officeConvert } from './office'
import type { OpenAction, OpenSource } from './open-with'
import { loadAutosave, openSessionFile, saveSession, writeSessionFile } from './session'
import type { SessionManifest } from './session'
import { getMainWindow, setRendererReady, sendOpenPaths } from './window'

const MAX_WRITE_BYTES = 1024 * 1024 * 1024 // 1 GiB cap on a single IPC write

export function registerIpc(getPending: () => string[], clearPending: () => void): void {
  ipcMain.handle('pdfx:renderer-ready', async () => {
    setRendererReady(true)
    const paths = getPending()
    clearPending()
    await sendOpenPaths(paths)
  })

  ipcMain.handle(
    'pdfx:choose-save-path',
    async (_event, defaultName: string, filter?: { name: string; extensions: string[] }) => {
      const mainWindow = getMainWindow()
      if (!mainWindow) return null
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export',
        defaultPath: defaultName,
        filters: [filter ?? { name: 'PDFX', extensions: ['pdfx'] }]
      })
      return result.canceled || !result.filePath ? null : result.filePath
    }
  )

  ipcMain.handle('pdfx:read-clipboard-image', () => {
    const image = clipboard.readImage()
    return image.isEmpty() ? null : new Uint8Array(image.toPNG())
  })

  ipcMain.handle('pdfx:read-clipboard-files', async (): Promise<OpenedFile[]> => {
    const paths = clipboardFilePaths().filter((p) => IMPORTABLE.test(p) && existsSync(p))
    return readFiles(paths)
  })

  ipcMain.handle('pdfx:clipboard-clear', () => clipboard.clear())

  ipcMain.handle(
    'pdfx:expand-drop-paths',
    async (_event, paths: string[]): Promise<OpenedFile[]> =>
      readFiles(await expandDropPaths(paths))
  )

  ipcMain.handle('pdfx:read-source', (_event, path: unknown) => readSource(path))

  ipcMain.handle('pdfx:file-info', (_event, path: unknown) => fileInfo(path))

  ipcMain.handle('pdfx:stat-sources', (_event, paths: unknown) =>
    Array.isArray(paths) ? Promise.all(paths.slice(0, 10_000).map(statSource)) : []
  )

  ipcMain.handle('pdfx:session-load', () => loadAutosave())

  ipcMain.handle(
    'pdfx:session-save',
    (_event, manifest: SessionManifest, blobs: Record<string, Uint8Array>) =>
      saveSession(manifest, blobs ?? {})
  )

  ipcMain.handle(
    'pdfx:session-write-file',
    (_event, path: string, manifest: SessionManifest, blobs: Record<string, Uint8Array>) =>
      writeSessionFile(path, manifest, blobs ?? {})
  )

  ipcMain.handle('pdfx:session-open-file', (_event, path: unknown) => openSessionFile(path))

  ipcMain.handle(
    'pdfx:print-spool',
    (_event, id: string, index: number, jpeg: Uint8Array, widthPt: number, heightPt: number) =>
      spoolPage(id, index, jpeg, widthPt, heightPt)
  )

  ipcMain.handle('pdfx:print-run', (_event, id: string, title: string) =>
    runPrint(id, String(title ?? 'PDFx'))
  )

  ipcMain.handle('pdfx:office-converter', (_event, kind: unknown) =>
    kind === 'word' || kind === 'excel' || kind === 'powerpoint' ? converterFor(kind) : null
  )

  ipcMain.handle('pdfx:office-convert', (_event, ext: string, data: Uint8Array) =>
    officeConvert(ext, data)
  )

  ipcMain.handle('pdfx:list-external-apps', () => listExternalApps())

  ipcMain.handle('pdfx:open-external', (_event, action: OpenAction, source: OpenSource) =>
    openExternal(action, source)
  )

  // Dragging a document out of the window drops a real PDF into Explorer.
  ipcMain.on('pdfx:drag-out', (event, source: OpenSource, iconDataUrl: string) => {
    void (async () => {
      try {
        const file = await resolveFile(source)
        const icon = nativeImage.createFromDataURL(String(iconDataUrl))
        if (icon.isEmpty()) return
        event.sender.startDrag({ file, icon })
      } catch (error) {
        console.error('drag-out failed', error)
      }
    })()
  })

  ipcMain.handle('pdfx:read-resource', (_event, htmlPath: string, ref: string) =>
    readResource(htmlPath, ref)
  )

  ipcMain.handle(
    'pdfx:markup-to-pdf',
    (_event, html: string, fitPageHeightPx?: number): Promise<Uint8Array> => {
      // Coerce to a finite positive number so the value can never be a string that
      // breaks out of the numeric context where markup.ts interpolates it into
      // executeJavaScript.
      const ph = Number(fitPageHeightPx)
      return markupToPdf(html, Number.isFinite(ph) && ph > 0 ? ph : undefined)
    }
  )

  ipcMain.handle('pdfx:write-file', async (_event, path: string, data: Uint8Array) => {
    // The renderer must hand us a concrete absolute path (these come from the native
    // save dialog). Reject relative paths, null-byte truncation tricks, and absurd
    // payload sizes so a compromised renderer can't turn this into a write primitive.
    if (typeof path !== 'string' || !path || path.includes('\0') || !isAbsolute(path)) {
      throw new Error('write-file: refusing invalid path')
    }
    if (!ArrayBuffer.isView(data) || data.byteLength > MAX_WRITE_BYTES) {
      throw new Error('write-file: refusing invalid payload')
    }
    await writeFile(path, data)
    return basename(path)
  })

  ipcMain.handle('pdfx:open-files', async (): Promise<OpenedFile[]> => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return []
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open documents',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Documents',
          extensions: [
            'pdf',
            'pdfx',
            'pdfxs',
            'doc',
            'docx',
            'odt',
            'xls',
            'xlsx',
            'ods',
            'ppt',
            'pptx',
            'odp',
            'png',
            'jpg',
            'jpeg',
            'webp',
            'gif',
            'bmp',
            'avif',
            'txt',
            'rtf',
            'svg',
            'html',
            'htm'
          ]
        },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled) return []
    return readFiles(result.filePaths)
  })
}
