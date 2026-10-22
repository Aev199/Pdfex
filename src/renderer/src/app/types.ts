export interface IncomingFile {
  name: string
  data: Uint8Array
  path?: string
  size?: number
  mtimeMs?: number
}

// A file still being read or converted; shown as a placeholder row.
export interface PendingImport {
  id: string
  name: string
  pageCount: number | null
}

export interface PageRef {
  docId: string
  pageId: string
}

export interface FullViewTarget extends PageRef {
  originRect: { left: number; top: number; width: number; height: number } | null
}
