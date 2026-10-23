import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from '../icons'
import { isMac } from './geometry'
import type { EditTool } from '../../edit/types'
import type { DrawStyle } from '../../elements/types'
import { AnnotateBar } from './AnnotateBar'
import { useEffect, useState } from 'react'

interface FullViewChromeProps {
  chromeOpacity: number
  docName: string
  pi: number
  pageCount: number
  editing: boolean
  tool: EditTool | null
  canRevert: boolean
  onEnterEdit: () => void
  onFinishEdit: () => void
  onRevert: () => void
  onToggleTool: (tool: EditTool) => void
  drawStyle: DrawStyle
  onDrawStyle: (style: DrawStyle) => void
  runClose: () => void
  goToPage: (pi: number) => void
  sidebarOpen: boolean
  onToggleSidebar: () => void
  onPrint: () => void
  // Editing is off on pages turned with Rotate (see FullView).
  editBlocked: string | null
  navByKey: (axis: 'x' | 'y', dir: 1 | -1) => void
}

export function FullViewChrome({
  chromeOpacity,
  docName,
  pi,
  pageCount,
  editing,
  tool,
  canRevert,
  onEnterEdit,
  onFinishEdit,
  onRevert,
  onToggleTool,
  drawStyle,
  onDrawStyle,
  runClose,
  goToPage,
  sidebarOpen,
  onToggleSidebar,
  onPrint,
  editBlocked,
  navByKey
}: FullViewChromeProps): React.JSX.Element {
  return (
    <div className="full-chrome" style={{ opacity: chromeOpacity }}>
      <header className={`full-bar${isMac ? ' mac' : ''}`}>
        <button
          className={`btn glass square${sidebarOpen ? ' on' : ''}`}
          title="Pages and outline (F4)"
          aria-pressed={sidebarOpen}
          onClick={onToggleSidebar}
        >
          <SidebarIcon />
        </button>
        <span className="full-title">{docName}</span>
        <div className="full-actions">
          {editing ? (
            <>
              <button
                className={`btn glass${tool === 'draw' ? ' on' : ''}`}
                aria-pressed={tool === 'draw'}
                onClick={() => onToggleTool('draw')}
              >
                Sign
              </button>
              <button
                className={`btn glass${tool === 'text' ? ' on' : ''}`}
                aria-pressed={tool === 'text'}
                onClick={() => onToggleTool('text')}
              >
                Add Text
              </button>
              <button
                className={`btn glass${tool === 'highlight' ? ' on' : ''}`}
                aria-pressed={tool === 'highlight'}
                onClick={() => onToggleTool('highlight')}
              >
                Highlight
              </button>
              <button
                className={`btn glass${tool === 'redact' ? ' on' : ''}`}
                aria-pressed={tool === 'redact'}
                onClick={() => onToggleTool('redact')}
              >
                Hide Text
              </button>
              <button className="btn glass" disabled={!canRevert} onClick={onRevert}>
                Revert
              </button>
              <button className="btn yellow" onClick={onFinishEdit}>
                Done
              </button>
            </>
          ) : (
            <>
              <button className="btn glass" title="Print (Ctrl+P)" onClick={onPrint}>
                Print
              </button>
              <button
                className="btn glass"
                disabled={!!editBlocked}
                title={editBlocked ?? undefined}
                onClick={onEnterEdit}
              >
                Edit
              </button>
            </>
          )}
          <button className="btn glass square" title="Close (Esc)" onClick={runClose}>
            <CloseIcon size={16} />
          </button>
        </div>
      </header>
      {editing && (
        <AnnotateBar tool={tool} style={drawStyle} onTool={onToggleTool} onStyle={onDrawStyle} />
      )}

      <button
        className="full-nav prev"
        disabled={pi === 0}
        onClick={() => navByKey('x', -1)}
        title="Previous page (↑, wheel up)"
      >
        <ChevronLeftIcon size={18} />
      </button>
      <button
        className="full-nav next"
        disabled={pi === pageCount - 1}
        onClick={() => navByKey('x', 1)}
        title="Next page (↓, wheel down)"
      >
        <ChevronRightIcon size={18} />
      </button>

      <PageJump pi={pi} pageCount={pageCount} onGo={goToPage} />
    </div>
  )
}

function SidebarIcon(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M6 2.5v11" />
    </svg>
  )
}

// "12 / 340": type a number and press Enter to go there.
function PageJump({
  pi,
  pageCount,
  onGo
}: {
  pi: number
  pageCount: number
  onGo: (pi: number) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(String(pi + 1))
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!editing) setDraft(String(pi + 1))
  }, [pi, editing])
  const commit = (): void => {
    const n = Number.parseInt(draft, 10)
    if (Number.isFinite(n)) onGo(Math.min(pageCount, Math.max(1, n)) - 1)
    setEditing(false)
  }
  return (
    <div className="full-count">
      <input
        className="full-count-input"
        value={draft}
        size={Math.max(2, String(pageCount).length)}
        inputMode="numeric"
        aria-label="Page number"
        onFocus={(e) => {
          setEditing(true)
          e.currentTarget.select()
        }}
        onBlur={commit}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') {
            setDraft(String(pi + 1))
            setEditing(false)
            e.currentTarget.blur()
          }
        }}
      />
      <span> / {pageCount}</span>
    </div>
  )
}
