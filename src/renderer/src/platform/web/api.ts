import { markupToPdf } from './markup-to-pdf'
import { chooseSavePath, writeFile } from './save'
import { openFiles } from './open-files'
import { readClipboardImage, clearClipboard } from './clipboard'
import { onZoom, onMenu } from './menu-keys'
import { initLaunchQueue, onFilesOpened, rendererReady } from './launch-queue'
import type { PdfxApi } from '../../../../preload'

export function createWebApi(): PdfxApi {
  initLaunchQueue()
  return {
    platform: 'linux',
    getSettings: async () => {
      throw new Error('Settings live in the desktop app')
    },
    setSettings: async () => {
      throw new Error('Settings live in the desktop app')
    },
    onSettings: () => () => {},
    appInfo: async () => ({
      version: 'web',
      commit: '',
      channel: 'web',
      electron: '',
      chrome: '',
      node: '',
      dataDir: '',
      appDir: '',
      canSelfUpdate: false,
      previousVersion: null
    }),
    openDataFolder: async () => '',
    updateState: async () => ({
      phase: { kind: 'idle' },
      dialog: false,
      note: null,
      applied: null
    }),
    updateAction: async () => {},
    onUpdateState: () => () => {},
    rendererReady,
    chooseSavePath,
    readClipboardImage,
    readClipboardFiles: async () => [],
    clearClipboard,
    getPathForFile: () => '',
    expandDropPaths: async () => [],
    readSource: async () => null,
    officeConverter: async () => null,
    officeConvert: async () => {
      throw new Error('Office conversion needs the desktop app')
    },
    printSpool: async () => {},
    printRun: async () => {
      window.print()
      return true
    },
    sessionLoad: async () => null,
    sessionSave: async () => {},
    sessionWriteFile: async () => {},
    sessionOpenFile: async () => {
      throw new Error('Sessions are not available on the web')
    },
    onFlushSession: () => () => {},
    sessionFlushed: () => {},
    fileInfo: async () => null,
    listExternalApps: async () => [],
    openExternal: async () => {},
    dragOut: () => {},
    statSources: async (paths) => paths.map(() => null),
    readResource: async () => null,
    markupToPdf,
    writeFile,
    openFiles,
    onFilesOpened,
    onZoom,
    onMenu
  }
}
