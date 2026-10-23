import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { devVarsDefine } from './dev-vars'

export default defineConfig(({ command }) => ({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        },
        // Electron's fs without asar support (the updater writes app.asar).
        external: ['original-fs']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    define: devVarsDefine(__dirname, command),
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        'tesseract.js': 'tesseract.js'
      }
    },
    optimizeDeps: {
      include: [
        'ai',
        'ai/test',
        '@ai-sdk/anthropic',
        '@ai-sdk/openai',
        '@ai-sdk/google',
        'zod',
        'pdfjs-dist/build/pdf.worker.min.mjs',
        'tesseract.js'
      ]
    },
    worker: {
      format: 'es'
    },
    plugins: [react()]
  }
}))
