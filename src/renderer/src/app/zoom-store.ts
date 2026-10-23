import { useSyncExternalStore } from 'react'

// Zoom ticks arrive ~11×/sec during a continuous zoom/pan. Routing them
// through App state would re-render the whole tree just to update the
// toolbar's percentage label, so the value lives in a tiny external store
// that only the label subscribes to.
export interface ZoomStore {
  get: () => number
  set: (value: number) => void
  subscribe: (listener: () => void) => () => void
}

export function createZoomStore(): ZoomStore {
  let value = 1
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next: number) => {
      if (next === value) return
      value = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

export function useZoomValue(store: ZoomStore): number {
  return useSyncExternalStore(store.subscribe, store.get)
}
