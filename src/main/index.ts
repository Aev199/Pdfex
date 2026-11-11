import { app, dialog, nativeTheme, BrowserWindow } from 'electron'
import { onRecentChanged } from './recent'
import { initFileAssociation } from './file-association'
import { join } from 'path'
import { existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { FALLBACK_BG } from './native/glass'
import { collectFileArgs } from './file-intake'
import { createWindow, getMainWindow, getRendererReady, sendOpenPaths } from './window'
import { buildMenu } from './menu'
import { registerIpc } from './register-ipc'
import { registerAssetProtocol, registerAssetSchemePrivileged } from './assets'
import { configureDataLocation } from './portable'
import { cleanupTempExports } from './open-with'
import { applyOnQuit, initUpdater } from './updates/updater'

app.setName('PDFx')

registerAssetSchemePrivileged()

const dataLocation = configureDataLocation()

let pendingOpenPaths: string[] = []

app.on('open-file', (event, path) => {
  event.preventDefault()
  if (getRendererReady()) {
    void sendOpenPaths([path])
  } else {
    pendingOpenPaths.push(path)
  }
})

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv, workingDirectory) => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    const paths = collectFileArgs(argv.slice(1), workingDirectory)
    // Until the window has restored its session and listens, keep them for
    // the renderer-ready handshake rather than sending into the void.
    if (getRendererReady()) void sendOpenPaths(paths)
    else pendingOpenPaths.push(...paths)
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.pdfx.app')

    registerAssetProtocol()
    void cleanupTempExports()

    nativeTheme.themeSource = 'dark'

    if (process.platform === 'darwin' && is.dev) {
      const devIcon = join(app.getAppPath(), 'build', 'icon.png')
      if (existsSync(devIcon)) app.dock?.setIcon(devIcon)
    }

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window, { zoom: true })
    })

    pendingOpenPaths.push(...collectFileArgs(process.argv.slice(1)))

    registerIpc(
      () => pendingOpenPaths,
      () => {
        pendingOpenPaths = []
      }
    )

    buildMenu()
    onRecentChanged(buildMenu)
    createWindow()
    void initUpdater(dataLocation.kind === 'portable')
    initFileAssociation()

    if (dataLocation.kind === 'fallback') {
      void dialog.showMessageBox({
        type: 'warning',
        title: 'PDFx',
        message: 'The data folder next to the program is not writable.',
        detail: `Settings and sessions are kept in ${dataLocation.path} instead.\n\nWanted: ${dataLocation.wanted}`
      })
    }

    if (process.platform !== 'darwin') {
      nativeTheme.on('updated', () => {
        getMainWindow()?.setBackgroundColor(
          nativeTheme.shouldUseDarkColors ? FALLBACK_BG.dark : FALLBACK_BG.light
        )
      })
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('will-quit', () => {
  applyOnQuit()
  void cleanupTempExports()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
