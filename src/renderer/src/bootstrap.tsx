import { isWeb } from './platform/web/install'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GlobalWorkerOptions } from 'pdfjs-dist'
import './pdf-upsert-polyfill'
import App from './App'
import { loadSettings } from './app/settings-store'
import './styles.css'
import './styles-windows.css'

export function mountPdfxApp(container: HTMLElement): void {
  // Chromium on Linux ignores nativeTheme.themeSource for prefers-color-scheme,
  // so the desktop app pins its dark palette explicitly.
  if (!isWeb) document.documentElement.classList.add('theme-dark')
  // Middle-button drag pans the canvas; keep Chromium's autoscroll cursor
  // (Windows) and middle-click paste (Linux) from hijacking it.
  window.addEventListener(
    'mousedown',
    (event) => {
      if (event.button === 1) event.preventDefault()
    },
    { capture: true }
  )
  // Chromium's own Ctrl+V reads a copied file list and, in Electron 44,
  // crashes on non-ASCII file names. The canvas pastes files itself (as
  // documents); text fields paste through the main process, which leaves
  // file lists alone.
  if (!isWeb) {
    window.addEventListener(
      'keydown',
      (event) => {
        const paste =
          ((event.ctrlKey || event.metaKey) && !event.altKey && event.code === 'KeyV') ||
          (event.shiftKey && event.key === 'Insert')
        if (!paste) return
        event.preventDefault()
        const target = event.target as HTMLElement | null
        const field =
          !!target &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        if (field) void window.api.pasteText()
      },
      { capture: true }
    )
  }
  const pdfWorker = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' })
  GlobalWorkerOptions.workerPort = pdfWorker
  const mount = (): void =>
    createRoot(container).render(
      <StrictMode>
        <App />
      </StrictMode>
    )
  void loadSettings().finally(mount)
}
