import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppInfo, Settings, UpdateState } from './app-types'

export type { AppInfo, Settings, UpdateState, UpdateOffer, UpdatePhase } from './app-types'

export type UpdateAction =
  | 'check'
  | 'download'
  | 'skip'
  | 'dismiss'
  | 'show'
  | 'restart'
  | 'rollback'
  | 'cancel'
  | 'browser'
  | 'page'

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

export interface SessionSourceRecord {
  id: string
  path?: string
  relPath?: string
  byteLength: number
  mtimeMs?: number
  blob?: boolean
}

export interface SessionManifest {
  format: 'pdfx-session'
  version: number
  sources: SessionSourceRecord[]
  [key: string]: unknown
}

export interface LoadedSession {
  manifest: SessionManifest
  bytes: Record<string, Uint8Array>
  status: Record<string, 'ok' | 'changed' | 'missing'>
  found: Record<string, { path: string; mtimeMs: number }>
}

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
  | 'save-session'
  | 'save-tab'
  | 'print'
  | 'settings'
  | 'help'
  | 'shortcuts'
  | 'check-updates'
  | 'about'

export interface SaveFilter {
  name: string
  extensions: string[]
}

const api = {
  platform: process.platform,
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('pdfx:settings-get'),
  setSettings: (patch: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke('pdfx:settings-set', patch),
  onSettings: (callback: (settings: Settings) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: Settings): void =>
      callback(settings)
    ipcRenderer.on('pdfx:settings', listener)
    return () => ipcRenderer.removeListener('pdfx:settings', listener)
  },
  appInfo: (): Promise<AppInfo> => ipcRenderer.invoke('pdfx:app-info'),
  openDataFolder: (): Promise<string> => ipcRenderer.invoke('pdfx:open-data-folder'),
  updateState: (): Promise<UpdateState> => ipcRenderer.invoke('pdfx:updates-state'),
  updateAction: (action: UpdateAction): Promise<void> =>
    ipcRenderer.invoke('pdfx:updates-action', action),
  onUpdateState: (callback: (state: UpdateState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: UpdateState): void =>
      callback(state)
    ipcRenderer.on('pdfx:updates', listener)
    return () => ipcRenderer.removeListener('pdfx:updates', listener)
  },
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
  sessionLoad: (): Promise<LoadedSession | null> => ipcRenderer.invoke('pdfx:session-load'),
  sessionSave: (manifest: SessionManifest, blobs: Record<string, Uint8Array>): Promise<void> =>
    ipcRenderer.invoke('pdfx:session-save', manifest, blobs),
  sessionWriteFile: (
    path: string,
    manifest: SessionManifest,
    blobs: Record<string, Uint8Array>
  ): Promise<void> => ipcRenderer.invoke('pdfx:session-write-file', path, manifest, blobs),
  sessionOpenFile: (path: string): Promise<LoadedSession> =>
    ipcRenderer.invoke('pdfx:session-open-file', path),
  onFlushSession: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('pdfx:flush-session', listener)
    return () => ipcRenderer.removeListener('pdfx:flush-session', listener)
  },
  sessionFlushed: (): void => ipcRenderer.send('pdfx:session-flushed'),
  officeConverter: (
    kind: 'word' | 'excel' | 'powerpoint'
  ): Promise<'office' | 'libreoffice' | null> => ipcRenderer.invoke('pdfx:office-converter', kind),
  officeConvert: (ext: string, data: Uint8Array): Promise<Uint8Array> =>
    ipcRenderer.invoke('pdfx:office-convert', ext, data),
  printSpool: (
    id: string,
    index: number,
    jpeg: Uint8Array,
    widthPt: number,
    heightPt: number
  ): Promise<void> => ipcRenderer.invoke('pdfx:print-spool', id, index, jpeg, widthPt, heightPt),
  printRun: (id: string, title: string): Promise<boolean> =>
    ipcRenderer.invoke('pdfx:print-run', id, title),
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
