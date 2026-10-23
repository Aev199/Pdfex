import { useEffect, useRef, useState } from 'react'
import { WORKSPACE_COLORS, workspaceChip } from '../app/workspaces'
import type { Workspace } from '../app/workspaces'
import { useContextMenu } from '../app/context-menu'
import { CloseIcon, PlusIcon } from './icons'

interface TabBarProps {
  workspaces: Workspace[]
  activeId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onClose: (id: string) => void
  onRename: (id: string, name: string) => void
  onRecolor: (id: string, color: string | null) => void
  onSaveTab?: (id: string) => void
  // How many documents a workspace holds (the active one is live, not its snapshot).
  docCount: (id: string) => number
  // Shown at the far end of the bar (updates, settings, help).
  trailing?: React.ReactNode
}

interface ColorPickerState {
  id: string
  x: number
  y: number
}

export function TabBar({
  workspaces,
  activeId,
  onSelect,
  onAdd,
  onClose,
  onRename,
  onRecolor,
  onSaveTab,
  docCount: countDocs,
  trailing
}: TabBarProps): React.JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [colorPicker, setColorPicker] = useState<ColorPickerState | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const openMenu = useContextMenu()

  useEffect(() => {
    if (editingId) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editingId])

  const startRename = (workspace: Workspace): void => {
    setDraft(workspace.name)
    setEditingId(workspace.id)
  }

  const commitRename = (): void => {
    if (editingId && draft.trim()) onRename(editingId, draft)
    setEditingId(null)
  }

  const requestClose = (workspace: Workspace): void => {
    const docCount = countDocs(workspace.id)
    if (
      docCount > 0 &&
      !window.confirm(
        `Close "${workspace.name}"? Its ${docCount} ${docCount === 1 ? 'document' : 'documents'} will be removed (the tab can be saved first with "Save tab as…").`
      )
    ) {
      return
    }
    onClose(workspace.id)
  }

  const onTabContextMenu = (e: React.MouseEvent, workspace: Workspace): void => {
    e.preventDefault()
    const { clientX: x, clientY: y } = e
    openMenu(x, y, [
      { label: 'Rename tab', onClick: () => startRename(workspace) },
      { label: 'Change color…', onClick: () => setColorPicker({ id: workspace.id, x, y }) },
      ...(onSaveTab
        ? [{ separator: true }, { label: 'Save tab as…', onClick: () => onSaveTab(workspace.id) }]
        : []),
      { separator: true },
      { label: 'Close tab', danger: true, onClick: () => requestClose(workspace) }
    ])
  }

  return (
    <div className="tab-bar">
      {workspaces.map((workspace) => {
        const chip = workspaceChip(workspace.color)
        const active = workspace.id === activeId
        return (
          <div
            key={workspace.id}
            className={'tab-chip' + (active ? ' active' : '')}
            style={
              chip
                ? {
                    ['--chip' as string]: chip,
                    ['--chip-bg' as string]: `${chip}${active ? '2e' : '1a'}`
                  }
                : undefined
            }
            onClick={() => onSelect(workspace.id)}
            onDoubleClick={() => startRename(workspace)}
            onAuxClick={(e) => {
              if (e.button === 1) requestClose(workspace)
            }}
            onContextMenu={(e) => onTabContextMenu(e, workspace)}
            title={workspace.name}
          >
            <span className="tab-dot" aria-hidden="true" />
            {editingId === workspace.id ? (
              <input
                ref={inputRef}
                className="tab-name-input"
                value={draft}
                size={Math.max(draft.length, 1)}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitRename()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setEditingId(null)
                  }
                }}
              />
            ) : (
              <span className="tab-name">{workspace.name}</span>
            )}
            <button
              className="tab-close"
              title="Close tab"
              onClick={(e) => {
                e.stopPropagation()
                requestClose(workspace)
              }}
            >
              <CloseIcon size={11} />
            </button>
          </div>
        )
      })}
      <button className="tab-add" title="New tab" onClick={onAdd}>
        <PlusIcon size={14} />
      </button>
      {trailing}

      {colorPicker && (
        <>
          <div className="tab-color-backdrop" onMouseDown={() => setColorPicker(null)} />
          <div className="tab-color-pop" style={{ left: colorPicker.x, top: colorPicker.y }}>
            <button
              className="tab-swatch none"
              title="No color"
              onClick={() => {
                onRecolor(colorPicker.id, null)
                setColorPicker(null)
              }}
            />
            {WORKSPACE_COLORS.map((color) => (
              <button
                key={color.key}
                className="tab-swatch"
                title={color.key}
                style={{ background: color.chip }}
                onClick={() => {
                  onRecolor(colorPicker.id, color.key)
                  setColorPicker(null)
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
