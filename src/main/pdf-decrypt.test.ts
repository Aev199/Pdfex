import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { decryptPdf, isEncryptedPdf, PdfPasswordError } from './pdf-decrypt'

// Made with pypdf (and pdf.js for the object-stream one) from a one-page PDF
// reading "Secret drawing 42"; owner password "owner-secret".
const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(join(__dirname, 'test-pdfs', `${name}.pdf`)))

async function pageText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise
  const content = await (await doc.getPage(1)).getTextContent()
  return content.items.map((item) => ('str' in item ? item.str : '')).join('')
}

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
    expect(await pageText(plain)).toContain('Secret drawing 42')
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
