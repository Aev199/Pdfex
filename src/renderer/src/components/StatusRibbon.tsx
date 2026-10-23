import type { DocInfo } from '../app/useDocInfo'

// Bottom ribbon describing the document under the pointer.

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export function StatusRibbon({ info }: { info: DocInfo | null }): React.JSX.Element | null {
  if (!info) return null

  const origin =
    info.sourceCount > 1
      ? `Assembled from ${info.sourceCount} files`
      : (info.folder ?? 'Not saved to disk')

  return (
    <div className="status-ribbon" role="status">
      <span className="ribbon-name" title={info.name}>
        {info.name}
      </span>
      <span className="ribbon-dot">·</span>
      <span>
        {info.pageCount} {info.pageCount === 1 ? 'page' : 'pages'}
      </span>
      <span className="ribbon-dot">·</span>
      <span>{formatBytes(info.sizeBytes)}</span>
      <span className="ribbon-dot">·</span>
      <span
        className="ribbon-origin"
        title={info.fileName ? `${origin}\\${info.fileName}` : origin}
      >
        {origin}
      </span>
      {info.createdMs !== null && (
        <>
          <span className="ribbon-dot">·</span>
          <span className="ribbon-date">
            <span className="ribbon-label">Created</span> {formatDate(info.createdMs)}
          </span>
        </>
      )}
      {info.modifiedMs !== null && (
        <>
          <span className="ribbon-dot">·</span>
          <span className="ribbon-date">
            <span className="ribbon-label">Modified</span> {formatDate(info.modifiedMs)}
          </span>
        </>
      )}
    </div>
  )
}
