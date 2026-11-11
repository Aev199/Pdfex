import { useEffect, useRef, useState } from 'react'
import type { DocEntry } from '../../types'
import type { CommentMap, CommentReply, CommentThread } from '../../comments/types'
import { formatWhen, orderedThreads } from '../../comments/threads'
import { CloseIcon, EyeIcon, EyeOffIcon, PlusIcon } from '../icons'

// The reader's comment list: every thread of the open document by page, with
// replies, resolve and the show/hide switches.

export interface CommentActions {
  onReply: (pageId: string, threadId: string, text: string) => void
  onEdit: (pageId: string, threadId: string, replyId: string | null, text: string) => void
  onRemove: (pageId: string, threadId: string, replyId: string | null) => void
  onResolve: (pageId: string, threadId: string, resolved: boolean) => void
}

interface CommentsPanelProps extends CommentActions {
  doc: DocEntry
  comments: CommentMap
  numbers: Map<string, number>
  activeId: string | null
  // A new comment placed on a page and waiting for its text.
  draftPage: number | null
  placing: boolean
  showResolved: boolean
  pinsShown: boolean
  onNew: () => void
  onPost: (text: string) => void
  onCancelDraft: () => void
  onSelect: (pageIndex: number, threadId: string) => void
  onShowResolved: (show: boolean) => void
  onPinsShown: (shown: boolean) => void
  onClose: () => void
}

export function CommentsPanel(props: CommentsPanelProps): React.JSX.Element {
  const { doc, comments, numbers, activeId, draftPage, placing, showResolved, pinsShown } = props
  const listRef = useRef<HTMLDivElement>(null)

  const pages = doc.pages
    .map((page, index) => ({
      page,
      index,
      threads: orderedThreads(comments[page.id] ?? []).filter(
        (t) => showResolved || !t.resolved || t.id === activeId
      )
    }))
    .filter((p) => p.threads.length > 0)
  const all = doc.pages.flatMap((p) => comments[p.id] ?? [])
  const open = all.filter((t) => !t.resolved).length
  const resolved = all.length - open

  // Bring the chosen thread (e.g. from a pin) into view.
  useEffect(() => {
    if (!activeId) return
    listRef.current
      ?.querySelector(`[data-thread="${activeId}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeId])

  return (
    <aside className="comments-panel" onPointerDown={(e) => e.stopPropagation()}>
      <header className="comments-head">
        <span className="comments-title">
          Comments{open > 0 && <span className="comments-count">{open}</span>}
        </span>
        <button
          className={'comments-icon-btn' + (pinsShown ? '' : ' on')}
          title={pinsShown ? 'Hide comments on the page' : 'Show comments on the page'}
          aria-pressed={!pinsShown}
          onClick={() => props.onPinsShown(!pinsShown)}
        >
          {pinsShown ? <EyeIcon size={15} /> : <EyeOffIcon size={15} />}
        </button>
        <button
          className={'btn comments-new' + (placing ? ' on' : '')}
          title="Click this, then the place on the page"
          onClick={props.onNew}
        >
          <PlusIcon size={13} /> New
        </button>
        <button className="comments-icon-btn" title="Close" onClick={props.onClose}>
          <CloseIcon size={14} />
        </button>
      </header>
      {placing && (
        <p className="comments-hint">Click the page where the comment goes · Esc cancels</p>
      )}
      <label className="comments-filter">
        <input
          type="checkbox"
          checked={showResolved}
          onChange={(e) => props.onShowResolved(e.target.checked)}
        />
        <span>Show resolved{resolved > 0 ? ` (${resolved})` : ''}</span>
      </label>
      <div className="comments-list" ref={listRef}>
        {draftPage !== null && (
          <div className="comment-card draft">
            <div className="comment-page">New comment · page {draftPage + 1}</div>
            <Composer
              autoFocus
              placeholder="Write a comment"
              action="Post"
              onSubmit={props.onPost}
              onCancel={props.onCancelDraft}
            />
          </div>
        )}
        {pages.map(({ page, index, threads }) => (
          <section key={page.id}>
            <div className="comment-page">Page {index + 1}</div>
            {threads.map((thread) => (
              <ThreadCard
                key={thread.id}
                pageId={page.id}
                thread={thread}
                number={numbers.get(thread.id)}
                active={thread.id === activeId}
                onSelect={() => props.onSelect(index, thread.id)}
                actions={props}
              />
            ))}
          </section>
        ))}
        {pages.length === 0 && draftPage === null && (
          <p className="comments-empty">
            {all.length > 0
              ? 'All comments are resolved.'
              : 'No comments yet. Press New, then click the page.'}
          </p>
        )}
      </div>
    </aside>
  )
}

function ThreadCard({
  pageId,
  thread,
  number,
  active,
  onSelect,
  actions
}: {
  pageId: string
  thread: CommentThread
  number: number | undefined
  active: boolean
  onSelect: () => void
  actions: CommentActions
}): React.JSX.Element {
  const [replying, setReplying] = useState(false)
  return (
    <div
      className={'comment-card' + (active ? ' on' : '') + (thread.resolved ? ' resolved' : '')}
      data-thread={thread.id}
      onClick={onSelect}
    >
      <Message
        message={thread}
        number={number}
        resolve={
          <button
            className="comment-resolve"
            title={thread.resolved ? 'Reopen' : 'Resolve: hide it from the page'}
            onClick={(e) => {
              e.stopPropagation()
              actions.onResolve(pageId, thread.id, !thread.resolved)
            }}
          >
            {thread.resolved ? 'Reopen' : '✓ Resolve'}
          </button>
        }
        onEdit={(text) => actions.onEdit(pageId, thread.id, null, text)}
        onRemove={() => actions.onRemove(pageId, thread.id, null)}
        removeLabel={thread.replies.length > 0 ? 'Delete thread' : 'Delete'}
      />
      {thread.replies.map((reply) => (
        <Message
          key={reply.id}
          reply
          message={reply}
          onEdit={(text) => actions.onEdit(pageId, thread.id, reply.id, text)}
          onRemove={() => actions.onRemove(pageId, thread.id, reply.id)}
          removeLabel="Delete"
        />
      ))}
      {thread.resolved && thread.resolvedBy && (
        <div className="comment-state">
          Resolved by {thread.resolvedBy}
          {thread.resolvedAt ? ` · ${formatWhen(thread.resolvedAt)}` : ''}
        </div>
      )}
      {replying ? (
        <Composer
          autoFocus
          placeholder="Reply"
          action="Reply"
          onSubmit={(text) => {
            actions.onReply(pageId, thread.id, text)
            setReplying(false)
          }}
          onCancel={() => setReplying(false)}
        />
      ) : (
        <button
          className="comment-reply-btn"
          onClick={(e) => {
            e.stopPropagation()
            onSelect()
            setReplying(true)
          }}
        >
          Reply
        </button>
      )}
    </div>
  )
}

function Message({
  message,
  number,
  reply,
  resolve,
  onEdit,
  onRemove,
  removeLabel
}: {
  message: CommentReply
  number?: number
  reply?: boolean
  resolve?: React.ReactNode
  onEdit: (text: string) => void
  onRemove: () => void
  removeLabel: string
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(timer)
  }, [confirming])
  return (
    <div className={'comment-message' + (reply ? ' reply' : '')}>
      <div className="comment-meta">
        {number !== undefined && <span className="comment-number">{number}</span>}
        <span className="comment-author">{message.author}</span>
        <span className="comment-when" title={new Date(message.createdAt).toLocaleString()}>
          {formatWhen(message.createdAt)}
          {message.editedAt ? ' · edited' : ''}
          {message.origin ? ' · in the file' : ''}
        </span>
        {resolve}
      </div>
      {editing ? (
        <Composer
          autoFocus
          initial={message.text}
          action="Save"
          onSubmit={(text) => {
            onEdit(text)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <div className="comment-text">{message.text}</div>
          {!message.origin && (
            <div className="comment-tools">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setEditing(true)
                }}
              >
                Edit
              </button>
              <button
                className={confirming ? 'danger' : ''}
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirming) onRemove()
                  else setConfirming(true)
                }}
              >
                {confirming ? `${removeLabel}?` : removeLabel}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Enter sends, Shift+Enter starts a new line, Esc gives up.
function Composer({
  initial = '',
  placeholder,
  action,
  autoFocus,
  onSubmit,
  onCancel
}: {
  initial?: string
  placeholder?: string
  action: string
  autoFocus?: boolean
  onSubmit: (text: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const [text, setText] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!autoFocus) return
    const el = ref.current
    el?.focus()
    el?.setSelectionRange(el.value.length, el.value.length)
  }, [autoFocus])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [text])
  const submit = (): void => {
    const value = text.trim()
    if (value) onSubmit(value)
  }
  return (
    <div className="comment-composer" onClick={(e) => e.stopPropagation()}>
      <textarea
        ref={ref}
        rows={2}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          }
        }}
      />
      <div className="comment-composer-actions">
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn yellow" disabled={!text.trim()} onClick={submit}>
          {action}
        </button>
      </div>
    </div>
  )
}
