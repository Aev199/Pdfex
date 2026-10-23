import type { DrawStyle, ElementPoint, ShapeKind, TextStyle } from '../../elements/types'

// What the annotation tools (pen, shapes, eraser) need from the full view.
export interface AnnotateHandlers {
  style: DrawStyle
  textStyle: TextStyle
  onPen: (pageId: string, points: ElementPoint[], pageWidth: number, pageHeight: number) => void
  onShape: (
    pageId: string,
    shape: ShapeKind,
    from: ElementPoint,
    to: ElementPoint,
    pageWidth: number,
    pageHeight: number
  ) => void
  onErase: (pageId: string, ids: string[]) => void
}
