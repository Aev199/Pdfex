import type { MarkKind } from '../edit/types'

export type ElementKind = 'ink' | 'text' | 'shape'

export interface ElementPoint {
  x: number
  y: number
}

export interface ElementRect {
  x: number
  y: number
  w: number
  h: number
}

export interface InkElement {
  id: string
  kind: 'ink'
  number: number
  color: string
  strokeWidth: number
  points: ElementPoint[]
  bbox: ElementRect
}

export interface TextMark {
  kind: MarkKind
  start: number
  end: number
}

export type TextFont = 'sans' | 'serif' | 'mono'

// Typeface of a text element; missing fields mean sans, regular.
export interface TextLook {
  font: TextFont
  bold: boolean
}

export interface TextStyle extends TextLook {
  fontSize: number
  color: string
}

export interface TextElement {
  id: string
  kind: 'text'
  number: number
  color: string
  fontSize: number
  font?: TextFont
  bold?: boolean
  text: string
  origin: ElementPoint
  marks: TextMark[]
  bbox: ElementRect
}

export type ShapeKind = 'line' | 'arrow' | 'rect' | 'ellipse'

// A straight-edged mark drawn from one corner (or end) to the other.
export interface ShapeElement {
  id: string
  kind: 'shape'
  number: number
  shape: ShapeKind
  color: string
  strokeWidth: number
  from: ElementPoint
  to: ElementPoint
  bbox: ElementRect
}

// Pen and shape colour and line width, chosen in the annotation toolbar.
export interface DrawStyle {
  color: string
  strokeWidth: number
}

export const DRAW_COLORS = ['#16161c', '#e5322d', '#1f6feb', '#1a9b4b', '#f59f00', '#8e44ad']
export const DRAW_WIDTHS = [1, 2, 4, 8]

export type PageElement = InkElement | TextElement | ShapeElement

export type ElementMap = Record<string, PageElement[]>

export const INK_COLOR = '#16161c'

export const INK_STROKE_WIDTH = 1.6

export const TEXT_COLOR = '#16161c'

export const TEXT_FONT_SIZE = 14

export const TEXT_FONT_FAMILIES: Record<TextFont, string> = {
  sans: 'Helvetica, Arial, sans-serif',
  serif: '"Times New Roman", Times, serif',
  mono: '"Courier New", Courier, monospace'
}

export const TEXT_FONT_FAMILY = TEXT_FONT_FAMILIES.sans

export const TEXT_SIZES = [10, 12, 14, 18, 24, 32]

export const lookOf = (e: { font?: TextFont; bold?: boolean }): TextLook => ({
  font: e.font ?? 'sans',
  bold: !!e.bold
})

export const DEFAULT_TEXT_STYLE: TextStyle = {
  font: 'sans',
  bold: false,
  fontSize: 14,
  color: '#16161c'
}

export const TEXT_LINE_HEIGHT = 1.25

export const TEXT_BASELINE = 0.9

export const TEXT_MARK_PAD = 1.5

export const textLines = (text: string): string[] => text.split('\n')

export const elementLabel = (element: PageElement): string => `Element #${element.number}`
