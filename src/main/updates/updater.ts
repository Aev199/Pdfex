import { app, shell } from 'electron'
import { spawn } from 'child_process'
import originalFs from 'original-fs'
import { dirname, join } from 'path'
import { getMainWindow } from '../window'
import { getSettings, onSettingsChanged, rememberForUpdater, updaterMemory } from '../settings'
import {
  browserUrl,
  offerFrom,
  parseManifest,
  pickRelease,
  releasesUrl,
  ZIP_ASSET
} from './releases'
import { HttpError, extractZip, fetchZip, getJson, verifyUnpacked } from './stage'
import { findDownloaded, parseStamp } from './local'
import type { Stamp } from './local'
import { compareVersions } from './version'
import applyScript from './apply.ps1?raw'
import type { AppInfo, UpdateOffer, UpdateState } from '../../preload/app-types'

// Not Electron's fs: it would treat the update's app.asar as a folder.
const { appendFileSync, existsSync, openSync, readFileSync, writeFileSync } = originalFs
const { rename, rm, writeFile, readFile, unlink, mkdir } = originalFs.promises

// Updates as in Papka: GitHub releases with latest.json (version, SHA-256,
// notes), stable and beta channels, a quiet daily check, a ZIP fetched by the
// browser when only the browser may go online, the previous version kept for
// a rollback. Unlike Papka's single EXE, the portable build is a folder that
// can't be replaced while it runs: the new version is unpacked next to it and
// a hidden PowerShell script swaps the folders once PDFx has closed.

const DAY_MS = 24 * 60 * 60 * 1000
const FIRST_CHECK_MS = 8000
const LOOP_MS = 60 * 60 * 1000
// How long PDFx watches Downloads for the file the browser is fetching.
const WATCH_MS = 20 * 60 * 1000

const appDir = (): string => dirname(process.execPath)
const updatesDir = (): string => join(app.getPath('userData'), 'updates')
const staged = (): string => join(updatesDir(), 'staged')
const previous = (): string => join(updatesDir(), 'previous')
const resultFile = (): string => join(updatesDir(), 'result.json')
// Written when PDFx hands the swap over on quit; the script's result.json
// answers it. One without the other at the next start: the swap never ran.
const handoffFile = (): string => join(updatesDir(), 'handoff.json')
const logFile = (): string => join(updatesDir(), 'update.log')

function log(text: string): void {
  try {
    appendFileSync(logFile(), `${new Date().toISOString().slice(0, 19)} ${text}\r\n`)
  } catch {
    // the log is a convenience
  }
}

const readJson = async (path: string): Promise<Record<string, unknown>> =>
  // PowerShell 5 writes UTF-8 with a byte order mark.
  JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, '')) as Record<string, unknown>
// A folder (or URL) holding latest.json and the ZIP, instead of GitHub; for
// tests and for networks where GitHub is closed.
const feed = (): string | undefined => process.env.PDFX_UPDATE_FEED || undefined

let stamp: Stamp = { version: '0.0.0', commit: '', channel: 'dev' }
let portable = false
let state: UpdateState = { phase: { kind: 'idle' }, dialog: false, note: null, applied: null }
let relaunch = false
let watching = false

function readStamp(): Stamp {
  const file = join(appDir(), 'version.json')
  const parsed = app.isPackaged && existsSync(file) ? parseStamp(readFileSync(file, 'utf8')) : null
  return parsed ?? { version: app.getVersion(), commit: '', channel: 'dev' }
}

// Only stamped portable Windows releases replace themselves; a dev build
// would always look outdated.
// Windows CI runs the whole update on a "ci" build: find it in a feed
// folder, download, close, swap, start again (scripts/test-update-e2e.ps1).
const selfTest = (): boolean =>
  !!process.env.PDFX_UPDATE_SELFTEST && !!feed() && app.isPackaged && process.platform === 'win32'

function isRelease(): boolean {
  const release = stamp.channel === 'stable' || stamp.channel === 'beta'
  return (process.platform === 'win32' && app.isPackaged && release && !!stamp.commit) || selfTest()
}

// Checks run in any release; installing also needs the data folder next to
// pdfx.exe (download() explains when it isn't writable).
export function canSelfUpdate(): boolean {
  return isRelease() || !!feed()
}

function previousVersion(): string | null {
  const file = join(previous(), 'version.json')
  if (!existsSync(file)) return null
  return parseStamp(readFileSync(file, 'utf8'))?.version ?? null
}

export function appInfo(): AppInfo {
  return {
    version: stamp.version,
    commit: stamp.commit,
    channel: stamp.channel,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    dataDir: app.getPath('userData'),
    appDir: appDir(),
    canSelfUpdate: canSelfUpdate(),
    previousVersion: previousVersion()
  }
}

export const updateState = (): UpdateState => state

function set(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch }
  getMainWindow()?.webContents.send('pdfx:updates', state)
}

const busy = (): boolean => state.phase.kind === 'checking' || state.phase.kind === 'downloading'

export async function initUpdater(dataPortable: boolean): Promise<void> {
  portable = dataPortable
  stamp = readStamp()
  const dir = updatesDir()
  // The outcome of the swap done when PDFx last closed.
  const handoff = await readJson(handoffFile()).catch(() => null)
  await unlink(handoffFile()).catch(() => {})
  try {
    const result = await readJson(resultFile())
    await unlink(resultFile())
    state.applied = {
      ok: result.ok === true,
      version: typeof result.version === 'string' ? result.version : '',
      message: typeof result.message === 'string' ? result.message : ''
    }
    log(
      `started as ${stamp.version}; the swap reported ${result.ok === true ? 'success' : 'failure'}`
    )
  } catch {
    if (handoff) {
      // PowerShell never got to write its result: blocked by policy or an
      // antivirus, or not started at all.
      const version = typeof handoff.version === 'string' ? handoff.version : ''
      state.applied = {
        ok: false,
        version,
        message: `Windows did not run the PowerShell step that replaces the files. Details: ${logFile()}`
      }
      log(`started as ${stamp.version}; no result from the swap to ${version}`)
    }
  }
  await rm(join(dir, 'download.zip.part'), { force: true }).catch(() => {})
  await rm(join(dir, 'staged.tmp'), { recursive: true, force: true }).catch(() => {})
  await rm(join(dir, 'previous.new'), { recursive: true, force: true }).catch(() => {})
  // Unpacked earlier but never applied: offer the restart again.
  try {
    const offer = JSON.parse(await readFile(join(dir, 'staged.json'), 'utf8')) as UpdateOffer
    if (
      compareVersions(offer.version, stamp.version) > 0 &&
      existsSync(join(staged(), 'pdfx.exe'))
    ) {
      state.phase = { kind: 'ready', offer }
    } else {
      await rm(staged(), { recursive: true, force: true })
      await unlink(join(dir, 'staged.json'))
    }
  } catch {
    // nothing staged
  }

  // The window may have asked before this was read.
  set({})

  let channel = getSettings().updateChannel
  onSettingsChanged((settings) => {
    // Another channel may offer another version; a download in progress or
    // an unpacked update is left alone.
    const changed = settings.updateChannel !== channel
    channel = settings.updateChannel
    if (changed && ['available', 'failed', 'blocked'].includes(state.phase.kind)) {
      set({ phase: { kind: 'idle' }, dialog: false })
    }
  })

  if (selfTest() && state.phase.kind === 'idle') {
    log('self-test: looking for an update')
    await check(true)
    // check() and download() move the phase on; TypeScript can't see that.
    const phase = (): string => updateState().phase.kind
    if (phase() === 'available') await download()
    if (phase() === 'ready') restart()
    return
  }

  if (!canSelfUpdate()) return
  const tick = (): void => {
    if (!getSettings().updateAuto || state.phase.kind !== 'idle') return
    // Downloads cost nothing to look at: every hour. GitHub once a day.
    const online = Date.now() - (updaterMemory().checkedAt ?? 0) >= DAY_MS
    void check(false, online)
  }
  setTimeout(() => {
    tick()
    setInterval(tick, LOOP_MS).unref()
  }, FIRST_CHECK_MS).unref()
}

type Outcome =
  | { kind: 'found'; offer: UpdateOffer }
  | { kind: 'latest' }
  | { kind: 'blocked'; reason: string }
  | { kind: 'failed'; reason: string }

async function lookOnline(): Promise<UpdateOffer | null> {
  const channel = getSettings().updateChannel
  const source = feed()
  if (source) {
    const manifest = parseManifest(await getJson(join(source, 'latest.json')))
    if (compareVersions(manifest.version, stamp.version) <= 0) return null
    return {
      version: manifest.version,
      commit: manifest.commit,
      notes: manifest.notes,
      sha256: manifest.sha256,
      url: join(source, ZIP_ASSET),
      page: source,
      prerelease: manifest.channel === 'beta'
    }
  }
  const candidate = pickRelease(await getJson(releasesUrl()), channel)
  if (!candidate || compareVersions(candidate.version, stamp.version) <= 0) return null
  return offerFrom(candidate, parseManifest(await getJson(candidate.manifestUrl)))
}

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export async function check(manual: boolean, online = true): Promise<void> {
  if (busy()) return
  // Unpacked or rolled back but not restarted: this process still reports
  // the old version, so a check would offer the same update again.
  if (state.phase.kind === 'ready' || state.phase.kind === 'rollback') {
    if (manual) set({ dialog: true })
    return
  }
  set({ phase: { kind: 'checking' }, note: null })
  const { skippedVersion } = updaterMemory()
  // A skipped version is passed over, not allowed to hide newer ones.
  const skipped = manual ? undefined : skippedVersion
  let best: UpdateOffer | null = null
  const consider = (offer: UpdateOffer | null): void => {
    if (!offer || offer.version === skipped) return
    if (!best || compareVersions(offer.version, best.version) > 0) best = offer
  }
  consider(await findDownloaded(app.getPath('downloads'), stamp.version).catch(() => null))
  let outcome: Outcome = { kind: 'latest' }
  if (online) {
    try {
      consider(await lookOnline())
    } catch (error) {
      outcome =
        error instanceof HttpError || (error instanceof Error && !isNetworkError(error))
          ? { kind: 'failed', reason: reason(error) }
          : { kind: 'blocked', reason: reason(error) }
    }
    rememberForUpdater({ checkedAt: Date.now() })
  }
  if (best) outcome = { kind: 'found', offer: best }
  // Something else moved on meanwhile: keep it.
  if (state.phase.kind !== 'checking') return
  const channelLabel = getSettings().updateChannel === 'stable' ? 'stable' : 'all builds'
  switch (outcome.kind) {
    case 'found':
      // A quiet check only lights the badge.
      set({ phase: { kind: 'available', offer: outcome.offer }, dialog: manual })
      break
    case 'latest':
      set({
        phase: { kind: 'idle' },
        note: manual ? `You have the latest version (${channelLabel})` : null
      })
      break
    case 'blocked':
      set(
        manual
          ? { phase: { kind: 'blocked', reason: outcome.reason }, dialog: true }
          : { phase: { kind: 'idle' } }
      )
      break
    case 'failed':
      set({ phase: { kind: 'idle' }, note: manual ? `Could not check: ${outcome.reason}` : null })
      break
  }
}

// Chromium reports network trouble as net::ERR_* (no connection, proxy,
// certificate swapped by an antivirus...).
const isNetworkError = (error: Error): boolean =>
  /net::|ERR_|ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|fetch failed/i.test(error.message)

async function writable(dir: string): Promise<boolean> {
  const probe = join(dir, `.update-test-${process.pid}`)
  try {
    await writeFile(probe, '')
    await unlink(probe)
    return true
  } catch {
    return false
  }
}

let offered: UpdateOffer | null = null

export async function download(): Promise<void> {
  const phase = state.phase
  const offer =
    phase.kind === 'available' ? phase.offer : phase.kind === 'failed' ? phase.offer : null
  if (!offer) return
  offered = offer
  const fail = (message: string): void =>
    set({ phase: { kind: 'failed', message, offer }, dialog: true })
  if (!feed() && process.platform !== 'win32') {
    fail('Updates install only in the Windows version')
    return
  }
  if (!feed() && (!portable || !(await writable(appDir())))) {
    fail(
      'PDFx may not write to its program folder. Download the new version from the release page and unpack it over the old one.'
    )
    return
  }
  set({ phase: { kind: 'downloading', offer, done: 0, total: null }, dialog: state.dialog })
  const dir = updatesDir()
  const part = join(dir, 'download.zip.part')
  const unpacked = join(dir, 'staged.tmp')
  let shown = 0
  try {
    await mkdir(dir, { recursive: true })
    const sha = await fetchZip(offer.url, part, (done, total) => {
      const now = Date.now()
      if (now - shown < 200 && done !== total) return
      shown = now
      if (state.phase.kind === 'downloading') set({ phase: { ...state.phase, done, total } })
    })
    if (offer.sha256 && sha !== offer.sha256) {
      throw new Error('the checksum of the downloaded file does not match')
    }
    await rm(unpacked, { recursive: true, force: true })
    await extractZip(part, unpacked)
    await verifyUnpacked(unpacked, offer.version)
    await rm(staged(), { recursive: true, force: true })
    await rename(unpacked, staged())
    await writeFile(join(dir, 'staged.json'), JSON.stringify(offer))
    set({ phase: { kind: 'ready', offer }, dialog: true })
  } catch (error) {
    await rm(unpacked, { recursive: true, force: true }).catch(() => {})
    fail(`The update was not installed: ${reason(error)}`)
  } finally {
    await rm(part, { force: true }).catch(() => {})
  }
}

export function retryOffer(): UpdateOffer | null {
  return offered
}

export function skip(): void {
  if (state.phase.kind === 'available')
    rememberForUpdater({ skippedVersion: state.phase.offer.version })
  set({ phase: { kind: 'idle' }, dialog: false })
}

export function dismiss(): void {
  set({ dialog: false, applied: null })
}

// The unpacked new version, for installing it by hand.
export function stagedFolder(): string {
  return staged()
}

export function show(): void {
  set({ dialog: true })
}

export function rollback(): void {
  const version = previousVersion()
  if (!version || busy()) return
  set({ phase: { kind: 'rollback', version }, dialog: true })
}

export function cancelPending(): void {
  if (state.phase.kind === 'rollback') set({ phase: { kind: 'idle' }, dialog: false })
}

// Opens the release in the browser (the one program allowed out) and
// watches Downloads until the file arrives.
export function downloadInBrowser(): void {
  void shell.openExternal(browserUrl(getSettings().updateChannel))
  set({
    phase: { kind: 'idle' },
    dialog: false,
    note: 'Download the ZIP in the browser: PDFx will notice it in Downloads and offer to install it.'
  })
  if (watching) return
  watching = true
  const started = Date.now()
  const poll = async (): Promise<void> => {
    if (Date.now() - started > WATCH_MS) {
      watching = false
      return
    }
    const found = await findDownloaded(app.getPath('downloads'), stamp.version).catch(() => null)
    if (found && ['idle', 'blocked'].includes(state.phase.kind)) {
      watching = false
      set({ phase: { kind: 'available', offer: found }, dialog: true, note: null })
      return
    }
    setTimeout(() => void poll(), 3000)
  }
  setTimeout(() => void poll(), 3000)
}

// Saves the session (the window's close handshake) and quits; the swap runs
// once this process is gone and starts the new version.
export function restart(): void {
  if (state.phase.kind !== 'ready' && state.phase.kind !== 'rollback') return
  relaunch = true
  app.quit()
}

// Called from will-quit: hands an unpacked update or a requested rollback to
// the swap script. A plain close applies it too, without starting PDFx again.
export function applyOnQuit(): void {
  // Only a real portable release swaps its folder; a test feed run from
  // node_modules/electron must never touch it.
  if (!isRelease() || !portable) return
  const phase = state.phase
  let args: Record<string, string> | null = null
  const dir = updatesDir()
  if (phase.kind === 'ready') {
    args = {
      InDir: staged(),
      OutDir: join(dir, 'previous.new'),
      KeepDir: previous(),
      Version: phase.offer.version
    }
  } else if (phase.kind === 'rollback') {
    args = {
      InDir: previous(),
      OutDir: join(dir, 'previous.swap'),
      KeepDir: previous(),
      Version: phase.version
    }
  }
  if (!args) return
  try {
    // A plain script file rather than an encoded command line: antivirus
    // behaviour rules single out hidden -EncodedCommand runs.
    const script = join(dir, 'apply.ps1')
    writeFileSync(script, `\uFEFF${applyScript}`)
    writeFileSync(handoffFile(), JSON.stringify({ version: args.Version, kind: phase.kind }))
    const params = {
      ...args,
      AppDir: appDir(),
      ResultFile: resultFile(),
      Relaunch: relaunch ? '1' : '',
      WaitPid: String(process.pid)
    }
    const output = openSync(join(dir, 'powershell.log'), 'w')
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-File',
        script,
        // Empty values are left out: -File may drop an empty argument and
        // shift the next one into its place.
        ...Object.entries(params)
          .filter(([, value]) => value !== '')
          .flatMap(([key, value]) => [`-${key}`, value])
      ],
      // PowerShell's own output and errors go to a file: whatever stops it
      // before the script logs anything shows up there.
      { detached: true, stdio: ['ignore', output, output], windowsHide: true, cwd: dir }
    )
    child.unref()
    log(
      `PDFx ${stamp.version} closing; swap to ${args.Version} handed to PowerShell (pid ${child.pid ?? '?'})`
    )
  } catch (error) {
    log(`could not start PowerShell: ${reason(error)}`)
  }
}
