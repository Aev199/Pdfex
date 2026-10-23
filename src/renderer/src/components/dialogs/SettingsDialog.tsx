import { useEffect, useState } from 'react'
import { Dialog } from './Dialog'
import { changeSettings, useSettings } from '../../app/settings-store'
import { OCR_LANGUAGES } from '../../ocr/languages'
import type { AppInfo } from '../../../../preload/app-types'

interface SettingsDialogProps {
  onClose: () => void
}

export function SettingsDialog({ onClose }: SettingsDialogProps): React.JSX.Element {
  const settings = useSettings()
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    void window.api.appInfo().then(setInfo)
  }, [])

  return (
    <Dialog title="Settings" className="settings-dialog" onClose={onClose}>
      <section className="settings-section">
        <h3>Mouse wheel</h3>
        <label className="settings-choice">
          <input
            type="radio"
            name="wheel"
            checked={settings.wheel === 'scroll'}
            onChange={() => void changeSettings({ wheel: 'scroll' })}
          />
          <span>
            Scrolls the canvas, <kbd>Ctrl</kbd> + wheel zooms
          </span>
        </label>
        <label className="settings-choice">
          <input
            type="radio"
            name="wheel"
            checked={settings.wheel === 'zoom'}
            onChange={() => void changeSettings({ wheel: 'zoom' })}
          />
          <span>
            Zooms, as in CAD programs; <kbd>Ctrl</kbd> + wheel scrolls
          </span>
        </label>
        <p className="settings-hint">Touchpad gestures work the same either way.</p>
      </section>

      <section className="settings-section">
        <h3>Start</h3>
        <label className="settings-choice">
          <input
            type="checkbox"
            checked={settings.restoreSession}
            onChange={(e) => void changeSettings({ restoreSession: e.target.checked })}
          />
          <span>Reopen the tabs and documents from last time</span>
        </label>
      </section>

      <section className="settings-section">
        <h3>Search</h3>
        <label className="settings-row">
          <span>Text recognition (OCR) language</span>
          <select
            value={settings.ocrLanguage}
            onChange={(e) => void changeSettings({ ocrLanguage: e.target.value })}
          >
            {OCR_LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
        </label>
        <p className="settings-hint">Used by new tabs and after a restart.</p>
      </section>

      <section className="settings-section">
        <h3>Word, Excel and PowerPoint</h3>
        <label className="settings-row">
          <span>Convert with</span>
          <select
            value={settings.office}
            onChange={(e) =>
              void changeSettings({
                office: e.target.value === 'libreoffice' ? 'libreoffice' : 'auto'
              })
            }
          >
            <option value="auto">Microsoft Office, else LibreOffice</option>
            <option value="libreoffice">LibreOffice, else Microsoft Office</option>
          </select>
        </label>
      </section>

      <section className="settings-section">
        <h3>Updates</h3>
        <label className="settings-choice">
          <input
            type="checkbox"
            checked={settings.updateAuto}
            onChange={(e) => void changeSettings({ updateAuto: e.target.checked })}
          />
          <span>Check for updates once a day</span>
        </label>
        <label className="settings-row">
          <span>Channel</span>
          <select
            value={settings.updateChannel}
            onChange={(e) =>
              void changeSettings({ updateChannel: e.target.value === 'beta' ? 'beta' : 'stable' })
            }
          >
            <option value="stable">Stable releases</option>
            <option value="beta">All builds (beta)</option>
          </select>
        </label>
        <p className="settings-hint">
          If only the browser may go online, the update comes from the ZIP the browser saves to
          Downloads.
        </p>
      </section>

      {info?.dataDir && (
        <section className="settings-section">
          <h3>Data</h3>
          <div className="settings-row">
            <span className="settings-path" title={info.dataDir}>
              {info.dataDir}
            </span>
            <button className="btn" onClick={() => void window.api.openDataFolder()}>
              Open folder
            </button>
          </div>
          <p className="settings-hint">Settings, the autosaved session and updates live here.</p>
        </section>
      )}
    </Dialog>
  )
}
