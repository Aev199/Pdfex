import { useSyncExternalStore } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'

// Layers (optional content groups) of a PDF, as CAD programs export them:
// shown or hidden for the whole document, on every view of its pages (the
// reader, the canvas, comparing) and kept in exports, where the hidden ones
// stay in the file but start switched off.

type Config = Awaited<ReturnType<PDFDocumentProxy['getOptionalContentConfig']>>

export interface Layer {
  id: string
  name: string
  visible: boolean
}

const configs = new WeakMap<PDFDocumentProxy, Promise<Config>>()
const versions = new WeakMap<PDFDocumentProxy, number>()
const listeners = new Set<() => void>()

// The configuration every render of this document uses.
export function layerConfig(pdf: PDFDocumentProxy): Promise<Config> {
  let config = configs.get(pdf)
  if (!config) {
    config = pdf.getOptionalContentConfig()
    configs.set(pdf, config)
  }
  return config
}

export async function listLayers(pdf: PDFDocumentProxy): Promise<Layer[]> {
  const config = await layerConfig(pdf).catch(() => null)
  if (!config) return []
  const layers: Layer[] = []
  for (const [id, group] of config) {
    layers.push({ id: String(id), name: String(group.name ?? id), visible: !!group.visible })
  }
  return layers
}

export async function setLayersVisible(
  pdf: PDFDocumentProxy,
  ids: string[],
  visible: boolean
): Promise<void> {
  const config = await layerConfig(pdf)
  for (const id of ids) config.setVisibility(id, visible)
  versions.set(pdf, (versions.get(pdf) ?? 0) + 1)
  for (const listener of listeners) listener()
}

export async function hiddenLayerNames(pdf: PDFDocumentProxy): Promise<string[]> {
  if (!versions.get(pdf)) return []
  return (await listLayers(pdf)).filter((l) => !l.visible).map((l) => l.name)
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Changes when the document's layers are switched, so its pages redraw.
export const useLayerVersion = (pdf: PDFDocumentProxy): number =>
  useSyncExternalStore(subscribe, () => versions.get(pdf) ?? 0)
