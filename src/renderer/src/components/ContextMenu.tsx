import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface ContextMenuItem {
  label?: string
  onClick?: () => void
  danger?: boolean
  submenu?: ContextMenuItem[]
  separator?: boolean
}

export interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

interface ContextMenuProps {
  menu: ContextMenuState | null
  onClose: () => void
}

const EDGE_PAD = 8
const FLYOUT_ESTIMATE = 200

function MenuList({
  items,
  onClose
}: {
  items: ContextMenuItem[]
  onClose: () => void
}): React.JSX.Element {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [side, setSide] = useState<'left' | 'right'>('right')
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])

  const openSub = (index: number): void => {
    const row = rowRefs.current[index]
    if (row) {
      const rect = row.getBoundingClientRect()
      setSide(rect.right + FLYOUT_ESTIMATE > window.innerWidth ? 'left' : 'right')
    }
    setOpenIndex(index)
  }

  return (
    <>
      {items.map((item, index) => {
        if (item.separator) return <div key={index} className="context-menu-sep" />
        const hasSub = !!item.submenu?.length
        return (
          <div
            key={index}
            className="context-menu-row"
            ref={(el) => {
              rowRefs.current[index] = el
            }}
            onMouseEnter={() => (hasSub ? openSub(index) : setOpenIndex(null))}
          >
            <button
              type="button"
              role="menuitem"
              className={
                'context-menu-item' + (item.danger ? ' danger' : '') + (hasSub ? ' has-sub' : '')
              }
              onClick={() => {
                if (hasSub) {
                  if (openIndex === index) setOpenIndex(null)
                  else openSub(index)
                  return
                }
                item.onClick?.()
                onClose()
              }}
            >
              <span>{item.label}</span>
              {hasSub && <span className="context-menu-arrow">›</span>}
            </button>
            {hasSub && openIndex === index && (
              <div className={'context-menu-flyout ' + side}>
                <MenuList items={item.submenu!} onClose={onClose} />
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

export function ContextMenu({ menu, onClose }: ContextMenuProps): React.JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  // Keep the menu fully on screen: clamp against the measured size once mounted.
  useLayoutEffect(() => {
    if (!menu) {
      setPos(null)
      return
    }
    const rect = ref.current?.getBoundingClientRect()
    const width = rect?.width ?? 0
    const height = rect?.height ?? 0
    const x = Math.max(EDGE_PAD, Math.min(menu.x, window.innerWidth - width - EDGE_PAD))
    const y = Math.max(EDGE_PAD, Math.min(menu.y, window.innerHeight - height - EDGE_PAD))
    setPos({ x, y })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const onPointerDown = (event: PointerEvent): void => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('wheel', onClose, { passive: true })
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('wheel', onClose)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
    }
  }, [menu, onClose])

  if (!menu) return null

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      style={{
        left: pos?.x ?? menu.x,
        top: pos?.y ?? menu.y,
        visibility: pos ? 'visible' : 'hidden'
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuList items={menu.items} onClose={onClose} />
    </div>
  )
}
