import { useEffect } from 'react'
import type { PageRef } from './types'

interface KeyboardShortcutDeps {
  active: boolean
  selected: PageRef | null
  onDeleteSelection: () => void
  onDuplicate: () => void
  onSelectAll: () => void
  onCopy: () => void
  onPaste: () => void
  onUndo: () => void
  onRedo: () => void
  onClearSelection: () => void
  findOpen: boolean
  onOpenFind: () => void
  onCloseFind: () => void
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
}

export function useKeyboardShortcuts({
  active,
  selected,
  onDeleteSelection,
  onDuplicate,
  onSelectAll,
  onCopy,
  onPaste,
  onUndo,
  onRedo,
  onClearSelection,
  findOpen,
  onOpenFind,
  onCloseFind
}: KeyboardShortcutDeps): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const mod = event.metaKey || event.ctrlKey
      // By key position, so the shortcuts also work in the Russian layout.
      const key = event.code.startsWith('Key')
        ? event.code.slice(3).toLowerCase()
        : event.key.toLowerCase()
      if (mod && key === 'f' && !isEditableTarget(event.target)) {
        event.preventDefault()
        onOpenFind()
        return
      }
      // Ctrl+Z / Ctrl+Shift+Z, and Ctrl+Y as Windows users expect.
      if (mod && (key === 'z' || key === 'y') && !isEditableTarget(event.target)) {
        event.preventDefault()
        if (key === 'y' || event.shiftKey) onRedo()
        else onUndo()
        return
      }
      if (active && findOpen && event.key === 'Escape') {
        event.preventDefault()
        onCloseFind()
        return
      }
      if (!active || isEditableTarget(event.target)) return
      if ((event.key === 'Backspace' || event.key === 'Delete') && selected) {
        event.preventDefault()
        onDeleteSelection()
      } else if (mod && key === 'a') {
        event.preventDefault()
        onSelectAll()
      } else if (mod && key === 'd' && selected) {
        event.preventDefault()
        onDuplicate()
      } else if (mod && key === 'c' && selected) {
        onCopy()
      } else if (mod && key === 'v') {
        onPaste()
      } else if (event.key === 'Escape') {
        onClearSelection()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    active,
    selected,
    onDeleteSelection,
    onDuplicate,
    onSelectAll,
    onCopy,
    onPaste,
    onUndo,
    onRedo,
    onClearSelection,
    findOpen,
    onOpenFind,
    onCloseFind
  ])
}
