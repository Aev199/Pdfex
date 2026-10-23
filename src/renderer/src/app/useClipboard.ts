import { useCallback } from 'react'
import { insertPagesAfter } from './doc-ops/pages'
import { findSelectedTarget } from './selection'
import type { PageRef } from './types'
import type { DocEntry, PageEntry } from '../types'
import type { MarkMap } from '../edit/types'
import type { ElementMap } from '../elements/types'

// Copied pages, shared by every workspace so pages copied in one tab paste
// into another, together with the marks and elements drawn on them.
interface PageClipboard {
  pages: PageEntry[]
  marks: MarkMap
  elements: ElementMap
}

const clipboard: PageClipboard = { pages: [], marks: {}, elements: {} }

// Sources of copied pages must stay loaded while they can be pasted.
export const clipboardSourceIds = (): string[] => clipboard.pages.map((p) => p.source.id)

// Annotations of the copied pages, from the workspace they were copied in.
export function rememberClipboardAnnotations(marks: MarkMap, elements: ElementMap): void {
  const ids = clipboard.pages.map((p) => p.id)
  clipboard.marks = Object.fromEntries(ids.filter((id) => marks[id]).map((id) => [id, marks[id]]))
  clipboard.elements = Object.fromEntries(
    ids.filter((id) => elements[id]).map((id) => [id, elements[id]])
  )
}

export const clipboardAnnotations = (): Pick<PageClipboard, 'marks' | 'elements'> => clipboard

const PASTE_KEY = window.api?.platform === 'darwin' ? '⌘V' : 'Ctrl+V'

export function useClipboard(
  docs: DocEntry[],
  selected: PageRef | null,
  currentSelection: () => PageRef[],
  setDocs: React.Dispatch<React.SetStateAction<DocEntry[]>>,
  setSelected: (sel: PageRef | null) => void,
  flash: (message: string) => void
) {
  // Copies every selected page (in document order); returns their ids.
  const copySelected = useCallback((): string[] => {
    const ids = new Set(currentSelection().map((r) => r.pageId))
    if (ids.size === 0 && selected) ids.add(selected.pageId)
    const pages = docs.flatMap((d) => d.pages.filter((p) => ids.has(p.id)))
    if (pages.length === 0) return []
    clipboard.pages = pages
    clipboard.marks = {}
    clipboard.elements = {}
    void window.api.clearClipboard()
    flash(
      `${pages.length === 1 ? 'Page' : `${pages.length} pages`} copied — ${PASTE_KEY} pastes after the selected page`
    )
    return pages.map((p) => p.id)
  }, [docs, selected, currentSelection, flash])

  // Inserts copies after the selected page; returns new id -> copied id.
  const pasteAfterSelected = useCallback((): Map<string, string> => {
    const origins = new Map<string, string>()
    const target = findSelectedTarget(docs, selected)
    if (clipboard.pages.length === 0 || !target) return origins
    const pasted = clipboard.pages.map((page) => {
      const copy = { ...page, id: crypto.randomUUID() }
      origins.set(copy.id, page.id)
      return copy
    })
    setDocs((prev) => insertPagesAfter(prev, target.doc.id, target.index, pasted))
    setSelected({ docId: target.doc.id, pageId: pasted[pasted.length - 1].id })
    return origins
  }, [docs, selected, setDocs, setSelected])

  return { copySelected, pasteAfterSelected }
}
