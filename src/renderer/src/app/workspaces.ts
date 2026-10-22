import type { DocEntry } from '../types'
import type { MarkMap } from '../edit/types'
import type { ElementMap } from '../elements/types'
import type { FormValuesBySource } from '../forms/types'
import type { UndoEntry } from './undo'
import type { PageRef } from './types'

// A WORKSPACE is one canvas-full of documents; a TAB is the chip that selects
// it. Only the active workspace is mounted (rendered pages, search index,
// undo hooks). The others are kept as plain snapshots — no canvases, no
// rasters — and are remounted from their snapshot when selected, at the same
// zoom and position.

export interface CanvasView {
  x: number
  y: number
  k: number
}

export interface UndoSnapshot {
  stack: UndoEntry[]
  cursor: number
}

export interface WorkspaceSnapshot {
  docs: DocEntry[]
  marks: MarkMap
  elements: ElementMap
  formValues: FormValuesBySource
  nextElementNumber: number
  undo: UndoSnapshot
  view: CanvasView | null
  selected: PageRef | null
}

export interface Workspace {
  id: string
  name: string
  // Key into WORKSPACE_COLORS, or null for the neutral chip.
  color: string | null
  snapshot: WorkspaceSnapshot
}

export const emptySnapshot = (docs: DocEntry[] = []): WorkspaceSnapshot => ({
  docs,
  marks: {},
  elements: {},
  formValues: {},
  nextElementNumber: 1,
  undo: { stack: [], cursor: 0 },
  view: null,
  selected: null
})

export function newWorkspace(name: string, docs: DocEntry[] = []): Workspace {
  return { id: crypto.randomUUID(), name, color: null, snapshot: emptySnapshot(docs) }
}

export const WORKSPACE_COLORS: { key: string; chip: string }[] = [
  { key: 'red', chip: '#ff6b61' },
  { key: 'orange', chip: '#ff9f43' },
  { key: 'yellow', chip: '#f0c243' },
  { key: 'green', chip: '#5dbb63' },
  { key: 'teal', chip: '#3cc8c0' },
  { key: 'blue', chip: '#74a9ff' },
  { key: 'purple', chip: '#a78bfa' },
  { key: 'pink', chip: '#f472b6' }
]

export const workspaceChip = (color: string | null): string | null =>
  WORKSPACE_COLORS.find((c) => c.key === color)?.chip ?? null

export function uniqueTabName(base: string, taken: Iterable<string>): string {
  const names = new Set(taken)
  if (!names.has(base)) return base
  for (let n = 2; ; n++) {
    const name = `${base} ${n}`
    if (!names.has(name)) return name
  }
}

// Documents moved to another workspace take their page annotations and form
// values along, so they look the same on arrival. The source workspace keeps
// its copies: its undo history may still bring the documents back.
export function carryDocs(
  from: Pick<WorkspaceSnapshot, 'marks' | 'elements' | 'formValues'>,
  to: WorkspaceSnapshot,
  docs: DocEntry[]
): WorkspaceSnapshot {
  const marks = { ...to.marks }
  const elements = { ...to.elements }
  const formValues = { ...to.formValues }
  for (const doc of docs) {
    for (const page of doc.pages) {
      if (from.marks[page.id]) marks[page.id] = from.marks[page.id]
      if (from.elements[page.id]) elements[page.id] = from.elements[page.id]
      const values = from.formValues[page.source.id]
      if (values) formValues[page.source.id] = values
    }
  }
  return { ...to, docs: [...to.docs, ...docs], marks, elements, formValues }
}
