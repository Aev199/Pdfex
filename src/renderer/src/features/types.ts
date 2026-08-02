import type { ReactNode } from 'react'

export interface HeaderAction {
  id: string
  label: string
  title?: string
  icon?: ReactNode
  onTrigger: () => void
}

export interface FeatureModule {
  id: string
  headerActions?: HeaderAction[]
}
