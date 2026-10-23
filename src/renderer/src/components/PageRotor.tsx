import type { PageEntry } from '../types'

// A page turned with Rotate keeps drawing in its own orientation: its
// content (raster, marks, elements, form fields) is laid out at the
// unrotated size and the whole box is turned, so overlays stay aligned
// without each one knowing about rotation.

export const naturalSize = (page: PageEntry): { width: number; height: number } =>
  page.rotation === 90 || page.rotation === 270
    ? { width: page.height, height: page.width }
    : { width: page.width, height: page.height }

export function PageRotor({
  rotation,
  children
}: {
  rotation: number | undefined
  children: React.ReactNode
}): React.JSX.Element {
  if (!rotation) return <>{children}</>
  const sideways = rotation === 90 || rotation === 270
  return (
    <div
      className="page-rotor"
      data-rotation={rotation}
      style={{
        // The parent has the turned (displayed) size; this box takes the
        // unturned one, centred, then rotates into place.
        width: sideways ? 'var(--rotor-h)' : '100%',
        height: sideways ? 'var(--rotor-w)' : '100%',
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`
      }}
    >
      {children}
    </div>
  )
}
