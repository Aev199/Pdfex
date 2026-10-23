import { useEffect } from 'react'

interface DialogProps {
  title: string
  className?: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
}

// Shared modal shell for Settings, About, Help and updates: Esc or a click
// outside closes it.
export function Dialog({
  title,
  className,
  onClose,
  children,
  footer
}: DialogProps): React.JSX.Element {
  useEffect(() => {
    // Keys stay inside the dialog: Delete or Ctrl+A must not reach the
    // canvas behind it. Default actions (typing, select lists) still happen.
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const field = !!target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      // Fields keep their keys (Enter to confirm); canvas shortcuts already
      // leave typing alone.
      if (!field || event.key === 'Escape') event.stopPropagation()
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div className="picker-backdrop dialog-backdrop" onMouseDown={onClose}>
      <div
        className={`picker dialog ${className ?? ''}`}
        role="dialog"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="picker-title dialog-title">
          <span>{title}</span>
          <button className="dialog-close" title="Close (Esc)" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>
  )
}
