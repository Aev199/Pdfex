import { useCallback, useRef, useState } from 'react'
import type { MarkKind } from '../edit/types'
import type { DrawStyle, ElementMap, ElementPoint, PageElement, ShapeKind } from '../elements/types'
import { translateElement } from '../elements/geometry'
import { createInkElement, createTextElement, editedTextElement } from '../elements/create'
import { createShapeElement } from '../elements/shapes'
import { applyElementEntry } from '../elements/apply-entry'
import { toggleMark } from '../elements/text-marks'
import type { TextSpan } from '../elements/text-marks'
import { ACTIONS } from './undo'
import type { ElementUndoEntry, UndoEntry } from './undo'

export function useElements(
  pushUndo: (entry: UndoEntry) => void,
  initial: ElementMap = {},
  initialNextNumber = 1
) {
  const [elements, setElements] = useState<ElementMap>(initial)
  const elementsRef = useRef(elements)
  elementsRef.current = elements
  const nextNumberRef = useRef(initialNextNumber)

  const addElement = useCallback(
    (pageId: string, element: PageElement | null): PageElement | null => {
      if (!element) return null
      nextNumberRef.current += 1
      pushUndo({ action: ACTIONS.ELEMENT, value: 'add', payload: { pageId, element } })
      const map = elementsRef.current
      setElements({ ...map, [pageId]: [...(map[pageId] ?? []), element] })
      return element
    },
    [pushUndo]
  )

  const addInk = useCallback(
    (
      pageId: string,
      points: ElementPoint[],
      pageWidth: number,
      pageHeight: number,
      style?: DrawStyle
    ) =>
      addElement(
        pageId,
        createInkElement(points, nextNumberRef.current, pageWidth, pageHeight, style)
      ),
    [addElement]
  )

  const addShape = useCallback(
    (
      pageId: string,
      shape: ShapeKind,
      from: ElementPoint,
      to: ElementPoint,
      pageWidth: number,
      pageHeight: number,
      style: DrawStyle
    ) =>
      addElement(
        pageId,
        createShapeElement(shape, from, to, nextNumberRef.current, pageWidth, pageHeight, style)
      ),
    [addElement]
  )

  // The eraser: one undo step for everything wiped in one stroke.
  const removeElements = useCallback(
    (pageId: string, ids: string[]) => {
      const map = elementsRef.current
      const gone = (map[pageId] ?? []).filter((e) => ids.includes(e.id))
      if (gone.length === 0) return
      pushUndo({
        action: ACTIONS.ELEMENT,
        value: 'remove-batch',
        payload: { pageId, elements: gone }
      })
      setElements({ ...map, [pageId]: map[pageId].filter((e) => !ids.includes(e.id)) })
    },
    [pushUndo]
  )

  const addText = useCallback(
    (pageId: string, text: string, origin: ElementPoint, pageWidth: number, pageHeight: number) =>
      addElement(
        pageId,
        createTextElement(text, origin, nextNumberRef.current, pageWidth, pageHeight)
      ),
    [addElement]
  )

  const addTexts = useCallback(
    (
      pageId: string,
      items: { text: string; origin: ElementPoint; fontSize?: number }[],
      pageWidth: number,
      pageHeight: number
    ): PageElement[] => {
      const created: PageElement[] = []
      for (const item of items) {
        const element = createTextElement(
          item.text,
          item.origin,
          nextNumberRef.current,
          pageWidth,
          pageHeight,
          item.fontSize
        )
        if (!element) continue
        nextNumberRef.current += 1
        created.push(element)
      }
      if (created.length === 0) return created
      pushUndo({
        action: ACTIONS.ELEMENT,
        value: 'add-batch',
        payload: { pageId, elements: created }
      })
      setElements((map) => ({ ...map, [pageId]: [...(map[pageId] ?? []), ...created] }))
      return created
    },
    [pushUndo]
  )

  const removeElement = useCallback(
    (pageId: string, elementId: string) => {
      const map = elementsRef.current
      const element = map[pageId]?.find((e) => e.id === elementId)
      if (!element) return
      pushUndo({ action: ACTIONS.ELEMENT, value: 'remove', payload: { pageId, element } })
      setElements({ ...map, [pageId]: map[pageId].filter((e) => e.id !== elementId) })
    },
    [pushUndo]
  )

  const updateElement = useCallback(
    (pageId: string, value: 'move' | 'mark' | 'edit', before: PageElement, after: PageElement) => {
      pushUndo({ action: ACTIONS.ELEMENT, value, payload: { pageId, before, after } })
      const map = elementsRef.current
      setElements({
        ...map,
        [pageId]: (map[pageId] ?? []).map((e) => (e.id === before.id ? after : e))
      })
    },
    [pushUndo]
  )

  const moveElement = useCallback(
    (pageId: string, elementId: string, dx: number, dy: number) => {
      const element = elementsRef.current[pageId]?.find((e) => e.id === elementId)
      if (!element) return
      updateElement(pageId, 'move', element, translateElement(element, dx, dy))
    },
    [updateElement]
  )

  const toggleTextMark = useCallback(
    (pageId: string, elementId: string, kind: MarkKind, span: TextSpan) => {
      const element = elementsRef.current[pageId]?.find((e) => e.id === elementId)
      if (!element || element.kind !== 'text') return
      updateElement(pageId, 'mark', element, {
        ...element,
        marks: toggleMark(element.marks, kind, span)
      })
    },
    [updateElement]
  )

  const updateText = useCallback(
    (pageId: string, elementId: string, text: string, pageWidth: number, pageHeight: number) => {
      const element = elementsRef.current[pageId]?.find((e) => e.id === elementId)
      if (!element || element.kind !== 'text' || text === element.text) return
      if (text.trim().length === 0) {
        removeElement(pageId, elementId)
        return
      }
      updateElement(
        pageId,
        'edit',
        element,
        editedTextElement(element, text, pageWidth, pageHeight)
      )
    },
    [removeElement, updateElement]
  )

  const applyEntry = useCallback((entry: ElementUndoEntry, direction: 'undo' | 'redo') => {
    const map = elementsRef.current
    setElements({
      ...map,
      [entry.payload.pageId]: applyElementEntry(map[entry.payload.pageId] ?? [], entry, direction)
    })
  }, [])

  const applyUndo = useCallback(
    (entry: ElementUndoEntry) => applyEntry(entry, 'undo'),
    [applyEntry]
  )
  const applyRedo = useCallback(
    (entry: ElementUndoEntry) => applyEntry(entry, 'redo'),
    [applyEntry]
  )

  // Give duplicated pages (new id -> original id) the elements of their originals.
  // `from` holds the originals' annotations when they come from elsewhere
  // (pages pasted from another tab).
  const copyToPages = useCallback((origins: Map<string, string>, from?: ElementMap) => {
    const map = elementsRef.current
    let next: ElementMap | null = null
    for (const [copyId, originId] of origins) {
      const list = (from ?? map)[originId]
      if (!list?.length) continue
      next ??= { ...map }
      next[copyId] = list.map((e) => ({ ...e, id: crypto.randomUUID() }))
    }
    if (next) setElements(next)
  }, [])

  return {
    elements,
    elementsRef,
    copyToPages,
    nextNumberRef,
    addInk,
    addShape,
    removeElements,
    addText,
    addTexts,
    removeElement,
    moveElement,
    toggleTextMark,
    updateText,
    applyUndo,
    applyRedo
  }
}

export type ElementState = ReturnType<typeof useElements>
