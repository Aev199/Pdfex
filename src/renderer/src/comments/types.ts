// Review comments: notes pinned to a point of a page that people answer and
// close, as in Acrobat or Figma. They are not page content: they never draw
// on the sheet and leave the PDF as standard /Text annotations, replies
// linked to their thread with /IRT.

export interface CommentPoint {
  // Fractions 0..1 of the page in its own orientation (before Rotate).
  x: number
  y: number
}

export interface CommentReply {
  id: string
  author: string
  // ISO time it was written, and last changed if edited.
  createdAt: string
  editedAt?: string
  text: string
  // Read from the PDF (its annotation id there, like "15R"): someone else's
  // words, kept as they are in the file; not edited or deleted here.
  origin?: string
}

export interface CommentThread extends CommentReply {
  anchor: CommentPoint
  replies: CommentReply[]
  // Closed: hidden from the page and the list unless resolved ones are shown.
  resolved: boolean
  resolvedBy?: string
  resolvedAt?: string
  // For a thread read from the PDF: whether the file already marks it done.
  resolvedInFile?: boolean
}

// Threads by page id, as marks and elements.
export type CommentMap = Record<string, CommentThread[]>
