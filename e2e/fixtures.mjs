// Test documents, generated so the suite needs no binary fixtures: a
// Cyrillic text report, a large-format drawing and a short second report.
import { PDFDocument, PDFHexString, PDFName, PDFNumber, PDFOperator, PDFString, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'

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

// A drawing with two layers (optional content groups), as CAD programs
// export them: reinforcement drawn red, dimensions blue.
export async function layeredDrawing() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([600, 400])
  const ocg = (name) =>
    doc.context.register(doc.context.obj({ Type: 'OCG', Name: PDFHexString.fromText(name) }))
  const rebar = ocg('Арматура')
  const dims = ocg('Размеры')
  page.node
    .normalizedEntries()
    .Resources.set(PDFName.of('Properties'), doc.context.obj({ L1: rebar, L2: dims }))
  const op = (name, ...args) =>
    PDFOperator.of(
      name,
      args.map((a) => (typeof a === 'number' ? PDFNumber.of(a) : a))
    )
  page.pushOperators(
    op('BDC', PDFName.of('OC'), PDFName.of('L1')),
    ...[op('q'), op('RG', 1, 0, 0), op('w', 12), op('re', 50, 50, 200, 100), op('S'), op('Q')],
    op('EMC'),
    op('BDC', PDFName.of('OC'), PDFName.of('L2')),
    ...[
      op('q'),
      op('RG', 0, 0, 1),
      op('w', 12),
      op('m', 300, 300),
      op('l', 550, 300),
      op('S'),
      op('Q')
    ],
    op('EMC')
  )
  doc.catalog.set(
    PDFName.of('OCProperties'),
    doc.context.obj({
      OCGs: [rebar, dims],
      D: { Order: [rebar, dims], ON: [rebar, dims] }
    })
  )
  return doc.save()
}

// A report reviewed in another program: a sticky note with a reply, and a
// highlight whose comment was marked Completed.
export async function reviewedReport() {
  const doc = await PDFDocument.load(await report(1, 'Отчёт с замечаниями'))
  const page = doc.getPage(0)
  const ctx = doc.context
  const text = (s) => PDFHexString.fromText(s)
  const annot = (fields) =>
    ctx.register(
      ctx.obj({
        Type: 'Annot',
        CreationDate: PDFString.of('D:20261020110000Z'),
        M: PDFString.of('D:20261020110000Z'),
        ...fields
      })
    )
  const note = annot({
    Subtype: 'Text',
    Rect: [100, 700, 120, 720],
    Contents: text('Проверьте размер'),
    T: text('Иванов')
  })
  const reply = annot({
    Subtype: 'Text',
    Rect: [100, 700, 120, 720],
    IRT: note,
    Contents: text('Исправлено'),
    T: text('Петров')
  })
  const highlight = annot({
    Subtype: 'Highlight',
    Rect: [50, 500, 300, 520],
    QuadPoints: [50, 520, 300, 520, 50, 500, 300, 500],
    C: [1, 1, 0],
    Contents: text('Уточнить марку бетона'),
    T: text('Сидоров')
  })
  const done = annot({
    Subtype: 'Text',
    Rect: [50, 500, 70, 520],
    IRT: highlight,
    F: 30,
    State: PDFString.of('Completed'),
    StateModel: PDFString.of('Review'),
    Contents: text('Completed set by Сидоров'),
    T: text('Сидоров')
  })
  page.node.set(PDFName.of('Annots'), ctx.obj([note, reply, highlight, done]))
  return doc.save()
}

// The smallest Word document Word and LibreOffice will open.
function docx(paragraphs) {
  const body = paragraphs
    .map((t) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`)
    .join('')
  return zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
    ),
    'word/document.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`
    )
  })
}

export async function makeFixtures(dir) {
  const files = {
    report: join(dir, 'Технический отчёт ИГИ.pdf'),
    drawing: join(dir, 'КЖ лист 1.pdf'),
    second: join(dir, 'Расчёт MIDAS.pdf'),
    word: join(dir, 'Пояснительная записка.docx'),
    layered: join(dir, 'КЖ слои.pdf'),
    reviewed: join(dir, 'Отчёт с замечаниями.pdf')
  }
  writeFileSync(files.reviewed, await reviewedReport())
  writeFileSync(files.layered, await layeredDrawing())
  writeFileSync(
    files.word,
    docx(['Пояснительная записка', 'Расчётное сопротивление грунта R = 250 кПа'])
  )
  writeFileSync(files.report, await report(12, 'Технический отчёт'))
  writeFileSync(files.drawing, await drawing())
  writeFileSync(files.second, await report(3, 'Расчётный отчёт'))
  return files
}
