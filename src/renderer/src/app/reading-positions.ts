// The page each file was last read at in the reader, by file path, so that
// opening the file again can offer to continue there. Kept per computer in
// local storage, newest first, a few hundred files at most.

const KEY = 'pdfx.readingPositions'
const MAX = 300

type Positions = [path: string, pageIndex: number][]

function load(): Positions {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(raw)
      ? raw.filter(
          (e): e is [string, number] =>
            Array.isArray(e) && typeof e[0] === 'string' && Number.isInteger(e[1])
        )
      : []
  } catch {
    return []
  }
}

export function rememberPosition(path: string, pageIndex: number): void {
  const rest = load().filter(([p]) => p !== path)
  try {
    localStorage.setItem(KEY, JSON.stringify([[path, pageIndex], ...rest].slice(0, MAX)))
  } catch {
    // Not remembered.
  }
}

export const lastPosition = (path: string): number | null =>
  load().find(([p]) => p === path)?.[1] ?? null
