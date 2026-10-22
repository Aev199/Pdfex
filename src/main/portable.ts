import { app } from 'electron'
import { dirname, join } from 'path'
import { mkdirSync, rmSync, writeFileSync } from 'fs'

// Where settings, localStorage and the autosaved session live.
//
// The Windows build ships as a ZIP: everything it writes goes to a `data`
// folder next to pdfx.exe so the app can run from a USB stick or a folder the
// user unpacked without touching %APPDATA%. When that folder can't be written
// (read-only share, Program Files, locked-down machine) we fall back to the
// regular per-user location and tell the user once the window is up.

export type DataLocation =
  | { kind: 'override'; path: string }
  | { kind: 'portable'; path: string }
  | { kind: 'fallback'; path: string; wanted: string }
  | { kind: 'default'; path: string }

const writable = (dir: string): boolean => {
  try {
    mkdirSync(dir, { recursive: true })
    const probe = join(dir, `.write-test-${process.pid}`)
    writeFileSync(probe, '')
    rmSync(probe, { force: true })
    return true
  } catch {
    return false
  }
}

// Must run before `app.whenReady()` and before the single-instance lock, both
// of which pin themselves to the userData path on first use.
export function configureDataLocation(): DataLocation {
  const override = process.env.PDFX_USER_DATA
  if (override) {
    app.setPath('userData', override)
    return { kind: 'override', path: override }
  }

  if (!app.isPackaged || process.platform !== 'win32') {
    return { kind: 'default', path: app.getPath('userData') }
  }

  const wanted = join(dirname(process.execPath), 'data')
  if (writable(wanted)) {
    app.setPath('userData', wanted)
    app.setPath('crashDumps', join(wanted, 'crashes'))
    return { kind: 'portable', path: wanted }
  }
  return { kind: 'fallback', path: app.getPath('userData'), wanted }
}
