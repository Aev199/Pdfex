import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { decryptPdf, isEncryptedPdf, PdfPasswordError } from './pdf-decrypt'

// Made with pypdf (and pdf.js for the object-stream one) from a one-page PDF
// reading "Secret drawing 42"; owner password "owner-secret".
const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(join(__dirname, 'test-pdfs', `${name}.pdf`)))

// The first page's drawing instructions, decompressed: the text is written
// with a standard font, so it shows as hex glyph codes or a literal string.
function pageContent(doc: PDFDocument): string {
  const contents = doc.getPage(0).node.Contents()
  const streams = contents instanceof PDFArray ? contents.asArray() : [contents]
  return streams
    .map((ref) => doc.context.lookup(ref))
    .filter((s): s is PDFRawStream => s instanceof PDFRawStream)
    .map((s) => Buffer.from(decodePDFRawStream(s).decode()).toString('latin1'))
    .join('\n')
}

const hasText = (content: string, text: string): boolean =>
  content.includes(`(${text})`) ||
  content.toUpperCase().includes(`<${Buffer.from(text, 'latin1').toString('hex').toUpperCase()}>`)

describe('PDF decryption', () => {
  it.each([
    ['rc4-40', ''],
    ['rc4-128', ''],
    ['aes-128', ''],
    ['aes-128-objstm', ''],
    ['aes-256', ''],
    ['rc4-128-user', '1234'],
    ['aes-256-user', '1234'],
    ['rc4-128-user', 'owner-secret'],
    ['aes-256-user', 'owner-secret']
  ])('%s opens with "%s" and loses its encryption', async (name, password) => {
    const bytes = fixture(name)
    expect(await isEncryptedPdf(bytes)).toBe(true)
    const plain = await decryptPdf(bytes, password)
    expect(await isEncryptedPdf(plain)).toBe(false)
    // pdf-lib reads it as an ordinary PDF: strings are decrypted too.
    const doc = await PDFDocument.load(plain)
    expect(doc.getPageCount()).toBe(1)
    expect(doc.getTitle()).toBe('Plain title')
    expect(hasText(pageContent(doc), 'Secret drawing 42')).toBe(true)
  })

  it('refuses a wrong password and leaves plain files alone', async () => {
    await expect(decryptPdf(fixture('aes-256-user'), 'nope')).rejects.toBeInstanceOf(
      PdfPasswordError
    )
    await expect(decryptPdf(fixture('rc4-128-user'), '')).rejects.toBeInstanceOf(PdfPasswordError)
    const plain = await decryptPdf(fixture('rc4-40'), '')
    expect(await decryptPdf(plain, '')).toBe(plain)
  })
})
