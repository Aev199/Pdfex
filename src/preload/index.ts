import { contextBridge, ipcRenderer, webUtils } from 'electron'

export interface OpenedFile {
  name: string
  data: Uint8Array
  path?: string
  size?: number
  mtimeMs?: number
}

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

export interface FileStamp {
  size: number
  mtimeMs: number
}

export type ZoomAction = 'in' | 'out' | 'reset'

export type MenuAction =
  | 'open'
  | 'export-pdfx'
  | 'export-pdf'
  | 'export-zip'
  | 'new-tab'
  | 'close-tab'
  | 'next-tab'
  | 'previous-tab'

export interface SaveFilter {
  name: string
  extensions: string[]
}

const api = {
  platform: process.platform,
  rendererReady: (): Promise<void> => ipcRenderer.invoke('pdfx:renderer-ready'),
  chooseSavePath: (defaultName: string, filter?: SaveFilter): Promise<string | null> =>
    ipcRenderer.invoke('pdfx:choose-save-path', defaultName, filter),
  readClipboardImage: (): Promise<Uint8Array | null> =>
    ipcRenderer.invoke('pdfx:read-clipboard-image'),
  readClipboardFiles: (): Promise<OpenedFile[]> => ipcRenderer.invoke('pdfx:read-clipboard-files'),
  clearClipboard: (): Promise<void> => ipcRenderer.invoke('pdfx:clipboard-clear'),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  expandDropPaths: (paths: string[]): Promise<OpenedFile[]> =>
    ipcRenderer.invoke('pdfx:expand-drop-paths', paths),
  // Re-read a file the user opened earlier (null if moved, deleted or never opened).
  readSource: (path: string): Promise<(FileStamp & { data: Uint8Array }) | null> =>
    ipcRenderer.invoke('pdfx:read-source', path),
  fileInfo: (
    path: string
  ): Promise<{ size: number; createdMs: number; modifiedMs: number } | null> =>
    ipcRenderer.invoke('pdfx:file-info', path),
  statSources: (paths: string[]): Promise<(FileStamp | null)[]> =>
    ipcRenderer.invoke('pdfx:stat-sources', paths),
  listExternalApps: (): Promise<ExternalApp[]> => ipcRenderer.invoke('pdfx:list-external-apps'),
  openExternal: (action: OpenAction, source: OpenSource): Promise<void> =>
    ipcRenderer.invoke('pdfx:open-external', action, source),
  dragOut: (source: OpenSource, iconDataUrl: string): void =>
    ipcRenderer.send('pdfx:drag-out', source, iconDataUrl),
  readResource: (
    htmlPath: string,
    ref: string
  ): Promise<{ data: Uint8Array; mime: string } | null> =>
    ipcRenderer.invoke('pdfx:read-resource', htmlPath, ref),
  markupToPdf: (html: string, fitPageHeightPx?: number): Promise<Uint8Array> =>
    ipcRenderer.invoke('pdfx:markup-to-pdf', html, fitPageHeightPx),
  writeFile: (path: string, data: Uint8Array): Promise<string> =>
    ipcRenderer.invoke('pdfx:write-file', path, data),
  openFiles: (): Promise<OpenedFile[]> => ipcRenderer.invoke('pdfx:open-files'),
  onFilesOpened: (callback: (files: OpenedFile[]) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, files: OpenedFile[]): void =>
      callback(files)
    ipcRenderer.on('pdfx:files-opened', listener)
    return () => ipcRenderer.removeListener('pdfx:files-opened', listener)
  },
  onZoom: (callback: (action: ZoomAction) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: ZoomAction): void =>
      callback(action)
    ipcRenderer.on('pdfx:zoom', listener)
    return () => ipcRenderer.removeListener('pdfx:zoom', listener)
  },
  onMenu: (callback: (action: MenuAction) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: MenuAction): void =>
      callback(action)
    ipcRenderer.on('pdfx:menu', listener)
    return () => ipcRenderer.removeListener('pdfx:menu', listener)
  }
}

export type PdfxApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.api = api
}
