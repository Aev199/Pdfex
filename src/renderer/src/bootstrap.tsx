import { isWeb } from './platform/web/install'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GlobalWorkerOptions } from 'pdfjs-dist'
import './pdf-upsert-polyfill'
import App from './App'
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
  const pdfWorker = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' })
  GlobalWorkerOptions.workerPort = pdfWorker
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
