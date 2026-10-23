// Writes build/stamp/version.json, which electron-builder puts next to
// pdfx.exe: the version, commit and channel the updater compares and shows.
// Usage: node scripts/stamp-version.mjs [--version 1.0.12] [--commit abc1234]
//        [--channel stable|beta|ci|dev] [--package]
// --package also writes the version into package.json (release builds).
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const args = process.argv.slice(2)
const option = (name) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? undefined : args[i + 1]
}
const pkgPath = join(ROOT, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const git = () => {
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: ROOT }).toString().trim()
  } catch {
    return ''
  }
}

const version = option('version') ?? pkg.version
const commit = option('commit') ?? git()
const channel = option('channel') ?? 'dev'
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`bad version ${version}`)

if (args.includes('--package')) {
  pkg.version = version
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
}
const dir = join(ROOT, 'build', 'stamp')
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'version.json'), `${JSON.stringify({ version, commit, channel })}\n`)
console.log(`[stamp] PDFx ${version} ${commit} (${channel})`)
