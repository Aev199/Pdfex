import type { DocPlacement, CanvasLayout } from './layout'
import { DOC_HEIGHT, DOC_SLOT, CARD_PAD_X, PAGE_GAP, pageDisplayWidth } from './layout'

export type DropTarget =
  | { kind: 'into'; docId: string; index: number }
  | { kind: 'between'; docIndex: number }

const INTO_MIN_SCREEN_PX = 90

function insertionIndexInStrip(item: DocPlacement, wx: number, excludeId: string | null): number {
  let x = item.x + CARD_PAD_X
  let index = 0
  for (const page of item.doc.pages) {
    if (page.id === excludeId) continue
    const w = pageDisplayWidth(page.width, page.height)
    if (wx <= x + w / 2) return index
    index++
    x += w + PAGE_GAP
  }
  return index
}

export function computeDropTarget(
  layout: CanvasLayout,
  worldX: number,
  worldY: number,
  scale: number,
  excludeId: string | null,
  allowInto: boolean
): DropTarget {
  const items = layout.items
  if (allowInto && DOC_HEIGHT * scale >= INTO_MIN_SCREEN_PX) {
    for (const item of items) {
      if (worldY >= item.y && worldY <= item.y + DOC_HEIGHT) {
        return {
          kind: 'into',
          docId: item.doc.id,
          index: insertionIndexInStrip(item, worldX, excludeId)
        }
      }
    }
  }
  let docIndex = 0
  for (const item of items) {
    if (item.y + DOC_HEIGHT / 2 < worldY) docIndex++
  }
  return { kind: 'between', docIndex }
}

// Whether a world point is over the page as laid out before the drag
// lifted it: dropping there leaves everything where it is.
export function overOwnPage(
  layout: CanvasLayout,
  worldX: number,
  worldY: number,
  docId: string,
  pageId: string
): boolean {
  const item = layout.items.find((it) => it.doc.id === docId)
  if (!item || worldY < item.y || worldY > item.y + DOC_HEIGHT) return false
  let x = item.x + CARD_PAD_X
  for (const page of item.doc.pages) {
    const w = pageDisplayWidth(page.width, page.height)
    if (page.id === pageId) return worldX >= x - PAGE_GAP / 2 && worldX <= x + w + PAGE_GAP / 2
    x += w + PAGE_GAP
  }
  return false
}

// A target that puts the page back where it was.
export function isOwnPlace(
  layout: CanvasLayout,
  target: DropTarget | null,
  docId: string,
  pageId: string
): boolean {
  if (target?.kind !== 'into' || target.docId !== docId) return false
  const doc = layout.items.find((it) => it.doc.id === docId)?.doc
  return !!doc && doc.pages.findIndex((p) => p.id === pageId) === target.index
}

export function betweenSlotY(layout: CanvasLayout, docIndex: number): number {
  const items = layout.items
  if (items.length === 0) return 0
  if (docIndex >= items.length) return items[items.length - 1].y + DOC_SLOT
  return items[docIndex].y
}
