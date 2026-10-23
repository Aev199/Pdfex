import { zoomIdentity } from 'd3-zoom'
import { MIN_SCALE, MAX_SCALE, FIT_MARGIN, TARGET_VISIBLE_DOCS } from './zoom-constants'
import { MIN_DOC_WIDTH } from './layout'

interface Dims {
  contentWidth: number
  contentHeight: number
  slotHeight: number
}

// A document is one row of pages, so a 400-page report is a very wide row.
// Fitting all of it would shrink every page to a speck; fit about fifteen
// pages' worth instead and start at the left, where the row begins.
const FIT_MAX_WIDTH = MIN_DOC_WIDTH * 3

export function computeFitTransform(
  vp: HTMLDivElement,
  dims: Dims
): ReturnType<typeof zoomIdentity.translate> {
  const W = vp.clientWidth
  const H = vp.clientHeight
  const { contentWidth: cw, contentHeight: ch, slotHeight: slot } = dims
  const visibleDocs = Math.min(TARGET_VISIBLE_DOCS, Math.max(1, ch / slot))
  const fitWidth = Math.min(cw, FIT_MAX_WIDTH)
  const k = Math.max(
    MIN_SCALE,
    Math.min(MAX_SCALE, (W * FIT_MARGIN) / fitWidth, (H * FIT_MARGIN) / (visibleDocs * slot))
  )
  const marginX = (W * (1 - FIT_MARGIN)) / 2
  const marginY = (H * (1 - FIT_MARGIN)) / 2
  const tx = cw * k > W ? marginX : (W - cw * k) / 2
  const ty = ch * k > H ? marginY : (H - ch * k) / 2
  return zoomIdentity.translate(tx, ty).scale(k)
}
