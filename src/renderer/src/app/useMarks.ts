import { useCallback, useRef, useState } from 'react'
import { DEFAULT_MARK_COLORS } from '../edit/types'
import type { MarkKind, MarkLook, MarkMap, MarkRect } from '../edit/types'
import { rectsOverlap } from '../edit/selection'
import { ACTIONS } from './undo'
import type { MarkUndoEntry, UndoEntry } from './undo'

export function useMarks(pushUndo: (entry: UndoEntry) => void, initial: MarkMap = {}) {
  const [marks, setMarks] = useState<MarkMap>(initial)
  const marksRef = useRef(marks)
  marksRef.current = marks

  const addMark = useCallback(
    (pageId: string, kind: MarkKind, rects: MarkRect[], look?: MarkLook) => {
      if (rects.length === 0) return
      const map = marksRef.current
      const added = {
        id: crypto.randomUUID(),
        kind,
        color: kind === 'highlight' && look ? look.color : DEFAULT_MARK_COLORS[kind],
        ...(kind === 'highlight' && look && look.style !== 'fill' ? { style: look.style } : {}),
        rects
      }
      pushUndo({ action: ACTIONS.MARK, value: 'add', payload: { pageId, marks: [added] } })
      setMarks({ ...map, [pageId]: [...(map[pageId] ?? []), added] })
    },
    [pushUndo]
  )

  const toggleMark = useCallback(
    (pageId: string, kind: MarkKind, rects: MarkRect[], look?: MarkLook) => {
      if (rects.length === 0) return
      const map = marksRef.current
      const page = map[pageId] ?? []
      const removed = page.filter(
        (m) => m.kind === kind && m.rects.some((a) => rects.some((b) => rectsOverlap(a, b)))
      )
      if (removed.length > 0) {
        pushUndo({ action: ACTIONS.MARK, value: 'remove', payload: { pageId, marks: removed } })
        setMarks({ ...map, [pageId]: page.filter((m) => !removed.includes(m)) })
      } else {
        addMark(pageId, kind, rects, look)
      }
    },
    [pushUndo, addMark]
  )

  const clearMarks = useCallback(
    (pageId: string, kind: MarkKind): number => {
      const map = marksRef.current
      const page = map[pageId] ?? []
      const removed = page.filter((m) => m.kind === kind)
      if (removed.length === 0) return 0
      pushUndo({ action: ACTIONS.MARK, value: 'remove', payload: { pageId, marks: removed } })
      setMarks({ ...map, [pageId]: page.filter((m) => m.kind !== kind) })
      return removed.length
    },
    [pushUndo]
  )

  const restoreMarks = useCallback(
    (map: MarkMap) => {
      const prev = marksRef.current
      if (prev === map) return
      pushUndo({ action: ACTIONS.MARK, value: 'restore', payload: { before: prev, after: map } })
      setMarks(map)
    },
    [pushUndo]
  )

  const applyEntry = useCallback((entry: MarkUndoEntry, direction: 'undo' | 'redo') => {
    if (entry.value === 'restore') {
      setMarks(direction === 'undo' ? entry.payload.before : entry.payload.after)
      return
    }
    const { pageId, marks: entries } = entry.payload
    const map = marksRef.current
    const page = map[pageId] ?? []
    const remove = (entry.value === 'add') === (direction === 'undo')
    const kept = page.filter((m) => !entries.some((e) => e.id === m.id))
    setMarks({ ...map, [pageId]: remove ? kept : [...kept, ...entries] })
  }, [])

  // Give duplicated pages (new id -> original id) the marks of their originals.
  // `from` holds the originals' annotations when they come from elsewhere
  // (pages pasted from another tab).
  const copyToPages = useCallback((origins: Map<string, string>, from?: MarkMap) => {
    const map = marksRef.current
    let next: MarkMap | null = null
    for (const [copyId, originId] of origins) {
      const marks = (from ?? map)[originId]
      if (!marks?.length) continue
      next ??= { ...map }
      next[copyId] = marks.map((m) => ({ ...m, id: crypto.randomUUID() }))
    }
    if (next) setMarks(next)
  }, [])

  const applyUndo = useCallback((entry: MarkUndoEntry) => applyEntry(entry, 'undo'), [applyEntry])
  const applyRedo = useCallback((entry: MarkUndoEntry) => applyEntry(entry, 'redo'), [applyEntry])

  return {
    marks,
    marksRef,
    copyToPages,
    addMark,
    toggleMark,
    clearMarks,
    restoreMarks,
    applyUndo,
    applyRedo
  }
}

export type MarkState = ReturnType<typeof useMarks>
