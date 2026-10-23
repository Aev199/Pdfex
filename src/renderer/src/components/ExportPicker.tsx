import { useEffect, useRef, useState } from 'react'
import type { DocEntry } from '../types'

interface ExportPickerProps {
  docs: DocEntry[]
  onCancel: () => void
  onConfirm: (docIds: string[]) => void
}

// Modal shown before "Export PDF": pick which documents to include.
// All documents start checked; confirm exports them in workboard order.
export function ExportPicker({ docs, onCancel, onConfirm }: ExportPickerProps): React.JSX.Element {
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set(docs.map((d) => d.id)))
  const allRef = useRef<HTMLInputElement>(null)

  const allChecked = checked.size === docs.length
  const noneChecked = checked.size === 0
  const selectedDocs = docs.filter((d) => checked.has(d.id))
  const selectedPages = selectedDocs.reduce((sum, d) => sum + d.pages.length, 0)

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = !allChecked && !noneChecked
  }, [allChecked, noneChecked])

  const confirm = (): void => {
    if (!noneChecked) onConfirm(selectedDocs.map((d) => d.id))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        confirm()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const toggle = (id: string): void => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="picker-backdrop" onMouseDown={onCancel}>
      <div
        className="picker"
        role="dialog"
        aria-label="Export documents as PDF"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="picker-title">Export as PDF</div>
        <label className="picker-row picker-all">
          <input
            ref={allRef}
            type="checkbox"
            checked={allChecked}
            onChange={() => setChecked(allChecked ? new Set() : new Set(docs.map((d) => d.id)))}
          />
          <span>All documents</span>
          <span className="picker-pages">{docs.length}</span>
        </label>
        <div className="picker-list">
          {docs.map((doc, index) => (
            <label key={doc.id} className="picker-row">
              <input
                type="checkbox"
                checked={checked.has(doc.id)}
                onChange={() => toggle(doc.id)}
              />
              <span className="picker-name" title={doc.name}>
                <span className="picker-index">{String(index + 1).padStart(2, '0')}</span>
                {doc.name}
              </span>
              <span className="picker-pages">
                {doc.pages.length} {doc.pages.length === 1 ? 'page' : 'pages'}
              </span>
            </label>
          ))}
        </div>
        <div className="picker-footer">
          <span className="picker-count">
            {noneChecked
              ? 'Nothing selected'
              : `${selectedDocs.length} ${selectedDocs.length === 1 ? 'document' : 'documents'} · ${selectedPages} ${selectedPages === 1 ? 'page' : 'pages'}`}
          </span>
          <button className="btn glass" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn glass" onClick={confirm} disabled={noneChecked}>
            Export
          </button>
        </div>
      </div>
    </div>
  )
}
