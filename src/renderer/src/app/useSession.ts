import { useCallback, useEffect, useRef, useState } from 'react'
import { getSettings } from './settings-store'
import { restoreSession, serializeSession } from './session'
import type { Restored } from './session'
import { safeFileName } from './useExport'
import { liveSourceIds } from './live-sources'
import { releaseUnused } from '../pdfx/source-registry'
import type { Workspace, WorkspaceSnapshot } from './workspaces'
import type { LoadedSession } from '../../../preload'

// The session: every tab restored on start, autosaved while working, written
// once more when the window closes, and saved to / opened from .pdfxs files.

const AUTOSAVE_MS = 1000
const SESSION_FILTER = { name: 'PDFx session', extensions: ['pdfxs'] }

export interface SessionTabs {
  workspaces: Workspace[]
  activeId: string
}

interface SessionDeps {
  tabsRef: React.RefObject<SessionTabs>
  liveSnapshot: (workspace: Workspace) => WorkspaceSnapshot
  // Adopt restored workspaces: replace the startup tabs, or add opened ones.
  adopt: (workspaces: Workspace[], activeId: string | null, mode: 'replace' | 'append') => void
  flash: (message: string) => void
}

const describeRestore = (restored: Restored): string | null => {
  const parts: string[] = []
  if (restored.changed.length > 0) {
    parts.push(
      `${restored.changed.length === 1 ? restored.changed[0] : `${restored.changed.length} files`} changed since last time; showing the current version`
    )
  }
  if (restored.missingCount > 0) {
    parts.push(
      `${restored.missingCount} ${restored.missingCount === 1 ? 'document was' : 'documents were'} not found`
    )
  }
  return parts.length > 0 ? parts.join('. ') : null
}

export function useSession({ tabsRef, liveSnapshot, adopt, flash }: SessionDeps) {
  const [ready, setReady] = useState(false)
  const readyRef = useRef(false)
  // Blob ids already written to the autosave folder.
  const storedBlobs = useRef(new Set<string>())
  const timer = useRef<number | null>(null)

  const snapshotAll = useCallback(
    (only?: string[]) =>
      tabsRef.current.workspaces
        .filter((w) => !only || only.includes(w.id))
        .map((workspace) => ({ workspace, snapshot: liveSnapshot(workspace) })),
    [tabsRef, liveSnapshot]
  )

  const saveNow = useCallback(async () => {
    if (!readyRef.current) return
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    const all = snapshotAll()
    // Close documents nothing can show any more (removed, closed tabs).
    releaseUnused(liveSourceIds(all.map((w) => w.snapshot)))
    const { manifest, blobSources } = serializeSession(all, tabsRef.current.activeId)
    const blobs: Record<string, Uint8Array> = {}
    for (const source of blobSources) {
      if (!storedBlobs.current.has(source.id) && source.bytes) blobs[source.id] = source.bytes
    }
    try {
      await window.api.sessionSave(manifest, blobs)
      for (const id of Object.keys(blobs)) storedBlobs.current.add(id)
      // Blobs no longer referenced are pruned on disk; forget them so a
      // source that comes back (undo) is written again.
      const live = new Set(blobSources.map((s) => s.id))
      for (const id of storedBlobs.current) if (!live.has(id)) storedBlobs.current.delete(id)
    } catch (error) {
      console.error('Autosave failed', error)
    }
  }, [snapshotAll, tabsRef])

  const scheduleSave = useCallback(() => {
    if (!readyRef.current) return
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void saveNow(), AUTOSAVE_MS)
  }, [saveNow])

  // Restore the previous session before anything else can add documents.
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        // "Reopen tabs from last time" off: start empty; autosave goes on.
        const loaded = getSettings().restoreSession ? await window.api.sessionLoad() : null
        if (!alive || !loaded) return
        const restored = await restoreSession(loaded)
        for (const record of loaded.manifest.sources) {
          if (record.blob && loaded.bytes[record.id]) storedBlobs.current.add(record.id)
        }
        if (restored.workspaces.length > 0) adopt(restored.workspaces, restored.activeId, 'replace')
        const message = describeRestore(restored)
        if (message) window.setTimeout(() => flash(message), 600)
      } catch (error) {
        console.error('Session restore failed', error)
      } finally {
        if (alive) {
          readyRef.current = true
          setReady(true)
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [adopt, flash])

  // The main process holds the window open until this last save is done.
  useEffect(
    () =>
      window.api.onFlushSession(() => {
        void saveNow().finally(() => window.api.sessionFlushed())
      }),
    [saveNow]
  )

  const writeSessionFile = useCallback(
    async (workspaceIds: string[] | undefined, suggestedName: string) => {
      const path = await window.api.chooseSavePath(
        `${safeFileName(suggestedName)}.pdfxs`,
        SESSION_FILTER
      )
      if (!path) return
      try {
        const { manifest, blobSources } = serializeSession(
          snapshotAll(workspaceIds),
          tabsRef.current.activeId
        )
        const blobs: Record<string, Uint8Array> = {}
        for (const source of blobSources) if (source.bytes) blobs[source.id] = source.bytes
        await window.api.sessionWriteFile(path, manifest, blobs)
        flash(`Saved ${path.split(/[\\/]/).pop()}`)
      } catch (error) {
        console.error('Saving the session failed', error)
        flash('Could not save the session')
      }
    },
    [snapshotAll, tabsRef, flash]
  )

  const saveSessionAs = useCallback(
    () => writeSessionFile(undefined, 'Session'),
    [writeSessionFile]
  )

  const saveTabAs = useCallback(
    (id: string) => {
      const ws = tabsRef.current.workspaces.find((w) => w.id === id)
      if (ws) void writeSessionFile([id], ws.name || 'Tab')
    },
    [tabsRef, writeSessionFile]
  )

  // Open a .pdfxs the user picked: its tabs join the current ones.
  const openSessionFile = useCallback(
    async (path: string) => {
      try {
        const loaded: LoadedSession = await window.api.sessionOpenFile(path)
        const restored = await restoreSession(loaded)
        // Fresh tab ids: the same file may be opened twice.
        const fresh = restored.workspaces.map((w) => ({ ...w, id: crypto.randomUUID() }))
        if (fresh.length === 0) {
          flash('The session file has no tabs')
          return
        }
        adopt(fresh, fresh[0].id, 'append')
        flash(describeRestore(restored) ?? `Opened ${path.split(/[\\/]/).pop()}`)
      } catch (error) {
        console.error('Opening the session failed', error)
        flash('Could not open the session file')
      }
    },
    [adopt, flash]
  )

  return { ready, scheduleSave, saveNow, saveSessionAs, saveTabAs, openSessionFile }
}
