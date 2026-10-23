import { useCallback, useRef, useState } from 'react'
import type { CommentMap, CommentPoint } from '../comments/types'
import {
  createReply,
  createThread,
  editedThread,
  resolvedThread,
  withThread
} from '../comments/threads'
import { commentAuthor } from './settings-store'

// Review comments of the workspace. They are a conversation, not an edit of
// the pages, so they stay out of the undo history (as in other PDF tools).
export function useComments(initial: CommentMap = {}) {
  const [comments, setComments] = useState<CommentMap>(initial)
  const commentsRef = useRef(comments)
  commentsRef.current = comments

  const commit = useCallback((next: CommentMap) => {
    commentsRef.current = next
    setComments(next)
  }, [])

  const addThread = useCallback(
    (pageId: string, anchor: CommentPoint, text: string): string => {
      const thread = createThread(anchor, text, commentAuthor())
      const map = commentsRef.current
      commit({ ...map, [pageId]: [...(map[pageId] ?? []), thread] })
      return thread.id
    },
    [commit]
  )

  const reply = useCallback(
    (pageId: string, threadId: string, text: string) =>
      commit(
        withThread(commentsRef.current, pageId, threadId, (t) => ({
          // Answering a closed thread opens it again.
          ...(t.resolved ? resolvedThread(t, false, '') : t),
          replies: [...t.replies, createReply(text, commentAuthor())]
        }))
      ),
    [commit]
  )

  const editText = useCallback(
    (pageId: string, threadId: string, replyId: string | null, text: string) =>
      commit(
        withThread(commentsRef.current, pageId, threadId, (t) => editedThread(t, replyId, text))
      ),
    [commit]
  )

  // `replyId` null removes the whole thread.
  const remove = useCallback(
    (pageId: string, threadId: string, replyId: string | null) =>
      commit(
        withThread(commentsRef.current, pageId, threadId, (t) =>
          replyId === null ? null : { ...t, replies: t.replies.filter((r) => r.id !== replyId) }
        )
      ),
    [commit]
  )

  const resolve = useCallback(
    (pageId: string, threadId: string, resolved: boolean) =>
      commit(
        withThread(commentsRef.current, pageId, threadId, (t) =>
          resolvedThread(t, resolved, commentAuthor())
        )
      ),
    [commit]
  )

  return { comments, commentsRef, addThread, reply, editText, remove, resolve }
}

export type CommentState = ReturnType<typeof useComments>
