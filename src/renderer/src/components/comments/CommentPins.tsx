import type { CommentPoint, CommentThread } from '../../comments/types'
import { pageAnchor, visualAnchor } from '../../comments/threads'

interface CommentPinsProps {
  threads: CommentThread[]
  numbers: Map<string, number>
  rotation: number | undefined
  activeId: string | null
  showResolved: boolean
  // A comment being written, not posted yet.
  draft: CommentPoint | null
  // Pins keep their size on screen when the page is zoomed.
  zoomScale: number
  onOpen: (threadId: string) => void
}

// Numbered markers over the page, on top of everything drawn on it. They sit
// outside the page's rotation so they stay upright on a turned page.
export function CommentPins({
  threads,
  numbers,
  rotation,
  activeId,
  showResolved,
  draft,
  zoomScale,
  onOpen
}: CommentPinsProps): React.JSX.Element {
  const scale = zoomScale > 0 ? 1 / zoomScale : 1
  const place = (p: CommentPoint): React.CSSProperties => {
    const at = visualAnchor(p, rotation)
    return {
      left: `${at.x * 100}%`,
      top: `${at.y * 100}%`,
      transform: `translateY(-100%) scale(${scale})`
    }
  }
  return (
    <div className="comment-pins">
      {threads
        .filter((t) => showResolved || !t.resolved || t.id === activeId)
        .map((t) => (
          <button
            key={t.id}
            className={
              'comment-pin' + (t.resolved ? ' resolved' : '') + (t.id === activeId ? ' on' : '')
            }
            style={place(t.anchor)}
            title={`${t.author}: ${t.text}`}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onOpen(t.id)
            }}
          >
            {numbers.get(t.id) ?? ''}
          </button>
        ))}
      {draft && (
        <span className="comment-pin draft on" style={place(draft)}>
          +
        </span>
      )}
    </div>
  )
}

// While placing a comment: a click on the page puts it there.
export function CommentPlaceLayer({
  rotation,
  onPlace
}: {
  rotation: number | undefined
  onPlace: (anchor: CommentPoint) => void
}): React.JSX.Element {
  return (
    <div
      className="comment-place-layer"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        const box = e.currentTarget.getBoundingClientRect()
        if (box.width === 0 || box.height === 0) return
        onPlace(
          pageAnchor(
            { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height },
            rotation
          )
        )
      }}
    />
  )
}
