// Types shared by the main process, the preload bridge and the renderer.
// Pure declarations: the renderer type-checks this file too.

export type UpdateChannel = 'stable' | 'beta'
export type WheelMode = 'scroll' | 'zoom'
// auto: Microsoft Office when installed, else LibreOffice.
export type OfficePreference = 'auto' | 'libreoffice'

export interface Settings {
  // Look for updates soon after start and then once a day.
  updateAuto: boolean
  updateChannel: UpdateChannel
  // Plain mouse wheel: move the canvas (Ctrl zooms) or zoom (Ctrl scrolls).
  wheel: WheelMode
  // OCR language a new search starts with.
  ocrLanguage: string
  office: OfficePreference
  // Reopen the tabs of the last run on start.
  restoreSession: boolean
  // Name signed under review comments.
  commentAuthor: string
  // Exported scans get their recognized text as an invisible layer.
  exportOcr: boolean
  // Windows: PDFx is offered for PDFs (Open with, Explorer menu).
  openPdfs: boolean
  // Exported marks and drawings: part of the page, or annotations other
  // programs can move and delete.
  exportAnnotations: 'page' | 'editable'
}

export interface AppInfo {
  version: string
  commit: string
  channel: string
  electron: string
  chrome: string
  node: string
  dataDir: string
  appDir: string
  // A stamped Windows release that can replace its own folder.
  canSelfUpdate: boolean
  // Version kept next to the program after an update, if any.
  previousVersion: string | null
}

export interface UpdateOffer {
  version: string
  commit: string
  notes: string[]
  sha256: string
  // https:// URL of the ZIP, or a local path (a file the browser downloaded).
  url: string
  // Release page, or the folder of a downloaded file.
  page: string
  prerelease: boolean
}

export type UpdatePhase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; offer: UpdateOffer }
  | { kind: 'downloading'; offer: UpdateOffer; done: number; total: number | null }
  // Unpacked next to the program; replaces it when PDFx closes.
  | { kind: 'ready'; offer: UpdateOffer }
  // The previous version replaces this one when PDFx closes.
  | { kind: 'rollback'; version: string }
  | { kind: 'failed'; message: string; offer: UpdateOffer | null }
  // GitHub is out of reach (a firewall lets only the browser out).
  | { kind: 'blocked'; reason: string }

export interface UpdateState {
  phase: UpdatePhase
  // Whether the update dialog should be shown.
  dialog: boolean
  // Result line of a check asked for by hand ("You have the latest version").
  note: string | null
  // Outcome of the update applied when PDFx last closed, shown once.
  applied: { ok: boolean; version: string; message: string } | null
}
