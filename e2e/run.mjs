// End-to-end checks of the built app (yarn electron-vite build first).
// Linux CI runs them under Xvfb: xvfb-run -a yarn e2e
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { inflateSync } from 'node:zlib'
import { makeFixtures } from './fixtures.mjs'
import {
  clickMenuItem,
  crash,
  launch,
  menu,
  mockSaveDialog,
  rendered,
  texts,
  worldTransform
} from './harness.mjs'

const work = mkdtempSync(join(tmpdir(), 'pdfx-e2e-'))
const files = await makeFixtures(work)
const tests = []
const test = (name, fn) => tests.push({ name, fn })
const freshData = () => mkdtempSync(join(work, 'data-'))

test('opens PDFs from the command line and renders them', async () => {
  const { app, page, errors } = await launch(freshData(), [files.report, files.drawing])
  try {
    await rendered(page, 3)
    assert.deepEqual(await texts(page, '.doc-name'), ['Технический отчёт ИГИ', 'КЖ лист 1'])
    assert.deepEqual(errors, [])
  } finally {
    await app.close()
  }
})

test('wheel, Shift+wheel, Ctrl+wheel and middle-button drag move the canvas', async () => {
  const { app, page } = await launch(freshData(), [files.report, files.drawing])
  try {
    await rendered(page)
    const box = await page.locator('.canvas-doc').first().boundingBox()
    await page.mouse.move(box.x + 150, box.y + 150)
    const scale = async () => Number((await worldTransform(page)).match(/scale\(([\d.]+)\)/)[1])
    const k0 = await scale()
    await page.keyboard.down('Control')
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -100)
    await page.keyboard.up('Control')
    await page.waitForTimeout(500)
    assert.ok(Math.abs((await scale()) / k0 - 1.2 ** 3) < 0.02, 'three notches zoom 1.2x each')

    const x = async () => Number((await worldTransform(page)).match(/translate\(([-\d.]+)px/)[1])
    const x0 = await x()
    await page.keyboard.down('Shift')
    await page.mouse.wheel(0, 100)
    await page.keyboard.up('Shift')
    await page.waitForTimeout(500)
    assert.ok(Math.abs((await x()) - (x0 - 100)) < 1, 'Shift+wheel pans sideways')

    const x1 = await x()
    await page.mouse.down({ button: 'middle' })
    await page.mouse.move(box.x + 50, box.y + 150, { steps: 5 })
    await page.mouse.up({ button: 'middle' })
    assert.ok(Math.abs((await x()) - (x1 - 100)) < 1, 'middle-drag pans, even over a page')
  } finally {
    await app.close()
  }
})

test('page menu, multi-select, undo and redo', async () => {
  const { app, page } = await launch(freshData(), [files.report, files.second])
  try {
    await rendered(page)
    const pages = () => page.locator('.canvas-world .page[data-page-id]').count()
    assert.equal(await pages(), 15)
    await page.locator('.canvas-world .page[data-page-id]').nth(1).click({ button: 'right' })
    await clickMenuItem(page, 'Duplicate page')
    assert.equal(await pages(), 16)

    await page.locator('.canvas-world .page[data-page-id]').nth(0).click()
    await page
      .locator('.canvas-world .page[data-page-id]')
      .nth(2)
      .click({ modifiers: ['Shift'] })
    await page
      .locator('.canvas-world .page[data-page-id]')
      .nth(14)
      .click({ modifiers: ['Control'] })
    assert.equal(await page.locator('.page.selected').count(), 4)
    await page.locator('.page.selected').first().click({ button: 'right' })
    await clickMenuItem(page, 'Extract 4 pages')
    assert.deepEqual(await texts(page, '.doc-name'), [
      'Технический отчёт ИГИ',
      'Технический отчёт ИГИ (extract)',
      'Расчёт MIDAS'
    ])

    await page.keyboard.press('Control+z')
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(400)
    assert.equal(await pages(), 15)
    assert.equal((await texts(page, '.doc-name')).length, 2)
    await page.keyboard.press('Control+y')
    await page.waitForTimeout(400)
    assert.equal(await pages(), 16)
  } finally {
    await app.close()
  }
})

test('tabs and camera survive a restart, and a crash', async () => {
  const data = freshData()
  let run = await launch(data, [files.report, files.second, files.drawing])
  await rendered(run.page)
  const { page } = run
  await page.locator('.doc-name').nth(2).click({ button: 'right' })
  await page.locator('.context-menu-item', { hasText: 'Move to tab' }).hover()
  await clickMenuItem(page, 'New tab')
  await page.locator('.doc-name').first().click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('Отчёт ИГИ (корр.)')
  await page.keyboard.press('Enter')
  await page.keyboard.down('Control')
  await page.mouse.move(400, 400)
  await page.mouse.wheel(0, -100)
  await page.keyboard.up('Control')
  await page.waitForTimeout(800)
  const view = await worldTransform(page)
  await run.app.close()

  run = await launch(data)
  try {
    await rendered(run.page)
    assert.deepEqual(await texts(run.page, '.tab-name'), ['Tab 1', 'КЖ лист 1'])
    assert.deepEqual(await texts(run.page, '.doc-name'), ['Отчёт ИГИ (корр.)', 'Расчёт MIDAS'])
    assert.equal(await worldTransform(run.page), view)

    // Change something, let the autosave land, then kill the process.
    await run.page.locator('.doc-name').nth(1).click({ button: 'right' })
    await clickMenuItem(run.page, 'Duplicate document')
    await run.page.waitForTimeout(2500)
    await crash(run.app)
  } catch (error) {
    await run.app.close()
    throw error
  }

  run = await launch(data)
  try {
    await rendered(run.page)
    assert.deepEqual(await texts(run.page, '.doc-name'), [
      'Отчёт ИГИ (корр.)',
      'Расчёт MIDAS',
      'Расчёт MIDAS (copy)'
    ])
  } finally {
    await run.app.close()
  }
})

test('a session saved as .pdfxs opens in a fresh install', async () => {
  const data = freshData()
  const target = join(work, 'Объект 12.pdfxs')
  let run = await launch(data, [files.report, files.second])
  await rendered(run.page)
  await run.page.waitForFunction(() => document.querySelectorAll('.doc-name').length === 2)
  await mockSaveDialog(run.app, target)
  await menu(run.app, 'save-session')
  for (let i = 0; i < 30 && !existsSync(target); i++) await run.page.waitForTimeout(200)
  await run.app.close()
  assert.ok(existsSync(target))

  run = await launch(freshData(), [target])
  try {
    await rendered(run.page)
    assert.deepEqual(await texts(run.page, '.doc-name'), ['Технический отчёт ИГИ', 'Расчёт MIDAS'])
  } finally {
    await run.app.close()
  }
})

test('a missing source file can be located again', async () => {
  const data = freshData()
  const copy = join(work, 'Перемещаемый.pdf')
  const moved = join(work, 'Перемещённый.pdf')
  await import('node:fs').then((fs) => fs.copyFileSync(files.second, copy))
  let run = await launch(data, [files.report, copy])
  await rendered(run.page)
  await run.page.waitForTimeout(1500)
  await run.app.close()
  await import('node:fs').then((fs) => fs.renameSync(copy, moved))

  run = await launch(data)
  try {
    await rendered(run.page)
    await run.page.waitForSelector('.notice')
    assert.deepEqual(await texts(run.page, '.doc-name'), ['Технический отчёт ИГИ'])
    await run.app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] })
    }, moved)
    await run.page.locator('.notice-btn', { hasText: 'Locate' }).click()
    await run.page.waitForTimeout(1500)
    assert.deepEqual(await texts(run.page, '.doc-name'), ['Технический отчёт ИГИ', 'Перемещаемый'])
    assert.equal(await run.page.locator('.notice').count(), 0)
  } finally {
    await run.app.close()
  }
})

test('shapes drawn in the full view are exported as vector strokes', async () => {
  const { app, page } = await launch(freshData(), [files.second])
  const out = join(work, 'annotated.pdf')
  try {
    await rendered(page)
    await page.locator('.canvas-world .page[data-page-id]').first().dblclick()
    await page.waitForTimeout(1000)
    await page.locator('.full-actions .btn', { hasText: 'Edit' }).click()
    const fp = await page.locator('.full-page').first().boundingBox()
    const at = (fx, fy) => [fp.x + fp.width * fx, fp.y + fp.height * fy]
    const drag = async (a, b) => {
      await page.mouse.move(...a)
      await page.mouse.down()
      await page.mouse.move(...b, { steps: 6 })
      await page.mouse.up()
    }
    await page.locator('.annotate-swatch').nth(1).click() // red
    await page.locator('.annotate-tool[title="Rectangle"]').click()
    await drag(at(0.2, 0.4), at(0.6, 0.6))
    await page.locator('.annotate-tool[title="Arrow"]').click()
    await drag(at(0.2, 0.7), at(0.7, 0.75))
    assert.equal(await page.locator('.full-page .element-hit').count(), 2)
    await page.locator('.full-actions .btn', { hasText: 'Done' }).click()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    await mockSaveDialog(app, out)
    await menu(app, 'export-pdf')
    for (let i = 0; i < 30 && !existsSync(out); i++) await page.waitForTimeout(200)
  } finally {
    await app.close()
  }
  const doc = await PDFDocument.load(readFileSync(out))
  assert.equal(doc.getPageCount(), 3)
  // The red stroke colour must be in the first page's content.
  const contents = doc.getPage(0).node.Contents()
  const streams = contents?.asArray ? contents.asArray() : [contents]
  const text = streams
    .map((ref) => doc.context.lookup(ref))
    .map((s) => {
      const raw = Buffer.from(s.getContents())
      try {
        return inflateSync(raw).toString('latin1')
      } catch {
        return raw.toString('latin1')
      }
    })
    .join('\n')
  assert.match(text, /0\.898\d* 0\.196\d* 0\.176\d* RG/)
  assert.ok(statSync(out).size > 0)
})

test('reader: thumbnails, page jump, rotation and printing', async () => {
  const { app, page } = await launch(freshData(), [files.report])
  try {
    await rendered(page)
    await app.evaluate(({ app: a }) => {
      globalThis.__printed = null
      a.on('web-contents-created', (_e, wc) => {
        wc.print = (_opts, cb) => {
          const fs = process.getBuiltinModule('fs')
          const url = new URL(wc.getURL())
          const file = decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/, '$1')
          const html = fs.readFileSync(file, 'utf8')
          globalThis.__printed = (html.match(/class="sheet"/g) || []).length
          cb(true)
        }
      })
    })
    await page.locator('.canvas-world .page[data-page-id]').nth(1).click({ button: 'right' })
    await clickMenuItem(page, 'Rotate right')
    await page.locator('.canvas-world .page[data-page-id]').first().dblclick()
    await page.waitForTimeout(1000)
    if (!(await page.locator('.fv-sidebar').count())) await page.keyboard.press('F4')
    assert.equal(await page.locator('.fv-thumb').count(), 12)
    await page.locator('.fv-thumb').nth(1).click()
    await page.waitForTimeout(1000)
    assert.equal(await page.locator('.full-count-input').inputValue(), '2')
    assert.ok(await page.locator('.full-actions .btn', { hasText: 'Edit' }).isDisabled())
    await page.locator('.full-count-input').click()
    await page.keyboard.type('9')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1000)
    assert.equal(await page.locator('.full-count-input').inputValue(), '9')
    await page.locator('.full-actions .btn', { hasText: 'Print' }).click()
    await clickMenuItem(page, 'Print "')
    for (let i = 0; i < 60 && !(await app.evaluate(() => globalThis.__printed)); i++) {
      await page.waitForTimeout(500)
    }
    assert.equal(await app.evaluate(() => globalThis.__printed), 12)
  } finally {
    await app.close()
  }
})

test('an Office document converts to PDF, or says what to install', async () => {
  const { app, page } = await launch(freshData(), [files.word])
  try {
    await page.waitForFunction(
      () =>
        document.querySelector('.doc-name') ||
        /install Microsoft Word or LibreOffice|conversion to PDF failed/.test(
          document.querySelector('.toast')?.textContent ?? ''
        ),
      null,
      { timeout: 120_000 }
    )
    const names = await texts(page, '.doc-name')
    if (names.length > 0) {
      assert.deepEqual(names, ['Пояснительная записка'])
      await rendered(page)
    } else {
      assert.match(
        await page.locator('.toast').innerText(),
        /install Microsoft Word or LibreOffice/
      )
    }
  } finally {
    await app.close()
  }
})

let failed = 0
for (const { name, fn } of tests) {
  const t0 = Date.now()
  try {
    await fn()
    console.log(`  ✓ ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`)
  } catch (error) {
    failed++
    console.log(`  ✗ ${name}\n    ${error?.stack ?? error}`)
  }
}
// Best effort: Windows may still hold a file of a just-closed instance.
try {
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
} catch {
  // Left for the OS to clean up.
}
console.log(failed ? `${failed} of ${tests.length} failed` : `all ${tests.length} passed`)
process.exit(failed ? 1 : 0)
