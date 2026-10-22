import { _electron as electron } from 'playwright-core'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

// Launch the built app (out/) with its data folder pinned to `dataDir`.
export async function launch(dataDir, files = []) {
  const app = await electron.launch({
    executablePath: electronPath,
    args: [ROOT, '--no-sandbox', ...files],
    env: { ...process.env, PDFX_USER_DATA: dataDir },
    timeout: 60_000
  })
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  return { app, page, errors }
}

export const rendered = (page, count = 1) =>
  page.waitForFunction(
    (n) => document.querySelectorAll('.pageview-base.ready').length >= n,
    count,
    {
      timeout: 60_000
    }
  )

export const texts = (page, selector) =>
  page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.textContent), selector)

export const worldTransform = (page) =>
  page.evaluate(() => document.querySelector('.canvas-world')?.style.transform ?? '')

export async function menu(app, action) {
  await app.evaluate(
    ({ BrowserWindow }, a) => BrowserWindow.getAllWindows()[0].webContents.send('pdfx:menu', a),
    action
  )
}

export async function mockSaveDialog(app, path) {
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: p })
  }, path)
}

export async function clickMenuItem(page, label) {
  await page.locator('.context-menu-item', { hasText: label }).first().click()
  await page.waitForTimeout(300)
}
