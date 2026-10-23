import { Dialog } from './Dialog'
import { DownloadIcon } from '../icons'
import type { UpdateOffer, UpdateState } from '../../../../preload/app-types'

const act = (action: Parameters<typeof window.api.updateAction>[0]) => (): void =>
  void window.api.updateAction(action)

const size = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`

function Notes({ offer }: { offer: UpdateOffer }): React.JSX.Element {
  return (
    <ul className="update-notes">
      {offer.notes.length === 0 && <li className="update-muted">No change list attached.</li>}
      {offer.notes.slice(0, 40).map((note, i) => (
        <li key={i}>{note}</li>
      ))}
    </ul>
  )
}

// Title-bar pill: something to act on.
export function UpdateBadge({ state }: { state: UpdateState }): React.JSX.Element | null {
  const phase = state.phase
  const label =
    phase.kind === 'available'
      ? `Update ${phase.offer.version}`
      : phase.kind === 'downloading'
        ? phase.total
          ? `Downloading ${Math.floor((phase.done * 100) / phase.total)}%`
          : 'Downloading…'
        : phase.kind === 'ready' || phase.kind === 'rollback'
          ? 'Restart to update'
          : null
  if (!label) return null
  return (
    <button className="update-badge" onClick={() => void window.api.updateAction('show')}>
      <DownloadIcon size={12} />
      {label}
    </button>
  )
}

export function UpdateDialog({
  state,
  version
}: {
  state: UpdateState
  version: string
}): React.JSX.Element | null {
  const close = act('dismiss')
  const current = <p className="update-muted">This is version {version}.</p>

  if (state.applied && state.phase.kind !== 'ready') {
    const { ok, version: applied, message } = state.applied
    return (
      <Dialog
        title={ok ? `PDFx ${applied}` : 'The update did not go through'}
        onClose={close}
        footer={
          <button className="btn primary" onClick={close}>
            OK
          </button>
        }
      >
        {ok ? (
          <p>Version {applied} is installed. Tabs and documents are where you left them.</p>
        ) : (
          <>
            <p>The previous version was kept and still works.</p>
            {message && <p className="update-error">{message}</p>}
          </>
        )}
      </Dialog>
    )
  }

  if (!state.dialog) return null
  const phase = state.phase
  switch (phase.kind) {
    case 'available':
      return (
        <Dialog
          title={`Version ${phase.offer.version}${phase.offer.prerelease ? ' (beta)' : ''} is available`}
          onClose={close}
          footer={
            <>
              <button className="btn ghost" onClick={act('skip')}>
                Skip this version
              </button>
              <button className="btn ghost" onClick={close}>
                Later
              </button>
              <button className="btn primary" onClick={act('download')}>
                Update
              </button>
            </>
          }
        >
          {current}
          {!phase.offer.url.startsWith('https://') && (
            <p className="update-muted">File: {phase.offer.url}</p>
          )}
          <Notes offer={phase.offer} />
        </Dialog>
      )
    case 'downloading': {
      const fraction = phase.total ? Math.min(1, phase.done / phase.total) : 0
      return (
        <Dialog title={`Downloading version ${phase.offer.version}`} onClose={close}>
          <div className="update-progress">
            <div style={{ width: `${fraction * 100}%` }} />
          </div>
          <p className="update-muted">
            {phase.total ? `${size(phase.done)} of ${size(phase.total)}` : size(phase.done)}
          </p>
          <p className="update-muted">
            You can keep working. The download is checked against its checksum and replaces PDFx
            only as a whole, when PDFx closes.
          </p>
        </Dialog>
      )
    }
    case 'ready':
      return (
        <Dialog
          title={`Version ${phase.offer.version} is ready`}
          onClose={close}
          footer={
            <>
              <button className="btn ghost" onClick={close}>
                When I close PDFx
              </button>
              <button className="btn primary" onClick={act('restart')}>
                Restart now
              </button>
            </>
          }
        >
          <p>
            It replaces this version when PDFx restarts or closes. Tabs and documents are kept. The
            current version stays next to it and can be brought back in About.
          </p>
        </Dialog>
      )
    case 'rollback':
      return (
        <Dialog
          title={`Back to version ${phase.version}`}
          onClose={close}
          footer={
            <>
              <button className="btn ghost" onClick={act('cancel')}>
                Cancel
              </button>
              <button className="btn ghost" onClick={close}>
                When I close PDFx
              </button>
              <button className="btn primary" onClick={act('restart')}>
                Restart now
              </button>
            </>
          }
        >
          <p>
            Version {phase.version} comes back when PDFx restarts or closes. This version is kept,
            so the rollback can be undone the same way.
          </p>
        </Dialog>
      )
    case 'blocked':
      return (
        <Dialog
          title="GitHub is out of reach"
          onClose={close}
          footer={
            <>
              <button className="btn ghost" onClick={close}>
                Close
              </button>
              <button className="btn primary" onClick={act('browser')}>
                Download in browser
              </button>
            </>
          }
        >
          <p>
            It looks like only the browser may go online. Download the ZIP in the browser: PDFx will
            notice it in Downloads and offer to install it.
          </p>
          <p className="update-muted">{phase.reason}</p>
        </Dialog>
      )
    case 'failed':
      return (
        <Dialog
          title="The update did not go through"
          onClose={close}
          footer={
            <>
              {phase.offer?.page && (
                <button className="btn ghost" onClick={act('page')}>
                  Release page
                </button>
              )}
              <button className="btn ghost" onClick={close}>
                Close
              </button>
              {phase.offer && (
                <button className="btn primary" onClick={act('download')}>
                  Try again
                </button>
              )}
            </>
          }
        >
          <p className="update-error">{phase.message}</p>
        </Dialog>
      )
    default:
      return null
  }
}
