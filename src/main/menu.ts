import { Menu, webContents } from 'electron'
import { safePaste } from './clipboard'
import { getMainWindow, toggleDevTools } from './window'

export function buildMenu(): void {
  const sendZoom = (action: 'in' | 'out' | 'reset') => (): void => {
    getMainWindow()?.webContents.send('pdfx:zoom', action)
  }
  const sendMenu = (action: string) => (): void => {
    getMainWindow()?.webContents.send('pdfx:menu', action)
  }
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? ([{ role: 'appMenu' }] as Electron.MenuItemConstructorOptions[])
      : []),
    {
      label: 'File',
      submenu: [
        { id: 'open', label: 'Open…', accelerator: 'CommandOrControl+O', click: sendMenu('open') },
        { type: 'separator' },
        {
          id: 'export-pdfx',
          label: 'Export .pdfx…',
          accelerator: 'CommandOrControl+E',
          click: sendMenu('export-pdfx')
        },
        { id: 'export-pdf', label: 'Export Single PDF…', click: sendMenu('export-pdf') },
        { id: 'export-zip', label: 'Export All as ZIP…', click: sendMenu('export-zip') },
        { type: 'separator' },
        { label: 'Print…', accelerator: 'CommandOrControl+P', click: sendMenu('print') },
        { type: 'separator' },
        {
          label: 'Save Session As…',
          accelerator: 'CommandOrControl+Shift+S',
          click: sendMenu('save-session')
        },
        { label: 'Save Tab As…', click: sendMenu('save-tab') },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CommandOrControl+,', click: sendMenu('settings') },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' as const } : { role: 'quit' as const }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        {
          label: 'Paste',
          accelerator: 'CommandOrControl+V',
          // The page takes the key itself (see paste-guard in the renderer).
          registerAccelerator: false,
          click: () => {
            const contents = webContents.getFocusedWebContents() ?? getMainWindow()?.webContents
            if (contents) void safePaste(contents)
          }
        },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          id: 'zoom-in',
          label: 'Zoom In',
          accelerator: 'CommandOrControl+=',
          click: sendZoom('in')
        },
        {
          id: 'zoom-out',
          label: 'Zoom Out',
          accelerator: 'CommandOrControl+-',
          click: sendZoom('out')
        },
        {
          id: 'zoom-reset',
          label: 'Actual Size',
          accelerator: 'CommandOrControl+0',
          click: sendZoom('reset')
        },
        { type: 'separator' },
        // The keys are read in the page (by key position, so they work in any
        // keyboard layout); the menu only shows them.
        {
          label: 'Rotate Right',
          accelerator: 'CommandOrControl+Shift+=',
          registerAccelerator: false,
          click: sendMenu('rotate-right')
        },
        {
          label: 'Rotate Left',
          accelerator: 'CommandOrControl+Shift+-',
          registerAccelerator: false,
          click: sendMenu('rotate-left')
        },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I',
          click: () => toggleDevTools()
        }
      ]
    },
    {
      label: 'Tabs',
      submenu: [
        { label: 'New Tab', accelerator: 'CommandOrControl+T', click: sendMenu('new-tab') },
        { label: 'Close Tab', accelerator: 'CommandOrControl+W', click: sendMenu('close-tab') },
        { type: 'separator' },
        { label: 'Next Tab', accelerator: 'Control+Tab', click: sendMenu('next-tab') },
        {
          label: 'Previous Tab',
          accelerator: 'Control+Shift+Tab',
          click: sendMenu('previous-tab')
        }
      ]
    },
    {
      role: 'window',
      submenu: [
        { role: 'minimize' },
        ...(process.platform === 'darwin' ? [{ role: 'zoom' as const }] : [])
      ]
    },
    {
      role: 'help',
      submenu: [
        { label: 'PDFx Help', accelerator: 'F1', click: sendMenu('help') },
        { label: 'Keyboard Shortcuts', click: sendMenu('shortcuts') },
        { type: 'separator' },
        { label: 'Check for Updates…', click: sendMenu('check-updates') },
        { label: 'About PDFx', click: sendMenu('about') }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
