import { PDFArray, PDFHexString, PDFName, PDFString } from 'pdf-lib'
import type { PDFDict, PDFDocument, PDFObject, PDFPage, PDFRef } from 'pdf-lib'
import type { CommentReply, CommentThread } from '../comments/types'
import { normalizeRotation, visualPointToUser } from './redact/geometry'

// Review comments leave as the PDF's own sticky notes: one /Text annotation
// per thread at its pin, each reply a /Text annotation "in reply to" it
// (/IRT), and a resolved thread a hidden review-state note (/State
// Completed), the way Acrobat writes them. Other viewers list them as a
// conversation; nothing is drawn on the page.

const ICON = 20
// NoZoom | NoRotate: the note icon keeps its size and stays upright.
const ICON_FLAGS = 8 | 16
// Hidden too, for the state notes that only carry the review status.
const STATE_FLAGS = 2 | ICON_FLAGS
const NOTE_COLOR = [0.98, 0.78, 0.2]

const commentAuthorOf = (thread: CommentThread): string => thread.resolvedBy || thread.author

const pdfDate = (iso: string | undefined): PDFString | undefined => {
  const date = iso ? new Date(iso) : null
  return date && !Number.isNaN(date.getTime()) ? PDFString.fromDate(date) : undefined
}

function note(
  doc: PDFDocument,
  page: PDFPage,
  rect: number[],
  message: Pick<CommentReply, 'id' | 'author' | 'text' | 'createdAt' | 'editedAt'>,
  extra: Record<string, PDFObject | string | number | boolean>
): PDFDict {
  const created = pdfDate(message.createdAt)
  const modified = pdfDate(message.editedAt) ?? created
  const fields: Record<string, PDFObject | string | number | boolean | number[]> = {
    Type: 'Annot',
    Subtype: 'Text',
    Rect: rect,
    P: page.ref,
    Contents: PDFHexString.fromText(message.text),
    T: PDFHexString.fromText(message.author),
    NM: PDFString.of(message.id),
    Name: 'Comment',
    C: NOTE_COLOR,
    F: ICON_FLAGS,
    Open: false,
    ...extra
  }
  if (created) fields.CreationDate = created
  if (modified) fields.M = modified
  return doc.context.obj(fields)
}

// pdf.js names an annotation by its object reference: "15R" ("15R2" for a
// later generation).
export const annotationId = (ref: PDFRef): string =>
  ref.generationNumber === 0
    ? `${ref.objectNumber}R`
    : `${ref.objectNumber}R${ref.generationNumber}`

// `copied`: the page's own annotations as copied into `doc`, by their id in
// the source file. Comments read from the file are already among them; only
// what was added here (replies, a change of state) is written next to them.
export function addCommentAnnotations(
  doc: PDFDocument,
  page: PDFPage,
  threads: CommentThread[] | undefined,
  copied: Map<string, PDFRef> = new Map()
): void {
  if (!threads?.length) return
  const box = page.getCropBox()
  const rot = normalizeRotation(page.getRotation().angle)
  let annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
  if (!annots) {
    annots = doc.context.obj([])
    page.node.set(PDFName.of('Annots'), annots)
  }
  const add = (dict: PDFDict): PDFRef => {
    const ref = doc.context.register(dict)
    annots!.push(ref)
    return ref
  }
  for (const thread of threads) {
    const at = visualPointToUser(thread.anchor.x, thread.anchor.y, box, rot)
    // The icon hangs from its top-left corner at the pin.
    const rect = [at.x, at.y - ICON, at.x + ICON, at.y]
    const inFile = thread.origin ? copied.get(thread.origin) : undefined
    const root = inFile ?? add(note(doc, page, rect, thread, {}))
    for (const reply of thread.replies) {
      if (inFile && reply.origin) continue
      add(note(doc, page, rect, reply, { IRT: root }))
    }
    if (inFile && thread.resolved === !!thread.resolvedInFile) continue
    if (inFile && !thread.resolved) {
      // Reopened here: the review state goes back to none.
      const by = commentAuthorOf(thread)
      add(
        note(
          doc,
          page,
          rect,
          {
            id: `${thread.id}-state`,
            author: by,
            text: `None set by ${by}`,
            createdAt: new Date().toISOString()
          },
          {
            IRT: root,
            State: PDFString.of('None'),
            StateModel: PDFString.of('Review'),
            F: STATE_FLAGS
          }
        )
      )
      continue
    }
    if (thread.resolved) {
      const by = thread.resolvedBy || thread.author
      add(
        note(
          doc,
          page,
          rect,
          {
            id: `${thread.id}-state`,
            author: by,
            text: `Completed set by ${by}`,
            createdAt: thread.resolvedAt ?? thread.createdAt
          },
          {
            IRT: root,
            State: PDFString.of('Completed'),
            StateModel: PDFString.of('Review'),
            F: STATE_FLAGS
          }
        )
      )
    }
  }
}
