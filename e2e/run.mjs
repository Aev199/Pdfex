// End-to-end checks of the built app (yarn electron-vite build first).
// Linux CI runs them under Xvfb: xvfb-run -a yarn e2e
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream, rgb } from 'pdf-lib'
import { inflateSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { strToU8, zipSync } from 'fflate'
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
    await page.waitForFunction(() => document.querySelectorAll('.doc-name').length === 2)
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

    // Ctrl-drag copies a page into another document; a plain drag moves it.
    const all = page.locator('.canvas-world .page[data-page-id]')
    const firstId = () => all.first().getAttribute('data-page-id')
    const original = await firstId()
    const before = await pages()
    await page.keyboard.down('Control')
    await all.first().dragTo(all.last())
    await page.keyboard.up('Control')
    await page.waitForTimeout(400)
    assert.equal(await pages(), before + 1)
    assert.equal(await firstId(), original)
    await all.first().dragTo(all.last())
    await page.waitForTimeout(400)
    assert.equal(await pages(), before + 1)
    assert.notEqual(await firstId(), original)
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
    // Copy the annotated page with its neighbour and paste both at the end:
    // the copy keeps the shapes.
    const canvasPages = page.locator('.canvas-world .page[data-page-id]')
    await canvasPages.nth(0).click()
    await canvasPages.nth(1).click({ modifiers: ['Control'] })
    await page.keyboard.press('Control+c')
    await canvasPages.nth(2).click()
    await page.keyboard.press('Control+v')
    await page.waitForTimeout(600)
    assert.equal(await canvasPages.count(), 5)
    await mockSaveDialog(app, out)
    await menu(app, 'export-pdf')
    for (let i = 0; i < 30 && !existsSync(out); i++) await page.waitForTimeout(200)
  } finally {
    await app.close()
  }
  const doc = await PDFDocument.load(readFileSync(out))
  assert.equal(doc.getPageCount(), 5)
  // The red stroke colour must be in the first page and in its pasted copy.
  for (const index of [0, 3])
    assert.match(pageContent(doc, index), /0\.898\d* 0\.196\d* 0\.176\d* RG/)
  assert.doesNotMatch(pageContent(doc, 4), /0\.898\d* 0\.196\d* 0\.176\d* RG/)
  assert.ok(statSync(out).size > 0)
})

function pageContent(doc, index) {
  const contents = doc.getPage(index).node.Contents()
  const streams = contents?.asArray ? contents.asArray() : [contents]
  return streams
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
}

test('marks and drawings can be exported as annotations other programs can edit', async () => {
  const { app, page } = await launch(freshData(), [files.second])
  const out = join(work, 'editable.pdf')
  try {
    await rendered(page)
    await menu(app, 'settings')
    await page.locator('.settings-choice', { hasText: 'others can move or delete' }).click()
    await page.keyboard.press('Escape')
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
    await page.locator('.annotate-tool[title="Pen"]').click()
    await drag(at(0.2, 0.8), at(0.6, 0.85))
    await page.locator('.full-actions .btn', { hasText: 'Highlight' }).click()
    const line = page.locator('.edit-select-layer span').nth(6)
    const box = await line.boundingBox()
    await drag([box.x + 2, box.y + box.height / 2], [box.x + box.width - 2, box.y + box.height / 2])
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
  const annots = doc.getPage(0).node.Annots()
  const kinds = annots
    .asArray()
    .map((ref) => doc.context.lookup(ref))
    .map((a) => ({
      subtype: a.get(PDFName.of('Subtype'))?.toString(),
      ap: !!a.get(PDFName.of('AP'))
    }))
  for (const subtype of ['/Square', '/Ink', '/Highlight']) {
    assert.ok(
      kinds.some((k) => k.subtype === subtype && k.ap),
      `${subtype} in ${JSON.stringify(kinds)}`
    )
  }
  // Not drawn into the page itself.
  assert.doesNotMatch(pageContent(doc, 0), /0\.898\d* 0\.196\d* 0\.176\d* RG/)
})

test('styled text and an underline are exported with their fonts and colours', async () => {
  const { app, page } = await launch(freshData(), [files.second])
  const out = join(work, 'styled.pdf')
  try {
    await rendered(page)
    await page.locator('.canvas-world .page[data-page-id]').first().dblclick()
    await page.waitForTimeout(1000)
    await page.locator('.full-actions .btn', { hasText: 'Edit' }).click()
    await page.locator('.full-actions .btn', { hasText: 'Add Text' }).click()
    await page.locator('.annotate-select[title="Font"]').selectOption('serif')
    await page.locator('.annotate-tool[title="Bold"]').click()
    await page.locator('.annotate-swatch').nth(1).click() // red
    const fp = await page.locator('.full-page').first().boundingBox()
    const at = (fx, fy) => [fp.x + fp.width * fx, fp.y + fp.height * fy]
    await page.mouse.click(...at(0.3, 0.5))
    await page.keyboard.type('Проверка')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    assert.ok((await page.locator('.full-page text[font-weight="bold"]').count()) >= 1)
    await page.locator('.full-actions .btn', { hasText: 'Highlight' }).click()
    await page.locator('.annotate-tool[title="Underline"]').click()
    await page.locator('.annotate-swatch[title="green"]').click()
    await page.waitForSelector('.full-page .edit-select-layer span')
    await page.waitForTimeout(500)
    // A line below the annotation bar.
    const line = await page.locator('.full-page .edit-select-layer span').nth(6).boundingBox()
    await page.mouse.move(line.x + 2, line.y + line.height / 2)
    await page.mouse.down()
    await page.mouse.move(line.x + line.width - 2, line.y + line.height / 2, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(300)
    assert.ok((await page.locator('.mark-rect.line').count()) > 0)
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
  const fonts = doc.context
    .enumerateIndirectObjects()
    .map(([, obj]) => obj?.get?.(PDFName.of('BaseFont'))?.toString() ?? '')
    .filter(Boolean)
  assert.ok(
    fonts.some((f) => f.includes('DejaVuSerif-Bold')),
    fonts.join(' ')
  )
  assert.match(pageContent(doc, 0), /0\.49\d* 0\.86\d* 0\.52\d* rg/)
})

test('measurements and callouts are labelled and exported as real text', async () => {
  const { app, page } = await launch(freshData(), [files.second])
  const out = join(work, 'measured.pdf')
  try {
    await rendered(page)
    await page.locator('.canvas-world .page[data-page-id]').first().dblclick()
    await page.waitForTimeout(1000)
    await page.locator('.full-actions .btn', { hasText: 'Edit' }).click()
    const fp = await page.locator('.full-page').first().boundingBox()
    const at = (fx, fy) => [fp.x + fp.width * fx, fp.y + fp.height * fy]

    await page.locator('.annotate-tool[title="Measure length"]').click()
    await page.locator('.annotate-select[title="Drawing scale"]').selectOption('1:100')
    await page.locator('.annotate-select[title="Units"]').selectOption('m')
    await page.mouse.move(...at(0.2, 0.6))
    await page.mouse.down()
    await page.mouse.move(...at(0.6, 0.6), { steps: 6 })
    await page.mouse.up()
    // 40% of an A4 width (238 pt = 84 mm) at 1:100 is 8.4 m.
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.measure-label text')].some((t) =>
        /^8,4\d? м$/.test(t.textContent ?? '')
      )
    )

    await page.locator('.annotate-tool[title^="Measure an area"]').click()
    await page.mouse.click(...at(0.2, 0.7))
    await page.mouse.click(...at(0.5, 0.7))
    await page.mouse.dblclick(...at(0.5, 0.8))
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.measure-label text')].some((t) =>
        (t.textContent ?? '').endsWith('м²')
      )
    )

    await page.locator('.annotate-tool[title^="Callout"]').click()
    await page.mouse.move(...at(0.4, 0.88))
    await page.mouse.down()
    await page.mouse.move(...at(0.6, 0.82), { steps: 6 })
    await page.mouse.up()
    await page.keyboard.type('Узел 1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    await page.locator('.full-actions .btn', { hasText: 'Done' }).click()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    await mockSaveDialog(app, out)
    await menu(app, 'export-pdf')
    for (let i = 0; i < 30 && !existsSync(out); i++) await page.waitForTimeout(200)
  } finally {
    await app.close()
  }
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(out)) }).promise
  const content = await (await doc.getPage(1)).getTextContent()
  const text = content.items.map((item) => item.str).join(' ')
  assert.match(text, /8,4\d? м/)
  assert.match(text, /м²/)
  assert.match(text, /Узел 1/)
})

test('comments: reply, resolve, survive a restart and export as PDF notes', async () => {
  const data = freshData()
  const out = join(work, 'commented.pdf')
  let run = await launch(data, [files.second])
  try {
    const { page } = run
    await rendered(page)
    await page.locator('.canvas-world .page[data-page-id]').first().dblclick()
    await page.waitForTimeout(1000)
    if (!(await page.locator('.comments-panel').count())) await page.keyboard.press('F6')
    const fp = await page.locator('.full-page').first().boundingBox()
    const at = (fx, fy) => [fp.x + fp.width * fx, fp.y + fp.height * fy]

    await page.locator('.comments-new').click()
    await page.mouse.click(...at(0.3, 0.3))
    await page.keyboard.type('Check the dimension')
    await page.keyboard.press('Enter')
    await page.locator('.comment-reply-btn').first().click()
    await page.keyboard.type('Fixed in rev. B')
    await page.keyboard.press('Enter')

    await page.locator('.comments-new').click()
    await page.mouse.click(...at(0.6, 0.7))
    await page.keyboard.type('Second note')
    await page.keyboard.press('Enter')
    assert.deepEqual(await texts(page, '.comment-pin'), ['1', '2'])
    await page
      .locator('.comment-card', { hasText: 'Second note' })
      .locator('.comment-resolve')
      .click()
    // Resolved threads leave the page and the list until asked for.
    assert.deepEqual(await texts(page, '.comment-pin'), ['1'])
    assert.equal(await page.locator('.comment-card').count(), 1)
    await page.locator('.comments-filter input').check()
    assert.equal(await page.locator('.comment-card.resolved').count(), 1)
    await page.locator('.comments-panel .comments-icon-btn[title^="Hide"]').click()
    assert.equal(await page.locator('.comment-pin').count(), 0)

    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    assert.equal(await page.locator('.page-comments').first().textContent(), '1')
    await page.waitForTimeout(2000)
  } finally {
    await run.app.close()
  }

  run = await launch(data)
  try {
    const { app, page } = run
    await rendered(page)
    await page.locator('.canvas-world .page[data-page-id]').first().dblclick()
    await page.waitForTimeout(1000)
    if (!(await page.locator('.comments-panel').count())) await page.keyboard.press('F6')
    await page.locator('.comments-filter input').check()
    assert.equal(await page.locator('.comment-card').count(), 2)
    assert.match(await page.locator('.comment-card').first().textContent(), /Fixed in rev\. B/)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    await mockSaveDialog(app, out)
    await menu(app, 'export-pdf')
    for (let i = 0; i < 30 && !existsSync(out); i++) await page.waitForTimeout(200)
  } finally {
    await run.app.close()
  }

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(out)) }).promise
  const notes = (await (await doc.getPage(1)).getAnnotations()).filter((a) => a.subtype === 'Text')
  const byText = (text) => notes.find((n) => n.contentsObj?.str === text)
  const first = byText('Check the dimension')
  assert.ok(first && !first.inReplyTo)
  assert.equal(byText('Fixed in rev. B')?.inReplyTo, first.id)
  const second = byText('Second note')
  assert.ok(second)
  assert.ok(notes.some((n) => n.inReplyTo === second.id && /Completed/.test(n.contentsObj?.str)))
  // Nothing was drawn: the page text is the source's own.
  const content = await (await doc.getPage(1)).getTextContent()
  assert.doesNotMatch(content.items.map((i) => i.str).join(' '), /Check the dimension/)
})

test('an exported scan gets its recognized text as an invisible layer', async () => {
  const scan = join(work, 'Скан акта.pdf')
  const out = join(work, 'scan-searchable.pdf')
  // A page that is only a picture of text, drawn by the app's own Chromium.
  let run = await launch(freshData(), [])
  let png
  try {
    // Draw only once the app has settled, not while the window still loads.
    await run.page.waitForSelector('.tab-name')
    png = await run.page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 1240
      canvas.height = 1754
      const g = canvas.getContext('2d')
      g.fillStyle = '#fff'
      g.fillRect(0, 0, canvas.width, canvas.height)
      g.fillStyle = '#000'
      g.font = '56px Arial, sans-serif'
      g.fillText('Скважина 17 глубина', 120, 300)
      g.fillText('Protocol 2024', 120, 420)
      return canvas.toDataURL('image/png').split(',')[1]
    })
  } finally {
    await run.app.close()
  }
  const doc = await PDFDocument.create()
  const image = await doc.embedPng(Buffer.from(png, 'base64'))
  doc.addPage([595, 842]).drawImage(image, { x: 0, y: 0, width: 595, height: 842 })
  writeFileSync(scan, await doc.save())

  run = await launch(freshData(), [scan])
  try {
    await rendered(run.page)
    await mockSaveDialog(run.app, out)
    await menu(run.app, 'export-pdf')
    for (let i = 0; i < 300 && !existsSync(out); i++) await run.page.waitForTimeout(200)
  } finally {
    await run.app.close()
  }
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const result = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(out)) }).promise
  const content = await (await result.getPage(1)).getTextContent()
  const text = content.items.map((item) => item.str).join(' ')
  assert.match(text, /Скважина/)
  assert.match(text, /Protocol/)
  // The words lie where they were read: "Скважина" starts near the left edge,
  // a third of the way down the scan.
  const word = content.items.find((item) => item.str.includes('Скважина'))
  assert.ok(Math.abs(word.transform[4] - 54) < 12, `x ${word.transform[4]}`)
  assert.ok(Math.abs(word.transform[5] - (842 - 143)) < 20, `y ${word.transform[5]}`)
})

test('two revisions of a sheet are compared: removed red, added blue', async () => {
  const revA = join(work, 'КЖ лист 2 изм.0.pdf')
  const revB = join(work, 'КЖ лист 2 изм.1.pdf')
  for (const [file, x] of [
    [revA, 200],
    [revB, 400]
  ]) {
    const doc = await PDFDocument.create()
    const sheet = doc.addPage([842, 595])
    sheet.drawRectangle({
      x: 30,
      y: 30,
      width: 782,
      height: 535,
      borderWidth: 2,
      borderColor: rgb(0, 0, 0)
    })
    // The beam moved between the revisions.
    sheet.drawRectangle({ x, y: 250, width: 120, height: 40, color: rgb(0, 0, 0) })
    writeFileSync(file, await doc.save())
  }
  const { page, app } = await launch(freshData(), [revA, revB])
  try {
    await rendered(page)
    const pages = page.locator('.canvas-world .page[data-page-id]')
    await pages.nth(0).click()
    await pages.nth(1).click({ modifiers: ['Control'] })
    await pages.nth(1).click({ button: 'right' })
    await clickMenuItem(page, 'Compare the 2 pages')
    await page.waitForFunction(
      () => document.querySelector('.compare-stats')?.textContent === 'Changes found',
      null,
      { timeout: 20000 }
    )
    assert.match(await page.locator('.compare-name.older').textContent(), /изм\.0/)
    // Sample the overlay: the old beam's place is red, the new one's blue,
    // the frame both share is grey.
    const colours = await page.evaluate(() => {
      const canvas = document.querySelector('.compare-canvas')
      const ctx = canvas.getContext('2d')
      const at = (x, y) =>
        [
          ...ctx.getImageData(Math.round(canvas.width * x), Math.round(canvas.height * y), 1, 1)
            .data
        ].slice(0, 3)
      return {
        removed: at(260 / 842, 1 - 270 / 595),
        added: at(460 / 842, 1 - 270 / 595),
        frame: at(0.5, 1 - 30 / 595)
      }
    })
    const [r1, g1, b1] = colours.removed
    assert.ok(r1 > 200 && g1 < 80 && b1 < 80, `removed ${colours.removed}`)
    const [r2, , b2] = colours.added
    assert.ok(b2 > 200 && r2 < 80, `added ${colours.added}`)
    const [r3, g3, b3] = colours.frame
    assert.ok(r3 === g3 && g3 === b3 && r3 < 200, `frame ${colours.frame}`)

    // Arrows shift the new sheet; Reset puts it back.
    await page.keyboard.press('Shift+ArrowRight')
    assert.match(await page.locator('.compare-nudge').textContent(), /offset 10, 0 px/)
    await page.locator('.compare-nudge button', { hasText: 'Reset' }).click()
    await page.locator('.compare-view button[title="Swap old and new"]').click()
    await page.waitForFunction(() =>
      /изм\.1/.test(document.querySelector('.compare-name.older')?.textContent ?? '')
    )
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('.compare-view').count(), 0)
    assert.equal(await page.locator('.canvas-world .page[data-page-id]').count(), 2)
  } finally {
    await app.close()
  }
})

test('protected PDFs ask for their password and export as plain PDFs', async () => {
  const fixtures = join(import.meta.dirname, '..', 'src', 'main', 'test-pdfs')
  const locked = join(work, 'Акт (пароль).pdf')
  const restricted = join(work, 'Только чтение.pdf')
  writeFileSync(locked, readFileSync(join(fixtures, 'aes-256-user.pdf')))
  writeFileSync(restricted, readFileSync(join(fixtures, 'rc4-128.pdf')))
  const out = join(work, 'unlocked.pdf')
  const { app, page } = await launch(freshData(), [restricted, locked])
  try {
    const field = page.locator('.password-dialog input[type=password]')
    await field.waitFor()
    assert.match(await page.locator('.password-dialog').textContent(), /Акт \(пароль\)\.pdf/)
    await field.fill('wrong')
    await page.keyboard.press('Enter')
    await page.locator('.password-error').waitFor()
    await field.fill('1234')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelectorAll('.doc-name').length === 2)
    await mockSaveDialog(app, out)
    await menu(app, 'export-pdf')
    for (let i = 0; i < 30 && !existsSync(out); i++) await page.waitForTimeout(200)
  } finally {
    await app.close()
  }
  // Both documents' pages, readable without any password: the text (in a
  // standard font, so as glyph codes) is in each page's instructions.
  const doc = await PDFDocument.load(readFileSync(out))
  assert.equal(doc.getPageCount(), 2)
  const hex = Buffer.from('Secret drawing 42', 'latin1').toString('hex').toUpperCase()
  for (const page of doc.getPages()) {
    const contents = page.node.Contents()
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents]
    const text = refs
      .map((r) => doc.context.lookup(r))
      .filter((st) => st instanceof PDFRawStream)
      .map((st) => Buffer.from(decodePDFRawStream(st).decode()).toString('latin1'))
      .join('\n')
    assert.ok(text.includes('(Secret drawing 42)') || text.toUpperCase().includes(`<${hex}>`))
  }
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
    // The wheel turns pages up and down, one per notch.
    await page.mouse.move(640, 430)
    for (const [delta, expected] of [
      [100, '10'],
      [100, '11'],
      [-100, '10']
    ]) {
      await page.mouse.wheel(0, delta)
      await page.waitForTimeout(700)
      assert.equal(await page.locator('.full-count-input').inputValue(), expected)
    }
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

test('Ctrl+Shift+Plus and Minus rotate pages on the canvas and in the reader', async () => {
  const { app, page } = await launch(freshData(), [files.second])
  try {
    await rendered(page)
    const cells = page.locator('.canvas-world .page[data-page-id]')
    const shape = async (locator) => {
      const box = await locator.boundingBox()
      return box.width > box.height ? 'landscape' : 'portrait'
    }
    assert.equal(await shape(cells.nth(1)), 'portrait')
    await cells.nth(1).click()
    await page.keyboard.press('Control+Shift+Equal')
    await page.waitForTimeout(500)
    assert.equal(await shape(cells.nth(1)), 'landscape')
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(500)
    assert.equal(await shape(cells.nth(1)), 'portrait')

    await cells.first().dblclick()
    await page.waitForTimeout(1000)
    const current = page.locator('.full-page').first()
    assert.equal(await shape(current), 'portrait')
    await page.locator('.full-actions .btn[aria-label="Rotate right"]').click()
    await page.waitForTimeout(600)
    assert.equal(await shape(current), 'landscape')
    await page.keyboard.press('Control+Shift+Minus')
    await page.waitForTimeout(600)
    assert.equal(await shape(current), 'portrait')
    await page.keyboard.press('Control+Shift+Minus')
    await page.waitForTimeout(600)
    assert.equal(await shape(current), 'landscape')
    // Still on the same page, and the canvas shows the turn after closing.
    assert.equal(await page.locator('.full-count-input').inputValue(), '1')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    assert.equal(await shape(cells.first()), 'landscape')
  } finally {
    await app.close()
  }
})

test('files and pictures copied in other programs paste as documents', async () => {
  const { app, page } = await launch(freshData(), [files.report])
  // Counted in the toolbar: the canvas only draws the rows in view.
  const totals = () => page.locator('.toolbar-meta').textContent()
  try {
    await rendered(page)
    assert.match(await totals(), /1 document.*12 pages/)

    // A picture (a screenshot, a copied image) becomes a one-page document.
    await app.evaluate(
      async ({ clipboard, ClipboardItem, nativeImage }, file) => {
        const png = nativeImage.createFromPath(file).toPNG()
        await clipboard.write([
          new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })
        ])
      },
      join(import.meta.dirname, '..', 'resources', 'apple-touch-icon.png')
    )
    // The system clipboard may take a moment to offer what was written.
    await page.waitForFunction(
      async () => ((await window.api.readClipboardImage())?.length ?? 0) > 0
    )
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+v')
    await page.waitForFunction(() => document.querySelectorAll('.doc-name').length === 2, null, {
      timeout: 15000
    })
    assert.match(await totals(), /2 documents.*13 pages/)

    // Files copied in Explorer (on Windows the real Explorer format), or a
    // file manager's URI list elsewhere.
    if (process.platform === 'win32') {
      execFileSync('powershell.exe', [
        '-NoProfile',
        '-Command',
        `Set-Clipboard -Path '${files.second}', '${files.drawing}'`
      ])
    } else {
      await app.evaluate(
        ({ clipboard, ClipboardItem }, urls) =>
          clipboard.write([new ClipboardItem({ 'text/uri-list': urls })]),
        [files.second, files.drawing].map((f) => pathToFileURL(f).href).join('\r\n')
      )
    }
    await page.waitForFunction(async () => (await window.api.readClipboardFiles()).length === 2)
    // Nothing selected: they become new documents (with a page selected
    // they go after it).
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+v')
    await page.waitForFunction(() => document.querySelectorAll('.doc-name').length === 4, null, {
      timeout: 15000
    })
    assert.deepEqual((await texts(page, '.doc-name')).slice(2).sort(), [
      'КЖ лист 1',
      'Расчёт MIDAS'
    ])
    assert.match(await totals(), /4 documents.*17 pages/)

    // Text still pastes into text fields; a file list there is ignored, not
    // a crash.
    await page.keyboard.press('Control+f')
    const field = page.locator('.findbar-input')
    await app.evaluate(({ clipboard }) => clipboard.writeText('грунт'))
    await page.keyboard.press('Control+v')
    await page.waitForFunction(() => document.activeElement?.value === 'грунт')
    await app.evaluate(
      ({ clipboard, ClipboardItem }, url) =>
        clipboard.write([new ClipboardItem({ 'text/uri-list': url })]),
      pathToFileURL(files.second).href
    )
    await page.keyboard.press('Control+v')
    await page.waitForTimeout(500)
    assert.equal(await field.inputValue(), 'грунт')
  } finally {
    await app.close()
  }
})

test('Windows: "Open PDFs in PDFx" registers for the user and cleans up', async () => {
  if (process.platform !== 'win32') return
  const command = 'HKCU\\Software\\Classes\\PDFx.Document\\shell\\open\\command'
  const query = (key) => {
    try {
      return execFileSync('reg.exe', ['query', key, '/ve'], { encoding: 'utf8' })
    } catch {
      return null
    }
  }
  const { app, page } = await launch(freshData(), [files.second])
  try {
    await rendered(page)
    await menu(app, 'settings')
    const box = page.locator('.settings-choice', { hasText: 'Open PDFs in PDFx' }).locator('input')
    await box.check()
    for (let i = 0; i < 40 && !query(command); i++) await page.waitForTimeout(250)
    assert.match(query(command) ?? '', /electron\.exe" ".*" "%1"/i)
    assert.ok(query('HKCU\\Software\\Classes\\SystemFileAssociations\\.pdf\\shell\\PDFx'))
    await box.uncheck()
    for (let i = 0; i < 40 && query(command); i++) await page.waitForTimeout(250)
    assert.equal(query(command), null)
    assert.equal(query('HKCU\\Software\\PDFx'), null)
  } finally {
    await app.close()
  }
})

test('reader layouts: scroll by width, two pages, back to one at a time for editing', async () => {
  const { app, page } = await launch(freshData(), [files.report])
  const counter = () => page.locator('.full-count-input').inputValue()
  try {
    await rendered(page)
    await page.locator('.canvas-world .page[data-page-id]').nth(2).dblclick()
    await page.waitForTimeout(1000)
    await page.locator('.reader-layouts button[aria-label^="Scroll"]').click()
    await page.locator('.full-scroll.continuous').waitFor()
    assert.equal(await counter(), '3')
    // The wheel scrolls through the pages; the counter follows.
    await page.mouse.move(600, 500)
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 500)
      await page.waitForTimeout(60)
    }
    await page.waitForTimeout(500)
    assert.ok(Number(await counter()) > 4, `counter ${await counter()}`)
    // Typed page number jumps there.
    await page.locator('.full-count-input').fill('9')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)
    assert.equal(await counter(), '9')

    await page.locator('.reader-layouts button[aria-label^="Two"]').click()
    await page.waitForTimeout(600)
    const boxes = await page
      .locator('.full-page.cont')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top))
    // Pages side by side share their row.
    assert.ok(
      boxes.some((top, i) => boxes.some((other, j) => i !== j && Math.abs(top - other) < 1))
    )

    // Editing shows the page alone, and the layout comes back after.
    await page.locator('.full-actions .btn', { hasText: 'Edit' }).click()
    await page.waitForTimeout(500)
    assert.equal(await page.locator('.full-scroll.continuous').count(), 0)
    assert.equal(await page.locator('.reader-layouts button:disabled').count(), 3)
    await page.locator('.full-actions .btn', { hasText: 'Done' }).click()
    await page.locator('.full-scroll.continuous').waitFor()

    // Remembered for the next time the reader opens.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    await page.locator('.canvas-world .page[data-page-id]').first().dblclick()
    await page.waitForTimeout(1200)
    assert.equal(
      await page.locator('.reader-layouts button.on').getAttribute('aria-label'),
      'Two pages side by side'
    )
  } finally {
    await app.close()
  }
})

test('Open Recent reopens a file and offers to continue where reading stopped', async () => {
  const { app, page } = await launch(freshData(), [files.report])
  const recent = () =>
    app.evaluate(({ Menu }) => {
      const file = Menu.getApplicationMenu().items.find((i) => i.label === 'File')
      const item = file.submenu.items.find((i) => i.label === 'Open Recent')
      return item.submenu.items.map((i) => i.label)
    })
  try {
    await rendered(page)
    assert.match((await recent())[0], /Технический отчёт ИГИ\.pdf/)
    await page.locator('.canvas-world .page[data-page-id]').nth(4).dblclick()
    await page.waitForTimeout(1000)
    assert.equal(await page.locator('.full-count-input').inputValue(), '5')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    await page.locator('.doc-name').first().click({ button: 'right' })
    await clickMenuItem(page, 'Remove document')
    await page.waitForFunction(() => document.querySelectorAll('.doc-name').length === 0)

    await app.evaluate(({ Menu }) => {
      const file = Menu.getApplicationMenu().items.find((i) => i.label === 'File')
      const item = file.submenu.items.find((i) => i.label === 'Open Recent')
      item.submenu.items[0].click()
    })
    const offer = page.locator('.notice', { hasText: 'continue reading at page 5' })
    await offer.waitFor()
    await offer.locator('.notice-btn', { hasText: 'Open page 5' }).click()
    await page.waitForTimeout(1000)
    assert.equal(await page.locator('.full-count-input').inputValue(), '5')
  } finally {
    await app.close()
  }
})

test('drawing layers can be hidden, and stay in the export switched off', async () => {
  const { app, page } = await launch(freshData(), [files.layered])
  const out = join(work, 'layers.pdf')
  // The colour of the reader page at a point (fractions of the page).
  const colour = (fx, fy) =>
    page.evaluate(
      ([x, y]) => {
        const canvas = document.querySelector('.full-page canvas')
        const at = canvas
          .getContext('2d')
          .getImageData(Math.round(canvas.width * x), Math.round(canvas.height * y), 1, 1).data
        return [at[0], at[1], at[2]]
      },
      [fx, fy]
    )
  try {
    await rendered(page)
    await page.locator('.canvas-world .page[data-page-id]').first().dblclick()
    await page.waitForTimeout(1200)
    if (!(await page.locator('.fv-sidebar').count())) await page.keyboard.press('F4')
    await page.locator('.fv-sidebar-tabs button', { hasText: 'Layers' }).click()
    assert.deepEqual(await texts(page, '.fv-layer span'), ['Арматура', 'Размеры'])
    // The dimension line (blue) runs across the upper right.
    const [r0, , b0] = await colour(0.7, 0.25)
    assert.ok(b0 > 150 && r0 < 100, `before ${r0},${b0}`)
    await page.locator('.fv-layer', { hasText: 'Размеры' }).locator('input').uncheck()
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.full-page canvas')
      const at = canvas
        .getContext('2d')
        .getImageData(Math.round(canvas.width * 0.7), Math.round(canvas.height * 0.25), 1, 1).data
      return at[0] > 200 && at[2] > 200
    })
    // The reinforcement (red) is still there.
    const [r1, g1] = await colour(50 / 600, 0.75)
    assert.ok(r1 > 150 && g1 < 100, `rebar ${r1},${g1}`)

    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    await mockSaveDialog(app, out)
    await menu(app, 'export-pdf')
    for (let i = 0; i < 30 && !existsSync(out); i++) await page.waitForTimeout(200)
  } finally {
    await app.close()
  }
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(out)) }).promise
  const config = await doc.getOptionalContentConfig()
  const state = Object.fromEntries([...config].map(([, g]) => [g.name, g.visible]))
  assert.deepEqual(state, { Арматура: true, Размеры: false })
})

test("other people's comments in a PDF join the panel and are answered in place", async () => {
  const { app, page } = await launch(freshData(), [files.reviewed])
  const out = join(work, 'answered.pdf')
  try {
    await rendered(page)
    // One open thread (the highlight's was closed in the other program).
    await page.waitForFunction(() => document.querySelector('.page-comments')?.textContent === '1')
    await page.locator('.canvas-world .page[data-page-id]').first().dblclick()
    await page.waitForTimeout(1000)
    if (!(await page.locator('.comments-panel').count())) await page.keyboard.press('F6')
    const card = page.locator('.comment-card').first()
    assert.equal(await page.locator('.comment-card').count(), 1)
    assert.match(await card.textContent(), /Иванов.*Проверьте размер.*Петров.*Исправлено/s)
    assert.match(await card.textContent(), /in the file/)
    await card.click()
    // Someone else's words can't be edited or deleted here.
    assert.equal(await card.locator('.comment-tools:visible').count(), 0)
    await card.locator('.comment-reply-btn').click()
    await page.keyboard.type('Согласен')
    await page.keyboard.press('Enter')
    await page.locator('.comments-filter input').check()
    assert.match(
      await page.locator('.comment-card.resolved').textContent(),
      /Уточнить марку бетона/
    )
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    await mockSaveDialog(app, out)
    await menu(app, 'export-pdf')
    for (let i = 0; i < 30 && !existsSync(out); i++) await page.waitForTimeout(200)
  } finally {
    await app.close()
  }
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(out)) }).promise
  const notes = await (await doc.getPage(1)).getAnnotations()
  const byText = (t) => notes.filter((n) => n.contentsObj?.str === t)
  // The file's own comments once each, the new reply under the note.
  assert.equal(byText('Проверьте размер').length, 1)
  assert.equal(byText('Исправлено').length, 1)
  assert.equal(byText('Уточнить марку бетона').length, 1)
  const root = byText('Проверьте размер')[0]
  assert.equal(byText('Согласен')[0]?.inReplyTo, root.id)
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

test('settings persist; help, about and an update from a folder', async () => {
  const data = freshData()
  // A release in a folder instead of GitHub: latest.json and the ZIP.
  const feed = mkdtempSync(join(work, 'feed-'))
  const zip = zipSync({
    'pdfx.exe': strToU8('MZ'),
    'resources/app.asar': strToU8('asar'),
    'version.json': strToU8('{"version":"9.9.9","commit":"e2e","channel":"stable"}')
  })
  writeFileSync(join(feed, 'PDFx-Windows-Portable.zip'), zip)
  const sha256 = createHash('sha256').update(zip).digest('hex')
  writeFileSync(
    join(feed, 'latest.json'),
    JSON.stringify({ version: '9.9.9', sha256, notes: ['Settings, About and Help'] })
  )
  const env = { PDFX_UPDATE_FEED: feed }
  const scale = async (page) => Number(/scale\(([\d.]+)/.exec(await worldTransform(page))?.[1])
  const dialogTitle = (page) => page.locator('.dialog-title span').first().innerText()

  let { app, page } = await launch(data, [files.second], env)
  try {
    await rendered(page)
    await menu(app, 'settings')
    await page.locator('.settings-choice', { hasText: 'Zooms, as in CAD' }).click()
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('.dialog').count(), 0)

    await menu(app, 'help')
    assert.equal(await dialogTitle(page), 'PDFx Help')
    await page.locator('.help-tabs button', { hasText: 'Keyboard' }).click()
    assert.ok((await page.locator('.help-shortcuts tr').count()) > 20)
    await page.keyboard.press('Escape')

    await menu(app, 'about')
    await page.waitForFunction(() =>
      /^PDFx \d+\.\d+\.\d+/.test(document.querySelector('.about-name')?.textContent ?? '')
    )
    await page.locator('.about-actions .btn', { hasText: 'Check for updates' }).click()
    await page.waitForFunction(() =>
      document.querySelector('.dialog-title span')?.textContent?.includes('9.9.9 is available')
    )
    await page.locator('.dialog-footer .btn', { hasText: 'Update' }).click()
    await page.waitForFunction(() =>
      document.querySelector('.dialog-title span')?.textContent?.includes('is ready')
    )
    assert.ok(existsSync(join(data, 'updates', 'staged', 'resources', 'app.asar')))
  } finally {
    await app.close()
  }
  assert.equal(JSON.parse(readFileSync(join(data, 'settings.json'), 'utf8')).wheel, 'zoom')
  ;({ app, page } = await launch(data, [], env))
  try {
    await rendered(page)
    // The unpacked update waits for a restart; the wheel now zooms.
    assert.match(await page.locator('.update-badge').innerText(), /Restart to update/)
    const before = await scale(page)
    const box = await page.locator('.canvas-world .page[data-page-id]').first().boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -100)
    await page.waitForTimeout(600)
    assert.ok((await scale(page)) > before * 1.1)
  } finally {
    await app.close()
  }
})

let failed = 0
// E2E_ONLY=<part of a name> runs just the matching scenarios.
const only = process.env.E2E_ONLY
for (const { name, fn } of tests.filter((t) => !only || t.name.includes(only))) {
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
