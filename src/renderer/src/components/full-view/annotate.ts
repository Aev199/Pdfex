import type {
  DrawStyle,
  ElementPoint,
  MeasureMode,
  MeasureScale,
  ShapeKind,
  TextStyle
} from '../../elements/types'

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
  measureScale: MeasureScale
  onMeasure: (
    pageId: string,
    mode: MeasureMode,
    points: ElementPoint[],
    pageWidth: number,
    pageHeight: number
  ) => void
  // A known dimension was drawn, this long in points: ask for its real length.
  onCalibrate: (lengthPoints: number) => void
  onCallout: (
    pageId: string,
    anchor: ElementPoint,
    origin: ElementPoint,
    text: string,
    pageWidth: number,
    pageHeight: number
  ) => void
}
