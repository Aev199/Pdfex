// Test documents, generated so the suite needs no binary fixtures: a
// Cyrillic text report, a large-format drawing and a short second report.
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const FONT = new URL('../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf', import.meta.url)
const WORDS = 'грунт суглинок песок скважина слой влажность плотность модуль деформации'.split(' ')

async function report(pages, title) {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(readFileSync(FONT), { subset: true })
  for (let n = 1; n <= pages; n++) {
    const page = doc.addPage([595, 842])
    page.drawText(`${title} — страница ${n}`, { x: 50, y: 790, size: 16, font })
    for (let line = 0; line < 40; line++) {
      const text = Array.from({ length: 9 }, (_, i) => WORDS[(n + line + i) % WORDS.length]).join(
        ' '
      )
      page.drawText(text, { x: 50, y: 750 - line * 17, size: 11, font })
    }
  }
  return doc.save()
}

async function drawing() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([2384, 1684]) // A1 landscape
  for (let i = 0; i < 400; i++) {
    page.drawLine({
      start: { x: 40 + i * 5.8, y: 40 },
      end: { x: 40 + i * 5.8, y: 1640 },
      thickness: 0.3,
      color: rgb(0, 0, 0)
    })
  }
  page.drawRectangle({
    x: 40,
    y: 40,
    width: 2304,
    height: 1604,
    borderWidth: 2,
    borderColor: rgb(0, 0, 0)
  })
  return doc.save()
}

export async function makeFixtures(dir) {
  const files = {
    report: join(dir, 'Технический отчёт ИГИ.pdf'),
    drawing: join(dir, 'КЖ лист 1.pdf'),
    second: join(dir, 'Расчёт MIDAS.pdf')
  }
  writeFileSync(files.report, await report(12, 'Технический отчёт'))
  writeFileSync(files.drawing, await drawing())
  writeFileSync(files.second, await report(3, 'Расчётный отчёт'))
  return files
}
