import { useCallback, useRef, useState } from 'react'
import { MARK_COLORS } from '../../../edit/types'
import type { EditTool, MarkLook, MarkMap } from '../../../edit/types'
import { DEFAULT_TEXT_STYLE, DRAW_COLORS, DRAW_WIDTHS, TEXT_SIZES } from '../../../elements/types'
import type { DrawStyle, MeasureScale, TextStyle } from '../../../elements/types'
import { ratioScale } from '../../../elements/measures'

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
  textStyle: TextStyle
  setTextStyle: (style: TextStyle) => void
  markLook: MarkLook
  setMarkLook: (look: MarkLook) => void
  measureScale: MeasureScale
  setMeasureScale: (scale: MeasureScale) => void
}

const STYLE_KEY = 'pdfx.drawStyle'
const TEXT_STYLE_KEY = 'pdfx.textStyle'
const MARK_LOOK_KEY = 'pdfx.markLook'
const MEASURE_SCALE_KEY = 'pdfx.measureScale'

function loadSaved<T>(key: string, valid: (value: T) => boolean, fallback: T): T {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as T | null
    if (saved && valid(saved)) return saved
  } catch {
    // Storage unavailable or corrupt: fall back to the default.
  }
  return fallback
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Not remembered, but still applied.
  }
}

const loadTextStyle = (): TextStyle =>
  loadSaved<TextStyle>(
    TEXT_STYLE_KEY,
    (s) =>
      ['sans', 'serif', 'mono'].includes(s.font) &&
      typeof s.bold === 'boolean' &&
      TEXT_SIZES.includes(s.fontSize) &&
      DRAW_COLORS.includes(s.color),
    DEFAULT_TEXT_STYLE
  )

const loadMeasureScale = (): MeasureScale =>
  loadSaved<MeasureScale>(
    MEASURE_SCALE_KEY,
    (s) =>
      typeof s.perPoint === 'number' &&
      s.perPoint > 0 &&
      ['mm', 'cm', 'm'].includes(s.unit) &&
      typeof s.label === 'string',
    ratioScale(100, 'm')
  )

const loadMarkLook = (): MarkLook =>
  loadSaved<MarkLook>(
    MARK_LOOK_KEY,
    (l) => ['fill', 'underline', 'strike'].includes(l.style) && l.color in MARK_COLORS,
    { style: 'fill', color: 'yellow' }
  )

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
  const [textStyle, setTextStyleState] = useState<TextStyle>(loadTextStyle)
  const setTextStyle = useCallback((style: TextStyle) => {
    setTextStyleState(style)
    save(TEXT_STYLE_KEY, style)
  }, [])
  const [markLook, setMarkLookState] = useState<MarkLook>(loadMarkLook)
  const setMarkLook = useCallback((look: MarkLook) => {
    setMarkLookState(look)
    save(MARK_LOOK_KEY, look)
  }, [])
  const [measureScale, setMeasureScaleState] = useState<MeasureScale>(loadMeasureScale)
  const setMeasureScale = useCallback((scale: MeasureScale) => {
    setMeasureScaleState(scale)
    save(MEASURE_SCALE_KEY, scale)
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
    setDrawStyle,
    textStyle,
    setTextStyle,
    markLook,
    setMarkLook,
    measureScale,
    setMeasureScale
  }
}
