import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DocEntry } from '../types'
import { ChevronUpIcon, ChevronDownIcon, CloseIcon } from './icons'

interface DocHeaderProps {
  doc: DocEntry
  index: number
  total: number
  onMove: (docId: string, direction: -1 | 1) => void
  onRemove: (docId: string) => void
  onRename: (docId: string, name: string) => void
  onContextMenu: (docId: string, x: number, y: number) => void
  onHover: (docId: string | null) => void
  onDragOut: (docId: string) => void
}

function DocHeaderImpl({
  doc,
  index,
  total,
  onMove,
  onRemove,
  onRename,
  onContextMenu,
  onHover,
  onDragOut
}: DocHeaderProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(doc.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(doc.name)
  }, [doc.name, editing])

  useLayoutEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const commit = (): void => {
    const name = draft.trim()
    if (name && name !== doc.name) onRename(doc.id, name)
    else setDraft(doc.name)
    setEditing(false)
  }
  const cancel = (): void => {
    setDraft(doc.name)
    setEditing(false)
  }

  return (
    <header
      className="doc-header"
      // The title floats in the overlay layer, outside the document box, so
      // it reports hover itself or the details ribbon would drop on it.
      onMouseEnter={() => onHover(doc.id)}
      onMouseLeave={() => onHover(null)}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu(doc.id, e.clientX, e.clientY)
      }}
    >
      <span
        className="doc-index"
        title="Drag out to save as PDF"
        draggable
        onDragStart={(e) => {
          // The OS file drag is started by the main process instead, so the
          // drop lands in Explorer as a real file.
          e.preventDefault()
          onDragOut(doc.id)
        }}
      >
        {String(index + 1).padStart(2, '0')}
      </span>
      {editing ? (
        <input
          ref={inputRef}
          className="doc-name doc-name-input"
          value={draft}
          size={Math.max(draft.length, 1)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cancel()
            }
          }}
        />
      ) : (
        <span
          className="doc-name"
          title={doc.name}
          onClick={(e) => {
            e.stopPropagation()
            setEditing(true)
          }}
        >
          {doc.name}
        </span>
      )}
      <span className="doc-pages">
        {doc.pages.length} {doc.pages.length === 1 ? 'page' : 'pages'}
      </span>
      <div className="doc-actions">
        <button
          className="icon-btn"
          title="Move up"
          disabled={index === 0}
          onClick={() => onMove(doc.id, -1)}
        >
          <ChevronUpIcon size={14} />
        </button>
        <button
          className="icon-btn"
          title="Move down"
          disabled={index === total - 1}
          onClick={() => onMove(doc.id, 1)}
        >
          <ChevronDownIcon size={14} />
        </button>
        <button className="icon-btn" title="Remove document" onClick={() => onRemove(doc.id)}>
          <CloseIcon size={14} />
        </button>
      </div>
    </header>
  )
}

export const DocHeader = memo(DocHeaderImpl)
