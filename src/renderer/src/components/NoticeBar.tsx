// Persistent notices that need a decision (a file changed on disk, a file
// went missing), stacked bottom-left above the details ribbon.

export interface Notice {
  id: string
  text: string
  detail?: string
  actions: { label: string; onClick: () => void; primary?: boolean }[]
}

export function NoticeBar({ notices }: { notices: Notice[] }): React.JSX.Element | null {
  if (notices.length === 0) return null
  return (
    <div className="notice-bar" role="status">
      {notices.map((notice) => (
        <div key={notice.id} className="notice">
          <div className="notice-text">
            <span>{notice.text}</span>
            {notice.detail && (
              <span className="notice-detail" title={notice.detail}>
                {notice.detail}
              </span>
            )}
          </div>
          <div className="notice-actions">
            {notice.actions.map((action) => (
              <button
                key={action.label}
                className={'btn notice-btn' + (action.primary ? ' primary' : '')}
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
