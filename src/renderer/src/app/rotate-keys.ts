// Ctrl + Shift + "+" turns pages clockwise, Ctrl + Shift + "-" back. Read by
// key position, so the same keys work in the Russian layout and on the
// number pad.
export function rotateKey(event: KeyboardEvent): 90 | -90 | null {
  if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey) return null
  if (event.code === 'Equal' || event.code === 'NumpadAdd') return 90
  if (event.code === 'Minus' || event.code === 'NumpadSubtract') return -90
  return null
}
