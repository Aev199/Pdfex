import { useState } from 'react'
import { Dialog } from '../dialogs/Dialog'
import { UNIT_LABELS, calibratedScale } from '../../elements/measures'
import type { MeasureScale, MeasureUnit } from '../../elements/types'

interface CalibrateDialogProps {
  // Length of the line drawn over the known dimension, in PDF points.
  lengthPoints: number
  unit: MeasureUnit
  onCancel: () => void
  onConfirm: (scale: MeasureScale) => void
}

export function CalibrateDialog({
  lengthPoints,
  unit: initialUnit,
  onCancel,
  onConfirm
}: CalibrateDialogProps): React.JSX.Element {
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState<MeasureUnit>(initialUnit)
  const real = Number(value.replace(',', '.'))
  const valid = Number.isFinite(real) && real > 0
  const confirm = (): void => {
    if (valid) onConfirm(calibratedScale(lengthPoints, real, unit))
  }
  return (
    <Dialog
      title="Calibrate the scale"
      onClose={onCancel}
      footer={
        <>
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" disabled={!valid} onClick={confirm}>
            Set scale
          </button>
        </>
      }
    >
      <p>How long is the dimension you drew, in reality?</p>
      <div className="settings-row">
        <input
          className="calibrate-input"
          autoFocus
          inputMode="decimal"
          placeholder="e.g. 6000"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirm()
          }}
        />
        <select value={unit} onChange={(e) => setUnit(e.target.value as MeasureUnit)}>
          {(Object.keys(UNIT_LABELS) as MeasureUnit[]).map((u) => (
            <option key={u} value={u}>
              {UNIT_LABELS[u]}
            </option>
          ))}
        </select>
      </div>
      <p className="settings-hint">
        New measurements on any page use this scale until you change it.
      </p>
    </Dialog>
  )
}
