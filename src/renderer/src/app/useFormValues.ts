import { useCallback, useRef, useState } from 'react'
import type { FieldValue, FormValuesBySource } from '../forms/types'

export function useFormValues(initial: FormValuesBySource = {}) {
  const [values, setValues] = useState<FormValuesBySource>(initial)
  const valuesRef = useRef(values)
  valuesRef.current = values

  const setFieldValue = useCallback((sourceId: string, fieldName: string, value: FieldValue) => {
    const map = valuesRef.current
    const source = map[sourceId] ?? {}
    setValues({ ...map, [sourceId]: { ...source, [fieldName]: value } })
  }, [])

  return { values, valuesRef, setFieldValue }
}

export type FormState = ReturnType<typeof useFormValues>
