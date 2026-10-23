import { app } from 'electron'
import { join } from 'path'
import { userInfo } from 'os'
import { readFileSync } from 'fs'
import { rename, writeFile } from 'fs/promises'
import type { Settings } from '../preload/app-types'

// User preferences and small bits of updater state, kept as JSON in the data
// folder (next to pdfx.exe in the portable build).

export const DEFAULT_SETTINGS: Settings = {
  updateAuto: true,
  updateChannel: 'stable',
  wheel: 'scroll',
  ocrLanguage: 'rus+eng',
  office: 'auto',
  restoreSession: true,
  commentAuthor: '',
  exportOcr: true
}

// The Windows account name signs comments until the user picks a name.
function accountName(): string {
  try {
    return userInfo().username.trim().slice(0, 60)
  } catch {
    return ''
  }
}

// Updater bookkeeping that is not a user preference.
interface UpdaterMemory {
  skippedVersion?: string
  checkedAt?: number
}

interface Stored extends Settings, UpdaterMemory {}

const file = (): string => join(app.getPath('userData'), 'settings.json')

let stored: Stored | null = null
const listeners = new Set<(settings: Settings) => void>()

// Keeps only known keys of the right type, so a hand-edited or older file
// can never break the app.
export function sanitize(raw: unknown): Stored {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const pick = <K extends keyof Settings>(key: K, ok: (v: unknown) => boolean): Settings[K] =>
    ok(input[key]) ? (input[key] as Settings[K]) : DEFAULT_SETTINGS[key]
  const oneOf = (values: string[]) => (v: unknown) => typeof v === 'string' && values.includes(v)
  const result: Stored = {
    updateAuto: pick('updateAuto', (v) => typeof v === 'boolean'),
    updateChannel: pick('updateChannel', oneOf(['stable', 'beta'])),
    wheel: pick('wheel', oneOf(['scroll', 'zoom'])),
    ocrLanguage: pick('ocrLanguage', (v) => typeof v === 'string' && /^[a-z_+]{3,40}$/.test(v)),
    office: pick('office', oneOf(['auto', 'libreoffice'])),
    restoreSession: pick('restoreSession', (v) => typeof v === 'boolean'),
    commentAuthor:
      typeof input.commentAuthor === 'string' && input.commentAuthor.trim()
        ? input.commentAuthor.trim().slice(0, 60)
        : accountName(),
    exportOcr: pick('exportOcr', (v) => typeof v === 'boolean')
  }
  if (typeof input.skippedVersion === 'string') result.skippedVersion = input.skippedVersion
  if (typeof input.checkedAt === 'number') result.checkedAt = input.checkedAt
  return result
}

function load(): Stored {
  if (stored) return stored
  try {
    stored = sanitize(JSON.parse(readFileSync(file(), 'utf8')))
  } catch {
    stored = sanitize({})
  }
  return stored
}

let writing: Promise<void> = Promise.resolve()

function persist(): Promise<void> {
  const text = JSON.stringify(load(), null, 2)
  writing = writing
    .catch(() => {})
    .then(async () => {
      const tmp = `${file()}.tmp`
      await writeFile(tmp, text)
      await rename(tmp, file())
    })
  return writing
}

export function getSettings(): Settings {
  const { skippedVersion: _s, checkedAt: _c, ...settings } = load()
  return settings
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  stored = sanitize({ ...load(), ...patch })
  await persist().catch((error) => console.error('settings: write failed', error))
  const settings = getSettings()
  for (const listener of listeners) listener(settings)
  return settings
}

export function onSettingsChanged(listener: (settings: Settings) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function updaterMemory(): UpdaterMemory {
  const { skippedVersion, checkedAt } = load()
  return { skippedVersion, checkedAt }
}

export function rememberForUpdater(patch: UpdaterMemory): void {
  stored = { ...load(), ...patch }
  void persist().catch(() => {})
}
