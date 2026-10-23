import type { CommentMap, CommentPoint, CommentReply, CommentThread } from './types'

const now = (): string => new Date().toISOString()

export function createThread(anchor: CommentPoint, text: string, author: string): CommentThread {
  return {
    id: crypto.randomUUID(),
    author,
    createdAt: now(),
    text,
    anchor: { x: clamp01(anchor.x), y: clamp01(anchor.y) },
    replies: [],
    resolved: false
  }
}

export const createReply = (text: string, author: string): CommentReply => ({
  id: crypto.randomUUID(),
  author,
  createdAt: now(),
  text
})

// `replyId` null edits the thread's own first comment.
export function editedThread(
  thread: CommentThread,
  replyId: string | null,
  text: string
): CommentThread {
  const editedAt = now()
  if (replyId === null) return { ...thread, text, editedAt }
  return {
    ...thread,
    replies: thread.replies.map((r) => (r.id === replyId ? { ...r, text, editedAt } : r))
  }
}

export const resolvedThread = (
  thread: CommentThread,
  resolved: boolean,
  author: string
): CommentThread =>
  resolved
    ? { ...thread, resolved, resolvedBy: author, resolvedAt: now() }
    : { ...thread, resolved, resolvedBy: undefined, resolvedAt: undefined }

// Replaces (or with null removes) one thread of a page.
export function withThread(
  map: CommentMap,
  pageId: string,
  threadId: string,
  change: (thread: CommentThread) => CommentThread | null
): CommentMap {
  const page = map[pageId]
  const thread = page?.find((t) => t.id === threadId)
  if (!thread) return map
  const next = change(thread)
  const threads = next
    ? page.map((t) => (t === thread ? next : t))
    : page.filter((t) => t !== thread)
  const out = { ...map }
  if (threads.length > 0) out[pageId] = threads
  else delete out[pageId]
  return out
}

// Where a pin goes on screen, for a page turned clockwise by `rotation`, and
// back. Anchors are kept in the page's own orientation so they follow Rotate.
export function visualAnchor(p: CommentPoint, rotation: number | undefined): CommentPoint {
  switch (rotation) {
    case 90:
      return { x: 1 - p.y, y: p.x }
    case 180:
      return { x: 1 - p.x, y: 1 - p.y }
    case 270:
      return { x: p.y, y: 1 - p.x }
    default:
      return p
  }
}

export function pageAnchor(p: CommentPoint, rotation: number | undefined): CommentPoint {
  switch (rotation) {
    case 90:
      return { x: p.y, y: 1 - p.x }
    case 180:
      return { x: 1 - p.x, y: 1 - p.y }
    case 270:
      return { x: 1 - p.y, y: p.x }
    default:
      return p
  }
}

export const openCount = (threads: CommentThread[] | undefined): number =>
  threads?.filter((t) => !t.resolved).length ?? 0

// Threads of a page in reading order: top to bottom, then left to right, so
// pin numbers read like the page.
export const orderedThreads = (threads: CommentThread[]): CommentThread[] =>
  [...threads].sort((a, b) => a.anchor.y - b.anchor.y || a.anchor.x - b.anchor.x)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "just now", "5 min ago", "14:05", "12 Oct", "12 Oct 2025".
export function formatWhen(iso: string, at: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const minutes = Math.floor((at.getTime() - date.getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  if (date.toDateString() === at.toDateString()) return time
  const day = `${date.getDate()} ${MONTHS[date.getMonth()]}`
  return date.getFullYear() === at.getFullYear() ? day : `${day} ${date.getFullYear()}`
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}
