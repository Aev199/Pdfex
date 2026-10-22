import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { ContextMenu } from '../components/ContextMenu'
import type { ContextMenuItem, ContextMenuState } from '../components/ContextMenu'

type OpenMenu = (x: number, y: number, items: ContextMenuItem[]) => void

const MenuContext = createContext<OpenMenu>(() => {})

// One context menu for the whole window; anything can open it.
export function ContextMenuProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const openMenu = useCallback<OpenMenu>((x, y, items) => setMenu({ x, y, items }), [])
  const close = useCallback(() => setMenu(null), [])
  const value = useMemo(() => openMenu, [openMenu])
  return (
    <MenuContext.Provider value={value}>
      {children}
      <ContextMenu menu={menu} onClose={close} />
    </MenuContext.Provider>
  )
}

export const useContextMenu = (): OpenMenu => useContext(MenuContext)
