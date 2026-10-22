export type MarkKind = 'highlight' | 'redact'

// Freehand pen, straight shapes and the eraser for both. ('draw' stays the
// signature tool: always black, always fine.)
export type AnnotateTool = 'pen' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'eraser'

export type EditTool = MarkKind | 'draw' | 'text' | AnnotateTool

export const ANNOTATE_TOOLS: AnnotateTool[] = ['pen', 'line', 'arrow', 'rect', 'ellipse', 'eraser']

export const isShapeTool = (tool: EditTool | null): tool is 'line' | 'arrow' | 'rect' | 'ellipse' =>
  tool === 'line' || tool === 'arrow' || tool === 'rect' || tool === 'ellipse'

export const isMarkTool = (tool: EditTool | null): tool is MarkKind =>
  tool === 'highlight' || tool === 'redact'

export const isElementTool = (tool: EditTool | null): boolean =>
  tool === 'draw' || tool === 'text' || (ANNOTATE_TOOLS as (EditTool | null)[]).includes(tool)

export type MarkColor = 'yellow' | 'black'

export const MARK_COLORS: Record<MarkColor, string> = {
  yellow: '#ffd54a',
  black: '#101012'
}

export const DEFAULT_MARK_COLORS: Record<MarkKind, MarkColor> = {
  highlight: 'yellow',
  redact: 'black'
}

export interface MarkRect {
  x: number
  y: number
  w: number
  h: number
}

export interface Mark {
  id: string
  kind: MarkKind
  color: MarkColor
  rects: MarkRect[]
}

export type MarkMap = Record<string, Mark[]>
