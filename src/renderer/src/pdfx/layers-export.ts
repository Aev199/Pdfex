import { PDFDict, PDFHexString, PDFName, PDFString } from 'pdf-lib'
import type { PDFDocument, PDFRef } from 'pdf-lib'

// Copied pages bring their layers (optional content groups) along, but not
// the catalog's list of them, so other viewers would show every layer and
// no Layers panel. This lists them again, the ones hidden in PDFx off.
export function writeLayers(output: PDFDocument, hidden: Set<string>): void {
  const groups: { ref: PDFRef; name: string }[] = []
  for (const [ref, object] of output.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict) || object.lookup(PDFName.of('Type')) !== PDFName.of('OCG')) {
      continue
    }
    const name = object.lookup(PDFName.of('Name'))
    groups.push({
      ref,
      name: name instanceof PDFString || name instanceof PDFHexString ? name.decodeText() : ''
    })
  }
  if (groups.length === 0) return
  const refs = groups.map((g) => g.ref)
  const off = groups.filter((g) => hidden.has(g.name)).map((g) => g.ref)
  output.catalog.set(
    PDFName.of('OCProperties'),
    output.context.obj({
      OCGs: refs,
      D: {
        Order: refs,
        ON: refs.filter((r) => !off.includes(r)),
        OFF: off
      }
    })
  )
}
