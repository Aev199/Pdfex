import { useCallback, useRef } from 'react'
import type { Mark, MarkMap } from '../edit/types'
import type { PageElement } from '../elements/types'
import type { DocEntry, PdfSource } from '../types'

export const ACTIONS = {
  MARK: 'mark',
  MOVE_PAGE: 'move-page',
  ELEMENT: 'element',
  PAGE_SOURCE: 'page-source',
  DOCS: 'docs'
} as const

export interface PagePlacement {
  docId: string
  docName: string
  docIndex: number
  pageIndex: number
}

export interface MovePagePayload {
  pageId: string
  from: PagePlacement
  to: PagePlacement
}

export type MarkUndoEntry =
  | {
      action: typeof ACTIONS.MARK
      value: 'add' | 'remove'
      payload: { pageId: string; marks: Mark[] }
    }
  | {
      action: typeof ACTIONS.MARK
      value: 'restore'
      payload: { before: MarkMap; after: MarkMap }
    }

export type MovePageUndoEntry = {
  action: typeof ACTIONS.MOVE_PAGE
  value: string
  payload: MovePagePayload
}

export type ElementUndoEntry =
  | {
      action: typeof ACTIONS.ELEMENT
      value: 'add' | 'remove'
      payload: { pageId: string; element: PageElement }
    }
  | {
      action: typeof ACTIONS.ELEMENT
      value: 'add-batch'
      payload: { pageId: string; elements: PageElement[] }
    }
  | {
      action: typeof ACTIONS.ELEMENT
      value: 'move' | 'mark' | 'edit'
      payload: { pageId: string; before: PageElement; after: PageElement }
    }

export interface PageSourceSwap {
  source: PdfSource
  pageIndex: number
}

export type PageSourceUndoEntry = {
  action: typeof ACTIONS.PAGE_SOURCE
  value: string
  payload: { pageId: string; before: PageSourceSwap; after: PageSourceSwap }
}

// Any other change to the document list (import, delete, duplicate, rename,
// reorder…): the whole list before and after. Lists share their page and
// document objects, so a snapshot costs an array, not a copy of the content.
export type DocsUndoEntry = {
  action: typeof ACTIONS.DOCS
  value: string
  payload: { before: DocEntry[]; after: DocEntry[] }
}

export type UndoEntry =
  | MarkUndoEntry
  | MovePageUndoEntry
  | ElementUndoEntry
  | PageSourceUndoEntry
  | DocsUndoEntry

const UNDO_CAP = 100

export function useUndoStack(initial?: { stack: UndoEntry[]; cursor: number }) {
  const stackRef = useRef<UndoEntry[]>(initial ? [...initial.stack] : [])
  const cursorRef = useRef(initial?.cursor ?? 0)

  const push = useCallback((entry: UndoEntry): void => {
    const stack = stackRef.current
    stack.length = cursorRef.current
    stack.push(entry)
    if (stack.length > UNDO_CAP) stack.shift()
    cursorRef.current = stack.length
  }, [])

  const undo = useCallback((): UndoEntry | undefined => {
    if (cursorRef.current === 0) return undefined
    cursorRef.current -= 1
    return stackRef.current[cursorRef.current]
  }, [])

  const redo = useCallback((): UndoEntry | undefined => {
    const stack = stackRef.current
    if (cursorRef.current >= stack.length) return undefined
    const entry = stack[cursorRef.current]
    cursorRef.current += 1
    return entry
  }, [])

  const snapshot = useCallback(
    () => ({ stack: [...stackRef.current], cursor: cursorRef.current }),
    []
  )

  return { push, undo, redo, snapshot }
}

export type UndoStack = ReturnType<typeof useUndoStack>
