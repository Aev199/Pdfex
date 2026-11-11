import { app } from 'electron'
import { existsSync } from 'fs'
import { rememberForUpdater, updaterMemory } from './settings'

// Files opened lately, for File → Open Recent (and the taskbar jump list on
// Windows). Newest first; files that are gone are left out when shown.

const MAX_RECENT = 12
const listeners = new Set<() => void>()

export const onRecentChanged = (listener: () => void): void => void listeners.add(listener)

export function recentFiles(): string[] {
  return (updaterMemory().recentFiles ?? []).filter((p) => existsSync(p))
}

export function rememberOpened(paths: string[]): void {
  if (paths.length === 0) return
  const before = updaterMemory().recentFiles ?? []
  const fresh = [...paths].reverse()
  const next = [...fresh, ...before.filter((p) => !fresh.includes(p))].slice(0, MAX_RECENT)
  rememberForUpdater({ recentFiles: next })
  if (process.platform === 'win32') for (const p of paths) app.addRecentDocument(p)
  for (const listener of listeners) listener()
}

export function clearRecent(): void {
  rememberForUpdater({ recentFiles: [] })
  if (process.platform === 'win32') app.clearRecentDocuments()
  for (const listener of listeners) listener()
}
