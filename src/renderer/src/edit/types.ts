export type MarkKind = 'highlight' | 'redact'

// Freehand pen, straight shapes, callouts, measurements and the eraser for
// all of them. ('draw' stays the signature tool: always black, always fine.)
export type AnnotateTool =
  | 'pen'
  | 'line'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'callout'
  | 'distance'
  | 'path'
  | 'area'
  | 'eraser'

// 'calibrate': drawing a known dimension to set the measuring scale.
export type EditTool = MarkKind | 'draw' | 'text' | 'calibrate' | AnnotateTool

export const ANNOTATE_TOOLS: AnnotateTool[] = [
  'pen',
  'line',
  'arrow',
  'rect',
  'ellipse',
  'callout',
  'distance',
  'path',
  'area',
  'eraser'
]

export const isMeasureTool = (tool: EditTool | null): tool is 'distance' | 'path' | 'area' =>
  tool === 'distance' || tool === 'path' || tool === 'area'

export const isShapeTool = (tool: EditTool | null): tool is 'line' | 'arrow' | 'rect' | 'ellipse' =>
  tool === 'line' || tool === 'arrow' || tool === 'rect' || tool === 'ellipse'

export const isMarkTool = (tool: EditTool | null): tool is MarkKind =>
  tool === 'highlight' || tool === 'redact'

export const isElementTool = (tool: EditTool | null): boolean =>
  tool === 'draw' ||
  tool === 'text' ||
  tool === 'calibrate' ||
  (ANNOTATE_TOOLS as (EditTool | null)[]).includes(tool)

export type MarkColor = 'yellow' | 'green' | 'pink' | 'blue' | 'orange' | 'red' | 'black'

export const MARK_COLORS: Record<MarkColor, string> = {
  yellow: '#ffd54a',
  green: '#7fdc85',
  pink: '#ff92c8',
  blue: '#82c6ff',
  orange: '#ffb15c',
  red: '#e5322d',
  black: '#101012'
}

// Colours offered for marking PDF text, in the order shown.
export const TEXT_MARK_COLORS: MarkColor[] = ['yellow', 'green', 'pink', 'blue', 'orange', 'red']

// How a highlight looks: a filled band, or a line under or through the text.
export type MarkStyle = 'fill' | 'underline' | 'strike'

export interface MarkLook {
  style: MarkStyle
  color: MarkColor
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
  // Highlights only; missing means 'fill'.
  style?: MarkStyle
  rects: MarkRect[]
}

// Where a line-style mark sits inside the text rectangle (fractions of it).
export function markBand(style: MarkStyle | undefined, r: MarkRect): MarkRect {
  if (style === 'underline') return { x: r.x, y: r.y + r.h * 0.86, w: r.w, h: r.h * 0.09 }
  if (style === 'strike') return { x: r.x, y: r.y + r.h * 0.46, w: r.w, h: r.h * 0.09 }
  return r
}

export type MarkMap = Record<string, Mark[]>
