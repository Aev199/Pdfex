import { ACTIONS } from './undo'
import { clipboardSourceId } from './useClipboard'
import type { WorkspaceSnapshot } from './workspaces'
import type { DocEntry } from '../types'

// Ids of every source still reachable: shown in a tab, restorable by undo
// in any tab, or waiting on the clipboard.
export function liveSourceIds(snapshots: WorkspaceSnapshot[]): Set<string> {
  const live = new Set<string>()
  const addDocs = (docs: DocEntry[]): void => {
    for (const doc of docs) for (const page of doc.pages) live.add(page.source.id)
  }
  for (const snap of snapshots) {
    addDocs(snap.docs)
    for (const entry of snap.undo.stack) {
      if (entry.action === ACTIONS.DOCS) {
        addDocs(entry.payload.before)
        addDocs(entry.payload.after)
      } else if (entry.action === ACTIONS.PAGE_SOURCE) {
        live.add(entry.payload.before.source.id)
        live.add(entry.payload.after.source.id)
      }
    }
  }
  const clip = clipboardSourceId()
  if (clip) live.add(clip)
  return live
}
