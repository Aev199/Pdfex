import type { FeatureModule, HeaderAction } from './types'

const modules: FeatureModule[] = []

export function registerFeatureModules(next: FeatureModule[]): void {
  modules.push(...next)
}

export function registeredHeaderActions(): HeaderAction[] {
  return modules.flatMap((module) => module.headerActions ?? [])
}
