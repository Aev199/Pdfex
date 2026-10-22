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
    rendererReady,
    chooseSavePath,
    readClipboardImage,
    readClipboardFiles: async () => [],
    clearClipboard,
    getPathForFile: () => '',
    expandDropPaths: async () => [],
    readSource: async () => null,
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
