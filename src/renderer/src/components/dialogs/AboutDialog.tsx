import { useEffect, useState } from 'react'
import { Dialog } from './Dialog'
import notice from '../../../../../NOTICE?raw'
import license from '../../../../../LICENSE?raw'
import type { AppInfo, UpdateState } from '../../../../preload/app-types'

interface AboutDialogProps {
  updates: UpdateState
  onClose: () => void
  onHelp: () => void
}

const AUTHOR_URL = 'https://t.me/aevd19'
const REPOSITORY_URL = 'https://github.com/Aev199/Pdfex'

export function AboutDialog({ updates, onClose, onHelp }: AboutDialogProps): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [licenses, setLicenses] = useState(false)
  useEffect(() => {
    void window.api.appInfo().then(setInfo)
  }, [updates.phase.kind])

  const checking = updates.phase.kind === 'checking'
  return (
    <Dialog title="About PDFx" className="about-dialog" onClose={onClose}>
      <div className="about-head">
        <div className="about-name">PDFx {info?.version ?? ''}</div>
        {info?.commit && <span className="about-commit">{info.commit}</span>}
        {info && info.channel !== 'stable' && info.channel !== 'dev' && (
          <span className="about-commit">{info.channel}</span>
        )}
      </div>
      <p>
        A portable PDF viewer for Windows: many documents on one canvas, tabs and sessions, drawings
        up to A0, Word, Excel and PowerPoint files, annotations and Russian OCR. Works offline and
        never changes the source files.
      </p>
      <p>
        Windows edition:{' '}
        <a href={AUTHOR_URL} target="_blank" rel="noreferrer">
          Евдокимов Александр
        </a>
        . Based on{' '}
        <a href="https://github.com/AlexandrosGounis/pdfx" target="_blank" rel="noreferrer">
          PDFx
        </a>{' '}
        by Alex Gounis and{' '}
        <a href="https://github.com/Umohammad/pdfx-plus-windows" target="_blank" rel="noreferrer">
          PDFx Plus for Windows
        </a>
        . MIT license.
      </p>
      {info && (
        <p className="about-muted">
          Electron {info.electron} · Chromium {info.chrome} · Node {info.node}
          <br />
          Settings and sessions: {info.dataDir}
        </p>
      )}
      <div className="about-actions">
        <button className="btn ghost" onClick={onHelp}>
          Help
        </button>
        <button
          className="btn ghost"
          disabled={checking || !info?.canSelfUpdate}
          title={info?.canSelfUpdate ? undefined : 'Only release builds update themselves'}
          onClick={() => void window.api.updateAction('check')}
        >
          {checking ? 'Checking…' : 'Check for updates'}
        </button>
        {info?.previousVersion && (
          <button className="btn ghost" onClick={() => void window.api.updateAction('rollback')}>
            Back to version {info.previousVersion}
          </button>
        )}
        <button className="btn ghost" onClick={() => setLicenses((v) => !v)}>
          Licenses
        </button>
        <a className="btn ghost" href={REPOSITORY_URL} target="_blank" rel="noreferrer">
          Source
        </a>
      </div>
      {updates.note && <p className="about-note">{updates.note}</p>}
      {licenses && <pre className="about-licenses">{`${notice}\n\n${license}`}</pre>}
    </Dialog>
  )
}
