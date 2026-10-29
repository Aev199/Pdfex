import { useSyncExternalStore } from 'react'
import type { Settings } from '../../../preload/app-types'

// The main process owns the settings file; the renderer keeps a copy that
// input handlers can read synchronously (wheel mode) and React can watch.

export const DEFAULT_SETTINGS: Settings = {
  updateAuto: true,
  updateChannel: 'stable',
  wheel: 'scroll',
  ocrLanguage: 'rus+eng',
  office: 'auto',
  restoreSession: true,
  commentAuthor: '',
  exportOcr: true,
  openPdfs: false,
  exportAnnotations: 'page'
}

let current: Settings = DEFAULT_SETTINGS
const listeners = new Set<() => void>()

function publish(next: Settings): void {
  current = next
  for (const listener of listeners) listener()
}

export const getSettings = (): Settings => current

export const commentAuthor = (): string => current.commentAuthor.trim() || 'Me'

// Called once before the app mounts, so first renders see the saved values.
export async function loadSettings(): Promise<void> {
  try {
    publish({ ...DEFAULT_SETTINGS, ...(await window.api.getSettings()) })
  } catch {
    // web build or no main process: defaults
  }
  window.api.onSettings?.((settings) => publish(settings))
}

export async function changeSettings(patch: Partial<Settings>): Promise<void> {
  publish({ ...current, ...patch })
  try {
    publish(await window.api.setSettings(patch))
  } catch (error) {
    console.error('Settings were not saved', error)
  }
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useSettings = (): Settings => useSyncExternalStore(subscribe, getSettings)
