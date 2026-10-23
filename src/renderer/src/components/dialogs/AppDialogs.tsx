import { useCallback, useEffect, useState } from 'react'
import { AboutDialog } from './AboutDialog'
import { HelpDialog } from './HelpDialog'
import { SettingsDialog } from './SettingsDialog'
import { UpdateBadge, UpdateDialog } from './UpdateDialog'
import { GearIcon, HelpIcon } from '../icons'
import { useUpdates } from '../../app/useUpdates'

type Open = 'settings' | 'about' | 'help' | 'shortcuts' | null

// Settings, About, Help and the updater: opened from the menu, F1 and the
// buttons at the end of the tab bar. Shared by every tab.
export function useAppDialogs(): { trailing: React.ReactNode; dialogs: React.ReactNode } {
  const [open, setOpen] = useState<Open>(null)
  const [version, setVersion] = useState('')
  const updates = useUpdates()
  const close = useCallback(() => setOpen(null), [])

  useEffect(() => {
    void window.api.appInfo().then((info) => setVersion(info.version))
  }, [])

  useEffect(() => {
    return window.api.onMenu((action) => {
      if (action === 'settings') setOpen('settings')
      else if (action === 'about') setOpen('about')
      else if (action === 'help') setOpen('help')
      else if (action === 'shortcuts') setOpen('shortcuts')
      else if (action === 'check-updates') {
        setOpen('about')
        void window.api.updateAction('check')
      }
    })
  }, [])

  // The update dialog takes over from About when a check finds something.
  useEffect(() => {
    if (updates.dialog) setOpen((o) => (o === 'about' ? null : o))
  }, [updates.dialog])

  const trailing = (
    <div className="tab-trailing">
      <UpdateBadge state={updates} />
      <button className="tab-add" title="Settings (Ctrl+,)" onClick={() => setOpen('settings')}>
        <GearIcon size={14} />
      </button>
      <button className="tab-add" title="Help (F1) and About" onClick={() => setOpen('about')}>
        <HelpIcon size={14} />
      </button>
    </div>
  )

  const dialogs = (
    <>
      {open === 'settings' && <SettingsDialog onClose={close} />}
      {open === 'about' && (
        <AboutDialog updates={updates} onClose={close} onHelp={() => setOpen('help')} />
      )}
      {(open === 'help' || open === 'shortcuts') && (
        <HelpDialog topic={open === 'help' ? 'guide' : 'shortcuts'} onClose={close} />
      )}
      <UpdateDialog state={updates} version={version} />
    </>
  )
  return { trailing, dialogs }
}
