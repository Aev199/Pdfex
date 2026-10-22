import { useCallback, useEffect, useRef, useState } from 'react'
import { WorkspaceView } from './WorkspaceView'
import type { WorkspaceViewHandle } from './WorkspaceView'
import { TabBar } from './components/TabBar'
import { ContextMenuProvider } from './app/context-menu'
import { carryDocs, newWorkspace, uniqueTabName } from './app/workspaces'
import type { Workspace, WorkspaceSnapshot } from './app/workspaces'
import type { DocsUpdate } from './app/useCollection'
import type { DocEntry } from './types'
import { useSession } from './app/useSession'

interface Tabs {
  workspaces: Workspace[]
  activeId: string
}

const initialTabs = (): Tabs => {
  const first = newWorkspace('Tab 1')
  return { workspaces: [first], activeId: first.id }
}

const applyDocsUpdate = (docs: DocEntry[], update: DocsUpdate): DocEntry[] =>
  typeof update === 'function' ? update(docs) : update

export default function App(): React.JSX.Element {
  const [tabs, setTabs] = useState<Tabs>(initialTabs)
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const viewRef = useRef<WorkspaceViewHandle | null>(null)
  const flash = useCallback((message: string) => viewRef.current?.flash(message), [])

  // The active workspace's snapshot in `tabs` goes stale while it's mounted;
  // read the live one from the view whenever it matters.
  const liveSnapshot = useCallback((ws: Workspace): WorkspaceSnapshot => {
    if (ws.id === tabsRef.current.activeId && viewRef.current) return viewRef.current.snapshot()
    return ws.snapshot
  }, [])

  // Store the active view's state into its workspace, then apply `next`.
  const leaveActive = useCallback(
    (next: (tabs: Tabs) => Tabs) => {
      const current = tabsRef.current
      const live = current.workspaces.find((w) => w.id === current.activeId)
      const parked: Tabs = live
        ? {
            ...current,
            workspaces: current.workspaces.map((w) =>
              w.id === live.id ? { ...w, snapshot: liveSnapshot(w) } : w
            )
          }
        : current
      setTabs(next(parked))
    },
    [liveSnapshot]
  )

  const adopt = useCallback(
    (workspaces: Workspace[], activeId: string | null, mode: 'replace' | 'append') => {
      if (mode === 'replace') {
        const active = workspaces.some((w) => w.id === activeId) ? activeId! : workspaces[0].id
        setTabs({ workspaces, activeId: active })
        return
      }
      leaveActive((t) => {
        // A lone empty tab is just the startup placeholder: replace it.
        const keep =
          t.workspaces.length === 1 &&
          t.workspaces[0].snapshot.docs.length === 0 &&
          t.workspaces[0].snapshot.missing.length === 0
            ? []
            : t.workspaces
        const taken = keep.map((w) => w.name)
        const added = workspaces.map((w) => {
          const name = uniqueTabName(w.name, taken)
          taken.push(name)
          return { ...w, name }
        })
        return { workspaces: [...keep, ...added], activeId: activeId ?? added[0].id }
      })
    },
    [leaveActive]
  )

  const session = useSession({ tabsRef, liveSnapshot, adopt, flash })
  const { scheduleSave } = session
  useEffect(() => {
    scheduleSave()
  }, [tabs, scheduleSave])

  const selectTab = useCallback(
    (id: string) => {
      if (id === tabsRef.current.activeId) return
      leaveActive((t) => ({ ...t, activeId: id }))
    },
    [leaveActive]
  )

  const addTab = useCallback(() => {
    leaveActive((t) => {
      const ws = newWorkspace(
        uniqueTabName(
          'Tab 1',
          t.workspaces.map((w) => w.name)
        )
      )
      return { workspaces: [...t.workspaces, ws], activeId: ws.id }
    })
  }, [leaveActive])

  const closeTab = useCallback(
    (id: string) => {
      leaveActive((t) => {
        const index = t.workspaces.findIndex((w) => w.id === id)
        if (index === -1) return t
        const rest = t.workspaces.filter((w) => w.id !== id)
        if (rest.length === 0) return initialTabs()
        const activeId = t.activeId === id ? rest[Math.min(index, rest.length - 1)].id : t.activeId
        return { workspaces: rest, activeId }
      })
    },
    [leaveActive]
  )

  const renameTab = useCallback((id: string, name: string) => {
    setTabs((t) => ({
      ...t,
      workspaces: t.workspaces.map((w) => (w.id === id ? { ...w, name: name.trim() } : w))
    }))
  }, [])

  const recolorTab = useCallback((id: string, color: string | null) => {
    setTabs((t) => ({
      ...t,
      workspaces: t.workspaces.map((w) => (w.id === id ? { ...w, color } : w))
    }))
  }, [])

  const cycleTab = useCallback(
    (direction: 1 | -1) => {
      const { workspaces, activeId } = tabsRef.current
      const index = workspaces.findIndex((w) => w.id === activeId)
      const next = workspaces[(index + direction + workspaces.length) % workspaces.length]
      selectTab(next.id)
    },
    [selectTab]
  )

  // Move documents out of the active workspace into another one (or a new
  // tab when targetId is null), keeping their annotations and form values.
  const moveDocsToTab = useCallback((docIds: string[], targetId: string | null) => {
    const view = viewRef.current
    const current = tabsRef.current
    const active = current.workspaces.find((w) => w.id === current.activeId)
    if (!view || !active || targetId === active.id) return
    const snap = view.snapshot()
    const ids = new Set(docIds)
    const moving = snap.docs.filter((d) => ids.has(d.id))
    if (moving.length === 0) return
    view.removeDocs(docIds)
    setTabs((t) => {
      if (targetId === null) {
        const ws = newWorkspace(
          uniqueTabName(
            moving.length === 1 ? moving[0].name : 'Tab 1',
            t.workspaces.map((w) => w.name)
          )
        )
        ws.snapshot = carryDocs(snap, ws.snapshot, moving)
        return { ...t, workspaces: [...t.workspaces, ws] }
      }
      return {
        ...t,
        workspaces: t.workspaces.map((w) =>
          w.id === targetId ? { ...w, snapshot: carryDocs(snap, w.snapshot, moving) } : w
        )
      }
    })
    const target = targetId ? current.workspaces.find((w) => w.id === targetId)?.name : 'a new tab'
    view.flash(
      `Moved ${moving.length === 1 ? `"${moving[0].name}"` : `${moving.length} documents`} to ${target}`
    )
  }, [])

  // A slow import that finishes after its tab was switched away from still
  // lands in that tab.
  const detachedUpdate = useCallback(
    (workspaceId: string) => (update: DocsUpdate) => {
      if (workspaceId === tabsRef.current.activeId && viewRef.current) {
        viewRef.current.updateDocs(update)
        return
      }
      setTabs((t) => ({
        ...t,
        workspaces: t.workspaces.map((w) =>
          w.id === workspaceId
            ? { ...w, snapshot: { ...w.snapshot, docs: applyDocsUpdate(w.snapshot.docs, update) } }
            : w
        )
      }))
    },
    []
  )

  useEffect(() => {
    return window.api.onMenu((action) => {
      if (action === 'new-tab') addTab()
      else if (action === 'close-tab') {
        const { activeId } = tabsRef.current
        const count = viewRef.current?.snapshot().docs.length ?? 0
        const name = tabsRef.current.workspaces.find((w) => w.id === activeId)?.name
        if (count === 0 || window.confirm(`Close "${name}" and its ${count} document(s)?`)) {
          closeTab(activeId)
        }
      } else if (action === 'next-tab') cycleTab(1)
      else if (action === 'previous-tab') cycleTab(-1)
      else if (action === 'save-session') void session.saveSessionAs()
      else if (action === 'save-tab') session.saveTabAs(tabsRef.current.activeId)
    })
  }, [addTab, closeTab, cycleTab, session])

  const active = tabs.workspaces.find((w) => w.id === tabs.activeId) ?? tabs.workspaces[0]
  const docCount = useCallback(
    (id: string) => {
      const ws = tabsRef.current.workspaces.find((w) => w.id === id)
      return ws ? liveSnapshot(ws).docs.length : 0
    },
    [liveSnapshot]
  )

  const tabBar = (
    <TabBar
      workspaces={tabs.workspaces}
      activeId={active.id}
      onSelect={selectTab}
      onAdd={addTab}
      onClose={closeTab}
      onRename={renameTab}
      onRecolor={recolorTab}
      onSaveTab={session.saveTabAs}
      docCount={docCount}
    />
  )

  // Nothing renders until the previous session is back, so files opened from
  // the command line land in the restored tabs instead of being replaced.
  if (!session.ready) return <div className="app" />

  return (
    <ContextMenuProvider>
      <WorkspaceView
        key={active.id}
        initial={active.snapshot}
        handleRef={viewRef}
        tabBar={tabBar}
        workspaces={tabs.workspaces}
        activeWorkspaceId={active.id}
        onMoveDocsToTab={moveDocsToTab}
        onDetachedUpdate={detachedUpdate(active.id)}
        onChange={scheduleSave}
        onOpenSession={session.openSessionFile}
      />
    </ContextMenuProvider>
  )
}
