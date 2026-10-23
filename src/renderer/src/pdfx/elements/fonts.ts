import { StandardFonts } from 'pdf-lib'
import type { PDFDocument, PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { lookOf } from '../../elements/types'
import type { PageElement, TextElement, TextLook } from '../../elements/types'

// Text of annotations is written with the PDF standard fonts when they can
// spell it (no font in the file), and with the bundled DejaVu fonts when not
// (Cyrillic and most other scripts), one embedded subset per typeface.

const fontUrl = (file: string): string =>
  import.meta.env.VITE_PDFX_WEB
    ? new URL(`/pdf/${file}`, location.href).href
    : `pdfx-assets://pdf/${file}`

type Variant = 'sans' | 'sans-b' | 'serif' | 'serif-b' | 'mono' | 'mono-b'

const STANDARD: Record<Variant, StandardFonts> = {
  sans: StandardFonts.Helvetica,
  'sans-b': StandardFonts.HelveticaBold,
  serif: StandardFonts.TimesRoman,
  'serif-b': StandardFonts.TimesRomanBold,
  mono: StandardFonts.Courier,
  'mono-b': StandardFonts.CourierBold
}

const UNICODE: Record<Variant, string> = {
  sans: 'DejaVuSans.ttf',
  'sans-b': 'DejaVuSans-Bold.ttf',
  serif: 'DejaVuSerif.ttf',
  'serif-b': 'DejaVuSerif-Bold.ttf',
  mono: 'DejaVuSansMono.ttf',
  'mono-b': 'DejaVuSansMono.ttf'
}

const variantOf = (look: TextLook): Variant => `${look.font}${look.bold ? '-b' : ''}` as Variant

// Fonts embedded in one output document, by variant ("sans", "sans-b"...) and
// "<variant>-u" for the Unicode one.
export interface ElementFonts {
  fonts: Map<string, PDFFont>
}

// Text an annotation writes, with its typeface.
export interface TextRun {
  text: string
  look: TextLook
}

export const textRunsOf = (elements: PageElement[] | undefined): TextRun[] =>
  (elements ?? []).flatMap((e) => (e.kind === 'text' ? [{ text: e.text, look: lookOf(e) }] : []))

const fileBytes = new Map<string, Promise<ArrayBuffer>>()

function loadFontBytes(file: string): Promise<ArrayBuffer> {
  let bytes = fileBytes.get(file)
  if (!bytes) {
    bytes = fetch(fontUrl(file)).then((response) => {
      if (!response.ok) throw new Error(`Font fetch failed: ${response.status}`)
      return response.arrayBuffer()
    })
    fileBytes.set(file, bytes)
  }
  return bytes
}

const fontCovers = (font: PDFFont, text: string): boolean => {
  const charset = new Set(font.getCharacterSet())
  for (const ch of text) {
    if (ch !== '\n' && !charset.has(ch.codePointAt(0) as number)) return false
  }
  return true
}

export async function embedElementFonts(
  doc: PDFDocument,
  runs: TextRun[],
  cached: ElementFonts | null
): Promise<ElementFonts> {
  const fonts = cached ?? { fonts: new Map<string, PDFFont>() }
  for (const run of runs) {
    const variant = variantOf(run.look)
    let standard = fonts.fonts.get(variant)
    if (!standard) {
      standard = await doc.embedFont(STANDARD[variant])
      fonts.fonts.set(variant, standard)
    }
    if (!fontCovers(standard, run.text) && !fonts.fonts.has(`${variant}-u`)) {
      doc.registerFontkit(fontkit)
      const unicode = await doc.embedFont(await loadFontBytes(UNICODE[variant]), { subset: true })
      fonts.fonts.set(`${variant}-u`, unicode)
    }
  }
  return fonts
}

// The font for `text` in a typeface embedded by embedElementFonts.
export function fontFor(fonts: ElementFonts, text: string, look: TextLook): PDFFont {
  const variant = variantOf(look)
  const standard = fonts.fonts.get(variant)
  const unicode = fonts.fonts.get(`${variant}-u`)
  if (!standard) throw new Error(`font ${variant} was not embedded`)
  return unicode && !fontCovers(standard, text) ? unicode : standard
}

export const fontForElement = (element: TextElement, fonts: ElementFonts): PDFFont =>
  fontFor(fonts, element.text, lookOf(element))
