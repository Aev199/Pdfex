import { useCallback, useRef, useState } from 'react'
import type { EditTool, MarkMap } from '../../../edit/types'
import { DRAW_COLORS, DRAW_WIDTHS } from '../../../elements/types'
import type { DrawStyle } from '../../../elements/types'

export interface EditMode {
  editing: boolean
  editingRef: React.MutableRefObject<boolean>
  tool: EditTool | null
  canRevert: boolean
  enterEdit: () => void
  finishEdit: () => void
  revert: () => void
  toggleTool: (tool: EditTool) => void
  drawStyle: DrawStyle
  setDrawStyle: (style: DrawStyle) => void
}

const STYLE_KEY = 'pdfx.drawStyle'

// The last colour and width used, remembered between sessions.
function loadStyle(): DrawStyle {
  try {
    const saved = JSON.parse(localStorage.getItem(STYLE_KEY) ?? 'null') as DrawStyle | null
    if (saved && DRAW_COLORS.includes(saved.color) && DRAW_WIDTHS.includes(saved.strokeWidth)) {
      return saved
    }
  } catch {
    // Storage unavailable or corrupt: fall back to the default.
  }
  return { color: DRAW_COLORS[1], strokeWidth: DRAW_WIDTHS[1] }
}

export function useEditMode(marks: MarkMap, restore: (map: MarkMap) => void): EditMode {
  const [editing, setEditing] = useState(false)
  const [tool, setTool] = useState<EditTool | null>(null)
  const [baseline, setBaseline] = useState<MarkMap>({})
  const [drawStyle, setDrawStyleState] = useState<DrawStyle>(loadStyle)
  const setDrawStyle = useCallback((style: DrawStyle) => {
    setDrawStyleState(style)
    try {
      localStorage.setItem(STYLE_KEY, JSON.stringify(style))
    } catch {
      // Not remembered, but still applied.
    }
  }, [])
  const editingRef = useRef(editing)
  editingRef.current = editing
  const marksRef = useRef(marks)
  marksRef.current = marks

  const enterEdit = useCallback(() => {
    setBaseline(marksRef.current)
    setTool(null)
    setEditing(true)
  }, [])

  const finishEdit = useCallback(() => {
    setEditing(false)
    setTool(null)
  }, [])

  const revert = useCallback(() => {
    restore(baseline)
  }, [restore, baseline])

  const toggleTool = useCallback((next: EditTool) => {
    setTool((cur) => (cur === next ? null : next))
  }, [])

  return {
    editing,
    editingRef,
    tool,
    canRevert: editing && marks !== baseline,
    enterEdit,
    finishEdit,
    revert,
    toggleTool,
    drawStyle,
    setDrawStyle
  }
}
