// Checks that an unpacked Windows build carries everything the app needs to
// run offline. Usage: node scripts/verify-portable.mjs [dist/win-unpacked]
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2] ?? 'dist/win-unpacked'
const res = join(dir, 'resources')

const required = [
  'pdfx.exe',
  'README.txt',
  'version.json',
  'resources/app.asar',
  'resources/ocr/worker.min.js',
  'resources/pdf/standard_fonts',
  'resources/pdf/openjpeg.wasm',
  'resources/pdf/jbig2.wasm',
  'resources/pdf/DejaVuSans.ttf'
]
const ocrLangs = ['eng', 'rus']

const problems = []
for (const rel of required) {
  if (!existsSync(join(dir, rel))) problems.push(`missing ${rel}`)
}
for (const lang of ocrLangs) {
  const file = join(res, 'ocr', 'lang', `${lang}.traineddata.gz`)
  if (!existsSync(file)) problems.push(`missing OCR language ${lang}`)
}
const core = existsSync(join(res, 'ocr', 'core')) ? readdirSync(join(res, 'ocr', 'core')) : []
if (!core.some((f) => f.endsWith('.wasm'))) problems.push('missing OCR wasm core')

if (problems.length > 0) {
  console.error(`[verify-portable] ${dir} is incomplete:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}

const size = (p) => {
  const info = statSync(p)
  if (!info.isDirectory()) return info.size
  return readdirSync(p).reduce((sum, f) => sum + size(join(p, f)), 0)
}
console.log(`[verify-portable] OK — ${(size(dir) / 1024 / 1024).toFixed(0)} MB unpacked.`)
