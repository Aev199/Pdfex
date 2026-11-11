import { PDFDateString } from 'pdfjs-dist'
import type { PageEntry } from '../types'
import type { CommentReply, CommentThread } from './types'

// Comments other people left in the PDF (Acrobat, Foxit, Word's export…):
// sticky notes and the text of highlights and other markup, with the
// replies written to them and the review state ("Completed" = resolved).
// They join the comment panel so they can be answered and closed here.

interface RawAnnotation {
  id: string
  subtype: string
  inReplyTo?: string
  replyType?: string
  titleObj?: { str: string }
  contentsObj?: { str: string }
  creationDate?: string | null
  modificationDate?: string | null
  state?: string | null
  stateModel?: string | null
  rect: number[]
}

// Kinds Acrobat lists as comments when they carry text (not text boxes,
// whose text is on the page already).
const COMMENTED = new Set([
  'Text',
  'Highlight',
  'Underline',
  'StrikeOut',
  'Squiggly',
  'Square',
  'Circle',
  'Line',
  'Polygon',
  'PolyLine',
  'Ink',
  'Stamp',
  'Caret',
  'FileAttachment',
  'Sound'
])

const isoDate = (pdfDate: string | null | undefined): string => {
  const date = pdfDate ? PDFDateString.toDateObject(pdfDate) : null
  return (date ?? new Date(0)).toISOString()
}

const message = (a: RawAnnotation): CommentReply => ({
  id: crypto.randomUUID(),
  origin: a.id,
  author: a.titleObj?.str?.trim() || 'Unknown',
  createdAt: isoDate(a.creationDate ?? a.modificationDate),
  ...(a.modificationDate && a.creationDate && a.modificationDate !== a.creationDate
    ? { editedAt: isoDate(a.modificationDate) }
    : {}),
  text: a.contentsObj?.str ?? ''
})

export async function readPdfComments(page: PageEntry): Promise<CommentThread[]> {
  const pdfPage = await page.source.pdf.getPage(page.pageIndex + 1)
  const annotations = (await pdfPage.getAnnotations()) as RawAnnotation[]
  if (annotations.length === 0) return []
  const viewport = pdfPage.getViewport({ scale: 1 })
  const roots = new Map<string, CommentThread>()
  const replies: RawAnnotation[] = []
  for (const a of annotations) {
    if (!COMMENTED.has(a.subtype)) continue
    if (a.inReplyTo) {
      replies.push(a)
      continue
    }
    const text = a.contentsObj?.str?.trim()
    if (a.subtype !== 'Text' && !text) continue
    // Top-left corner of the annotation, as a fraction of the page as shown.
    const [x, y] = viewport.convertToViewportPoint(a.rect[0], a.rect[3])
    roots.set(a.id, {
      ...message(a),
      anchor: {
        x: Math.min(1, Math.max(0, x / viewport.width)),
        y: Math.min(1, Math.max(0, y / viewport.height))
      },
      replies: [],
      resolved: false,
      resolvedInFile: false
    })
  }
  // Replies to replies belong to the same thread.
  const rootOf = (id: string | undefined, depth = 0): CommentThread | undefined => {
    if (!id || depth > 20) return undefined
    const direct = roots.get(id)
    if (direct) return direct
    return rootOf(replies.find((r) => r.id === id)?.inReplyTo, depth + 1)
  }
  for (const r of replies) {
    const thread = rootOf(r.inReplyTo)
    if (!thread) continue
    if (r.state && (r.stateModel ?? 'Review') === 'Review') {
      const done = r.state === 'Completed' || r.state === 'Accepted'
      thread.resolved = done
      thread.resolvedInFile = done
      if (done) {
        thread.resolvedBy = r.titleObj?.str?.trim() || undefined
        thread.resolvedAt = isoDate(r.modificationDate ?? r.creationDate)
      }
      continue
    }
    if (r.replyType && r.replyType !== 'R') continue
    thread.replies.push(message(r))
  }
  for (const thread of roots.values()) {
    thread.replies.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
  return [...roots.values()]
}
