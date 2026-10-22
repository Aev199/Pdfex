import { useCallback, useEffect, useRef, useState } from 'react'
import * as docOps from './doc-ops/docs'
import * as pageOps from './doc-ops/pages'
import * as moveOps from './doc-ops/move'
import * as selOps from './doc-ops/selection-ops'
import { useClipboard } from './useClipboard'
import { ACTIONS } from './undo'
import type { DocsUndoEntry, PagePlacement, PageSourceUndoEntry, UndoEntry } from './undo'
import type { SelectedTarget } from './selection'
import type { PageRef } from './types'
import type { DocEntry, PageEntry, PdfSource } from '../types'

export type DocsUpdate = React.SetStateAction<DocEntry[]>

export interface SelectModifiers {
  // Ctrl/Cmd+click: add or remove one page.
  toggle?: boolean
  // Shift+click: everything from the last clicked page to this one.
  range?: boolean
}

export function useCollection(
  flash: (message: string) => void,
  pushUndo: (entry: UndoEntry) => void,
  initial?: { docs: DocEntry[]; selected: PageRef | null },
  // Receives document updates that land after this workspace was switched
  // away from (a slow import finishing), so they reach its snapshot instead
  // of vanishing with the unmounted view.
  onDetachedUpdate?: (update: DocsUpdate) => void
) {
  const [docs, setDocsState] = useState<DocEntry[]>(initial?.docs ?? [])
  // `selected` is the page last clicked (keyboard and paste target);
  // `selection` is every highlighted page and always includes it.
  const [selected, setSelectedState] = useState<PageRef | null>(initial?.selected ?? null)
  const [selection, setSelection] = useState<PageRef[]>(
    initial?.selected ? [initial.selected] : []
  )
  const docsRef = useRef(docs)
  docsRef.current = docs
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const selectionRef = useRef(selection)
  selectionRef.current = selection

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  const detachedRef = useRef(onDetachedUpdate)
  detachedRef.current = onDetachedUpdate

  // Every change to the document list goes through here. Recorded changes
  // become one undo step; page moves and source swaps record their own,
  // finer-grained entries and pass record=false.
  const commit = useCallback(
    (update: DocsUpdate, record: boolean) => {
      if (!mountedRef.current) {
        detachedRef.current?.(update)
        return
      }
      const prev = docsRef.current
      const next = typeof update === 'function' ? update(prev) : update
      if (next === prev) return
      docsRef.current = next
      if (record) {
        pushUndo({ action: ACTIONS.DOCS, value: 'docs', payload: { before: prev, after: next } })
      }
      setDocsState(next)
    },
    [pushUndo]
  )
  const setDocs = useCallback((update: DocsUpdate) => commit(update, true), [commit])

  const setSelected = useCallback((update: React.SetStateAction<PageRef | null>) => {
    const next = typeof update === 'function' ? update(selectedRef.current) : update
    selectedRef.current = next
    setSelectedState(next)
    setSelection(next ? [next] : [])
  }, [])

  const { copySelected, pasteAfterSelected } = useClipboard(
    docs,
    selected,
    setDocs,
    setSelected,
    flash
  )

  const selectPage = useCallback(
    (docId: string, pageId: string, modifiers?: SelectModifiers) => {
      const target = { docId, pageId }
      const anchor = selectedRef.current
      if (modifiers?.range && anchor) {
        setSelection(selOps.pageRange(docsRef.current, anchor, target))
        return
      }
      if (modifiers?.toggle) {
        const current = selectionRef.current
        const has = current.some((r) => r.pageId === pageId)
        const next = has ? current.filter((r) => r.pageId !== pageId) : [...current, target]
        setSelection(next)
        const focus = has ? (next[next.length - 1] ?? null) : target
        selectedRef.current = focus
        setSelectedState(focus)
        return
      }
      setSelected(target)
    },
    [setSelected]
  )

  // Right-clicking or dragging a page outside the selection selects just it;
  // inside the selection, the selection stays so the action covers it all.
  const ensureSelected = useCallback(
    (docId: string, pageId: string) => {
      if (selectionRef.current.some((r) => r.pageId === pageId)) return
      setSelected({ docId, pageId })
    },
    [setSelected]
  )

  const selectAll = useCallback(() => {
    const all = selOps.allPages(docsRef.current)
    setSelection(all)
    if (!selectedRef.current && all.length > 0) {
      selectedRef.current = all[0]
      setSelectedState(all[0])
    }
  }, [])

  const clearSelection = useCallback(() => setSelected(null), [setSelected])

  // The selection in document order, dropping pages that no longer exist.
  const currentSelection = useCallback((): PageRef[] => {
    const ids = new Set(selectionRef.current.map((r) => r.pageId))
    return selOps.allPages(docsRef.current).filter((r) => ids.has(r.pageId))
  }, [])

  const removeDoc = useCallback(
    (id: string) => {
      setDocs((prev) => docOps.removeDoc(prev, id))
      if (selectedRef.current?.docId === id) setSelected(null)
    },
    [setDocs, setSelected]
  )

  const renameDoc = useCallback(
    (id: string, name: string) => {
      setDocs((prev) => docOps.renameDoc(prev, id, name))
    },
    [setDocs]
  )

  const moveDoc = useCallback(
    (id: string, direction: -1 | 1) => {
      setDocs((prev) => docOps.reorderDoc(prev, id, direction))
    },
    [setDocs]
  )

  const duplicateDoc = useCallback(
    (id: string): Map<string, string> => {
      const { docs: next, origins } = selOps.duplicateDoc(docsRef.current, id)
      setDocs(next)
      return origins
    },
    [setDocs]
  )

  const deletePage = useCallback(
    (target: PageRef) => {
      const doc = docsRef.current.find((d) => d.id === target.docId)
      const index = doc?.pages.findIndex((p) => p.id === target.pageId) ?? -1
      if (!doc || index === -1) return
      const pages = doc.pages.filter((p) => p.id !== target.pageId)
      const neighbor = pages[Math.min(index, pages.length - 1)]
      setDocs((prev) => selOps.deletePages(prev, [target]))
      setSelected(neighbor ? { docId: doc.id, pageId: neighbor.id } : null)
    },
    [setDocs, setSelected]
  )

  const deleteSelection = useCallback(() => {
    const refs = currentSelection()
    if (refs.length === 0) return
    if (refs.length === 1) {
      deletePage(refs[0])
      return
    }
    setDocs((prev) => selOps.deletePages(prev, refs))
    setSelected(null)
  }, [currentSelection, deletePage, setDocs, setSelected])

  const duplicateSelection = useCallback((): Map<string, string> => {
    const { docs: next, origins, created } = selOps.duplicatePages(
      docsRef.current,
      currentSelection()
    )
    setDocs(next)
    if (created.length > 0) {
      setSelection(created)
      selectedRef.current = created[created.length - 1]
      setSelectedState(created[created.length - 1])
    }
    return origins
  }, [currentSelection, setDocs])

  const extractSelection = useCallback(() => {
    const { docs: next, docId } = selOps.extractPages(docsRef.current, currentSelection())
    if (!docId) return
    setDocs(next)
    const doc = next.find((d) => d.id === docId)
    setSelected(doc ? { docId, pageId: doc.pages[0].id } : null)
  }, [currentSelection, setDocs, setSelected])

  const splitDocAt = useCallback(
    (docId: string, pageId: string) => {
      const next = selOps.splitDocAt(docsRef.current, docId, pageId)
      if (next === docsRef.current) return
      setDocs(next)
      const tail = next[next.findIndex((d) => d.id === docId) + 1]
      if (tail) setSelected({ docId: tail.id, pageId })
    },
    [setDocs, setSelected]
  )

  const replaceDocPages = useCallback(
    (docId: string, pages: PageEntry[]) => {
      setDocs((prev) => selOps.replaceDocPages(prev, docId, pages))
      if (selectedRef.current?.docId === docId) setSelected(null)
    },
    [setDocs, setSelected]
  )

  const insertPagesAfter = useCallback(
    (target: SelectedTarget, entries: PageEntry[]) => {
      if (entries.length === 0) return
      setDocs((prev) => pageOps.insertPagesAfter(prev, target.doc.id, target.index, entries))
      setSelected({ docId: target.doc.id, pageId: entries[entries.length - 1].id })
    },
    [setDocs, setSelected]
  )

  const appendPagesToDoc = useCallback(
    (docId: string, entries: PageEntry[]) => {
      if (entries.length === 0) return
      setDocs((prev) => pageOps.appendPages(prev, docId, entries))
      setSelected({ docId, pageId: entries[entries.length - 1].id })
    },
    [setDocs, setSelected]
  )

  const insertPagesIntoDoc = useCallback(
    (docId: string, index: number, entries: PageEntry[]) => {
      if (entries.length === 0) return
      setDocs((prev) => pageOps.insertPagesIntoDoc(prev, docId, index, entries))
      setSelected({ docId, pageId: entries[entries.length - 1].id })
    },
    [setDocs, setSelected]
  )

  const recordPageMove = useCallback(
    (prev: DocEntry[], next: DocEntry[], pageId: string) => {
      const from = moveOps.pagePlacement(prev, pageId)
      const to = moveOps.pagePlacement(next, pageId)
      if (!from || !to) return
      pushUndo({ action: ACTIONS.MOVE_PAGE, value: pageId, payload: { pageId, from, to } })
    },
    [pushUndo]
  )

  const movePageInto = useCallback(
    (source: PageRef, targetDocId: string, index: number) => {
      const prev = docsRef.current
      const next = moveOps.movePageInto(prev, source, targetDocId, index)
      if (next !== prev) {
        recordPageMove(prev, next, source.pageId)
        commit(next, false)
      }
      setSelected({ docId: targetDocId, pageId: source.pageId })
    },
    [recordPageMove, commit, setSelected]
  )

  const movePageToNewDoc = useCallback(
    (source: PageRef, docIndex: number) => {
      const prev = docsRef.current
      const newDocId = crypto.randomUUID()
      const next = moveOps.movePageToNewDoc(prev, source, docIndex, newDocId)
      if (next === prev) return
      recordPageMove(prev, next, source.pageId)
      commit(next, false)
      setSelected({ docId: newDocId, pageId: source.pageId })
    },
    [recordPageMove, commit, setSelected]
  )

  const placePageAt = useCallback(
    (pageId: string, at: PagePlacement) => {
      const prev = docsRef.current
      const next = moveOps.placePage(prev, pageId, at)
      if (next === prev) return
      commit(next, false)
      setSelected({ docId: at.docId, pageId })
    },
    [commit, setSelected]
  )

  const replacePageSource = useCallback(
    (pageId: string, source: PdfSource, pageIndex: number) => {
      const page = docsRef.current.flatMap((d) => d.pages).find((p) => p.id === pageId)
      if (!page) return
      pushUndo({
        action: ACTIONS.PAGE_SOURCE,
        value: pageId,
        payload: {
          pageId,
          before: { source: page.source, pageIndex: page.pageIndex },
          after: { source, pageIndex }
        }
      })
      commit((prev) => pageOps.swapPageSource(prev, pageId, { source, pageIndex }), false)
    },
    [pushUndo, commit]
  )

  const applyPageSource = useCallback(
    (entry: PageSourceUndoEntry, direction: 'undo' | 'redo') => {
      const swap = direction === 'undo' ? entry.payload.before : entry.payload.after
      commit((prev) => pageOps.swapPageSource(prev, entry.payload.pageId, swap), false)
    },
    [commit]
  )

  const applyDocs = useCallback(
    (entry: DocsUndoEntry, direction: 'undo' | 'redo') => {
      const next = direction === 'undo' ? entry.payload.before : entry.payload.after
      commit(next, false)
      const sel = selectedRef.current
      if (sel && !next.some((d) => d.pages.some((p) => p.id === sel.pageId))) setSelected(null)
    },
    [commit, setSelected]
  )

  const spliceDocsAfter = useCallback(
    (anchorDocId: string | null, newDocs: DocEntry[]) => {
      if (newDocs.length === 0) return
      setDocs((prev) => docOps.spliceDocsAfter(prev, anchorDocId, newDocs))
      const last = newDocs[newDocs.length - 1]
      setSelected({ docId: last.id, pageId: last.pages[last.pages.length - 1].id })
    },
    [setDocs, setSelected]
  )

  return {
    docs,
    setDocs,
    docsRef,
    selected,
    selectedRef,
    selection,
    selectionRef,
    setSelected,
    selectPage,
    ensureSelected,
    selectAll,
    clearSelection,
    currentSelection,
    removeDoc,
    renameDoc,
    moveDoc,
    duplicateDoc,
    deletePage,
    deleteSelection,
    duplicateSelection,
    extractSelection,
    splitDocAt,
    replaceDocPages,
    copySelected,
    pasteAfterSelected,
    insertPagesAfter,
    appendPagesToDoc,
    insertPagesIntoDoc,
    movePageInto,
    movePageToNewDoc,
    placePageAt,
    replacePageSource,
    applyPageSource,
    applyDocs,
    spliceDocsAfter
  }
}

export type Collection = ReturnType<typeof useCollection>
