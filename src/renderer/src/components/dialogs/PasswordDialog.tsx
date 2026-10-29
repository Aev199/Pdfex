import { useEffect, useState } from 'react'
import { Dialog } from './Dialog'
import { usePasswordRequest } from '../../app/password-prompt'

export function PasswordDialog(): React.JSX.Element | null {
  const request = usePasswordRequest()
  const [password, setPassword] = useState('')
  useEffect(() => setPassword(''), [request])
  if (!request) return null
  return (
    <Dialog
      title="Password required"
      className="password-dialog"
      onClose={() => request.answer(null)}
      footer={
        <>
          <button className="btn" onClick={() => request.answer(null)}>
            Cancel
          </button>
          <button className="btn yellow" onClick={() => request.answer(password)}>
            Open
          </button>
        </>
      }
    >
      <p>
        <b>{request.name}</b> is protected. Enter its password to open it.
      </p>
      <input
        className="password-input"
        type="password"
        autoFocus
        value={password}
        aria-label="Password"
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') request.answer(password)
        }}
      />
      {request.retry && <p className="password-error">Wrong password, try again.</p>}
      <p className="settings-hint">
        The password is kept only while PDFx is open; exported copies are not protected.
      </p>
    </Dialog>
  )
}
