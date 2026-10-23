import { useEffect, useState } from 'react'
import type { UpdateState } from '../../../preload/app-types'

const IDLE: UpdateState = { phase: { kind: 'idle' }, dialog: false, note: null, applied: null }

// Mirrors the updater state the main process pushes.
export function useUpdates(): UpdateState {
  const [state, setState] = useState<UpdateState>(IDLE)
  useEffect(() => {
    let alive = true
    void window.api.updateState().then((s) => alive && setState(s))
    const off = window.api.onUpdateState(setState)
    return () => {
      alive = false
      off()
    }
  }, [])
  return state
}
