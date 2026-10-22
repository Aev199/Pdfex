import { BASE_PAGE_HEIGHT, CARD_PAD_X, PAGE_GAP, MIN_DOC_WIDTH } from '../canvas/layout'
import type { PendingImport } from '../app/types'

// Skeleton screen for a document that is still importing: pulsing gray page
// blocks so the user sees data is on its way. Before the page count is known
// (during conversion/parsing) a generic three-block row pulses; once pdf.js
// reports the count, the row shows that many blocks.
const PLACEHOLDER_BLOCKS = 3
// Cap the DOM cost for huge documents; the overflow is summarized instead.
const MAX_BLOCKS = 40
// US-Letter aspect placeholder width, matching the layout's reference page.
const BLOCK_WIDTH = Math.round((BASE_PAGE_HEIGHT * 612) / 792)

const blockCount = (pageCount: number | null): number =>
  pageCount === null ? PLACEHOLDER_BLOCKS : Math.max(1, Math.min(pageCount, MAX_BLOCKS))

// Row width for the canvas wrapper, mirroring how layout.ts sizes real rows.
export function skeletonRowWidth(pending: PendingImport): number {
  const blocks = blockCount(pending.pageCount)
  const strip = blocks * BLOCK_WIDTH + (blocks - 1) * PAGE_GAP
  return Math.max(MIN_DOC_WIDTH, strip + CARD_PAD_X * 2)
}

export function SkeletonRow({ pending }: { pending: PendingImport }): React.JSX.Element {
  const blocks = blockCount(pending.pageCount)
  const overflow = pending.pageCount !== null ? pending.pageCount - blocks : 0
  return (
    <section className="doc-row skeleton-row" aria-hidden="true">
      <div className="skeleton-header">
        <span className="skeleton-name" title={pending.name}>
          {pending.name}
        </span>
        <span className="skeleton-status">
          {pending.pageCount === null
            ? 'Reading…'
            : `${pending.pageCount} ${pending.pageCount === 1 ? 'page' : 'pages'}`}
        </span>
      </div>
      <div className="ghost-strip">
        {Array.from({ length: blocks }, (_, i) => (
          <div
            key={i}
            className="skeleton-page"
            style={{
              width: BLOCK_WIDTH,
              height: BASE_PAGE_HEIGHT,
              animationDelay: `${(i % 8) * 110}ms`
            }}
          />
        ))}
        {overflow > 0 && <span className="skeleton-more">+{overflow} more</span>}
      </div>
    </section>
  )
}
