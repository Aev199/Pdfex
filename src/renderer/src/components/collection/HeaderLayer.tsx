import { memo } from 'react'
import { DOC_SLOT } from '../../canvas/layout'
import { DocHeader } from '../DocHeader'
import type { DocPlacement } from '../../canvas/layout'

const HEADER_OFFSET_X = 16
// The title scales from its bottom-left corner, so its bottom edge is pinned
// just above the page strip and it grows upward into the box's top padding.
const HEADER_OFFSET_Y = 52

interface HeaderLayerProps {
  items: DocPlacement[]
  betweenIndex: number
  onMove: (docId: string, direction: -1 | 1) => void
  onRemove: (docId: string) => void
  onRename: (docId: string, name: string) => void
  onContextMenu: (docId: string, x: number, y: number) => void
  onHoverDoc: (docId: string | null) => void
  onDragOut: (docId: string) => void
}

function HeaderLayerImpl({
  items,
  betweenIndex,
  onMove,
  onRemove,
  onRename,
  onContextMenu,
  onHoverDoc,
  onDragOut
}: HeaderLayerProps): React.JSX.Element {
  return (
    <>
      {items.map((item, index) => (
        <div
          key={item.doc.id}
          className="overlay-header-slot"
          style={{
            left: item.x + HEADER_OFFSET_X,
            top: item.y + HEADER_OFFSET_Y,
            transform:
              betweenIndex !== -1 && index >= betweenIndex ? `translateY(${DOC_SLOT}px)` : undefined
          }}
        >
          <DocHeader
            doc={item.doc}
            index={index}
            total={items.length}
            onMove={onMove}
            onRemove={onRemove}
            onRename={onRename}
            onContextMenu={onContextMenu}
            onHover={onHoverDoc}
            onDragOut={onDragOut}
          />
        </div>
      ))}
    </>
  )
}

export const HeaderLayer = memo(HeaderLayerImpl)
