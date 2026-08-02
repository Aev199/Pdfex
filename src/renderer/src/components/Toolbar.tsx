import { isWeb } from '../platform/web/install'
import { useGitHubStars } from '../app/useGitHubStars'
import { FeatureHeaderActions } from '../features/HeaderActions'
import { BoltIcon, GitHubIcon } from './icons'

interface ToolbarProps {
  documentCount: number
  pageCount: number
  busy: boolean
  zoom: number
  aiOpen: boolean
  aiEnabled: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  onOpen: () => void
  onExportPdf: () => void
  onExportZip: () => void
  onToggleAi: () => void
}

const isMac = window.api.platform === 'darwin'

export function Toolbar({
  documentCount,
  pageCount,
  busy,
  zoom,
  aiOpen,
  aiEnabled,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onOpen,
  onExportPdf,
  onExportZip,
  onToggleAi
}: ToolbarProps): React.JSX.Element {
  const stars = useGitHubStars(isWeb ? 'AlexandrosGounis/pdfx' : null)
  return (
    <header className={`toolbar${isMac ? ' mac' : ''}`}>
      <button className="btn glass" onClick={onOpen} disabled={busy}>
        Open
      </button>
      {documentCount > 0 && (
        <div className="toolbar-meta">
          {documentCount} {documentCount === 1 ? 'document' : 'documents'}
          <span className="dot">·</span>
          {pageCount} {pageCount === 1 ? 'page' : 'pages'}
        </div>
      )}
      <div className="toolbar-spacer" />
      {documentCount > 0 && (
        <div className="zoom-cluster">
          <button className="icon-btn" title="Zoom out" onClick={onZoomOut}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M5 12h14" />
            </svg>
          </button>
          <button className="zoom-value" title="Reset zoom" onClick={onZoomReset}>
            {Math.round(zoom * 100)}%
          </button>
          <button className="icon-btn" title="Zoom in" onClick={onZoomIn}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </button>
        </div>
      )}
      <button className="btn glass" onClick={onExportPdf} disabled={busy || documentCount === 0}>
        Export PDF
      </button>
      <button className="btn glass" onClick={onExportZip} disabled={busy || documentCount === 0}>
        Export ZIP
      </button>
      <FeatureHeaderActions />
      {isWeb && (
        <a
          className="btn glass"
          href="https://github.com/AlexandrosGounis/pdfx"
          target="_blank"
          rel="noreferrer"
          title="Star pdfx on GitHub"
        >
          <GitHubIcon size={14} />
          Star
          {stars && <span className="star-count">{stars}</span>}
        </a>
      )}
      {aiEnabled && (
        <button
          className={`btn glass square ai-btn${aiOpen ? ' active' : ''}`}
          title="AI assistant"
          onClick={onToggleAi}
        >
          <BoltIcon size={18} />
        </button>
      )}
    </header>
  )
}
