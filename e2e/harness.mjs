import { _electron as electron } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

// No trailing separator: on Windows a final backslash would escape the
// closing quote of the argument and swallow the ones after it.
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

// Launch the built app (out/) with its data folder pinned to `dataDir`.
export async function launch(dataDir, files = [], env = {}) {
  const app = await electron.launch({
    executablePath: electronPath,
    args: [ROOT, '--no-sandbox', ...files],
    env: { ...process.env, PDFX_USER_DATA: dataDir, ...env },
    timeout: 60_000
  })
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  return { app, page, errors }
}

// Simulate a crash: the whole app dies at once, as when the machine loses
// power. On Windows killing only the main process would leave its GPU and
// utility processes behind for a few seconds, still holding the profile.
export async function crash(app) {
  const pid = app.process().pid
  if (process.platform === 'win32') {
    execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' })
  } else {
    process.kill(pid, 'SIGKILL')
  }
  await new Promise((resolve) => setTimeout(resolve, 2000))
}

// Pages drawn, and every file being opened has arrived (its placeholder row
// is gone), so counts of documents and pages are final.
export const rendered = (page, count = 1) =>
  page.waitForFunction(
    (n) =>
      document.querySelectorAll('.pageview-base.ready').length >= n &&
      document.querySelectorAll('.skeleton-row').length === 0,
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
