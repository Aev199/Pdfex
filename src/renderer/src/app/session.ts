import { loadSource } from '../pdfx/source'
import { emptySnapshot } from './workspaces'
import type { Workspace, WorkspaceSnapshot, MissingDoc } from './workspaces'
import type { DocEntry, PageEntry, PdfSource } from '../types'
import type { LoadedSession, SessionManifest, SessionSourceRecord } from '../../../preload'

// What a session file holds, and turning it back into workspaces. The same
// manifest is used for the autosave and for .pdfxs files (see main/session.ts
// for how sources and blobs are stored).

export const SESSION_VERSION = 1

export interface SessionPage {
  id: string
  source: string
  pageIndex: number
  width: number
  height: number
}

export interface SessionDoc {
  id: string
  name: string
  pages: SessionPage[]
}

export interface SessionWorkspace {
  id: string
  name: string
  color: string | null
  view: WorkspaceSnapshot['view']
  selected: WorkspaceSnapshot['selected']
  docs: SessionDoc[]
  missing: MissingDoc[]
  marks: WorkspaceSnapshot['marks']
  elements: WorkspaceSnapshot['elements']
  formValues: WorkspaceSnapshot['formValues']
  nextElementNumber: number
}

export interface SessionBody {
  savedAt: string
  activeId: string
  workspaces: SessionWorkspace[]
}

export type Manifest = SessionManifest & SessionBody

// A source is stored as a blob when its bytes exist only in memory; opened
// PDFs are referenced by path.
const isBlob = (source: PdfSource): boolean => !!source.bytes

export const sourceRecord = (source: PdfSource): SessionSourceRecord => ({
  id: source.id,
  path: source.path,
  byteLength: source.byteLength,
  mtimeMs: source.mtimeMs,
  blob: isBlob(source)
})

const docRecord = (doc: DocEntry): SessionDoc => ({
  id: doc.id,
  name: doc.name,
  pages: doc.pages.map((p) => ({
    id: p.id,
    source: p.source.id,
    pageIndex: p.pageIndex,
    width: p.width,
    height: p.height
  }))
})

// Keep only the annotations of pages that are still there; undo history is
// not saved, so orphans could never come back.
function pick<T>(map: Record<string, T>, keys: Set<string>): Record<string, T> {
  const out: Record<string, T> = {}
  for (const [key, value] of Object.entries(map)) if (keys.has(key)) out[key] = value
  return out
}

export interface Serialized {
  manifest: Manifest
  // Every in-memory source the manifest stores as a blob.
  blobSources: PdfSource[]
}

export function serializeSession(
  workspaces: { workspace: Workspace; snapshot: WorkspaceSnapshot }[],
  activeId: string
): Serialized {
  const sources = new Map<string, PdfSource>()
  const records = new Map<string, SessionSourceRecord>()
  const out: SessionWorkspace[] = workspaces.map(({ workspace, snapshot }) => {
    const pageIds = new Set<string>()
    const sourceIds = new Set<string>()
    for (const doc of snapshot.docs) {
      for (const page of doc.pages) {
        pageIds.add(page.id)
        sourceIds.add(page.source.id)
        sources.set(page.source.id, page.source)
      }
    }
    // Documents whose files went missing keep their records until relinked
    // or removed.
    for (const missing of snapshot.missing) records.set(missing.source.id, missing.source)
    return {
      id: workspace.id,
      name: workspace.name,
      color: workspace.color,
      view: snapshot.view,
      selected: snapshot.selected,
      docs: snapshot.docs.map(docRecord),
      missing: snapshot.missing,
      marks: pick(snapshot.marks, pageIds),
      elements: pick(snapshot.elements, pageIds),
      formValues: pick(snapshot.formValues, sourceIds),
      nextElementNumber: snapshot.nextElementNumber
    }
  })
  for (const source of sources.values()) records.set(source.id, sourceRecord(source))
  return {
    manifest: {
      format: 'pdfx-session',
      version: SESSION_VERSION,
      savedAt: new Date().toISOString(),
      activeId,
      workspaces: out,
      sources: [...records.values()]
    },
    blobSources: [...sources.values()].filter(isBlob)
  }
}

export interface Restored {
  workspaces: Workspace[]
  activeId: string | null
  // Files that changed on disk since the session was saved (now showing
  // their current content) and documents whose files are gone.
  changed: string[]
  missingCount: number
}

const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path

function isSessionWorkspace(value: unknown): value is SessionWorkspace {
  const ws = value as SessionWorkspace
  return !!ws && typeof ws.id === 'string' && Array.isArray(ws.docs)
}

export async function restoreSession(loaded: LoadedSession): Promise<Restored> {
  const manifest = loaded.manifest as Manifest
  const recordById = new Map(manifest.sources.map((s) => [s.id, s]))
  const sources = new Map<string, PdfSource>()
  const changed: string[] = []

  for (const record of manifest.sources) {
    const bytes = loaded.bytes[record.id]
    if (!bytes) continue
    const found = loaded.found[record.id]
    try {
      const { source } = await loadSource(bytes, {
        id: record.id,
        path: found?.path ?? record.path,
        mtimeMs: found?.mtimeMs ?? record.mtimeMs,
        pristine: !record.blob
      })
      sources.set(record.id, source)
      if (loaded.status[record.id] === 'changed' && found) changed.push(fileName(found.path))
    } catch (error) {
      console.error('Could not restore a session document', error)
    }
  }

  let missingCount = 0
  const workspaces: Workspace[] = []
  for (const ws of Array.isArray(manifest.workspaces) ? manifest.workspaces : []) {
    if (!isSessionWorkspace(ws)) continue
    const docs: DocEntry[] = []
    const missing: MissingDoc[] = [...(Array.isArray(ws.missing) ? ws.missing : [])]
    for (const doc of ws.docs) {
      const pages: PageEntry[] = []
      // Pages whose file is gone, grouped by that file, wait to be relinked.
      const lost = new Map<string, SessionPage[]>()
      for (const page of doc.pages) {
        const source = sources.get(page.source)
        if (!source) {
          lost.set(page.source, [...(lost.get(page.source) ?? []), page])
          continue
        }
        // A file that changed may have fewer pages now.
        if (page.pageIndex >= source.pdf.numPages) continue
        pages.push({
          id: page.id,
          source,
          pageIndex: page.pageIndex,
          width: page.width,
          height: page.height
        })
      }
      for (const [sourceId, lostPages] of lost) {
        const record = recordById.get(sourceId)
        if (record) {
          missing.push({ doc: { ...doc, pages: lostPages }, source: record, index: docs.length })
        }
      }
      if (pages.length > 0) docs.push({ id: doc.id, name: doc.name, pages })
    }
    missingCount += missing.length
    workspaces.push({
      id: ws.id,
      name: typeof ws.name === 'string' ? ws.name : 'Tab',
      color: ws.color ?? null,
      snapshot: {
        ...emptySnapshot(docs),
        marks: ws.marks ?? {},
        elements: ws.elements ?? {},
        formValues: ws.formValues ?? {},
        nextElementNumber: ws.nextElementNumber ?? 1,
        view: ws.view ?? null,
        selected: null,
        missing
      }
    })
  }
  return {
    workspaces,
    activeId: typeof manifest.activeId === 'string' ? manifest.activeId : null,
    changed,
    missingCount
  }
}

// The pages of a document whose file went missing, now read from the file
// the user pointed at instead. Pages that no longer exist in it are skipped.
export const relinkPages = (missing: MissingDoc, source: PdfSource): PageEntry[] =>
  missing.doc.pages.filter((p) => p.pageIndex < source.pdf.numPages).map((p) => ({ ...p, source }))
