import { createCipheriv, createDecipheriv, createHash } from 'crypto'
import {
  PDFArray,
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObjectStreamParser,
  PDFParser,
  PDFRawStream,
  PDFRef,
  PDFString
} from 'pdf-lib'
import type { PDFContext, PDFObject } from 'pdf-lib'

// A copy of an encrypted PDF without its encryption, so pdf-lib can copy its
// pages on export (it cannot decrypt). Covers the standard security handler:
// RC4 40/128-bit (R2-R4), AES-128 (R4) and AES-256 (R5, R6). The password is
// the one the user typed to open the file ('' for files that open without
// one: those only restrict printing or editing in other programs).

export class PdfPasswordError extends Error {}

const PAD = Buffer.from('28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a', 'hex')

const md5 = (...parts: Buffer[]): Buffer => {
  const hash = createHash('md5')
  for (const p of parts) hash.update(p)
  return hash.digest()
}

function rc4(key: Buffer, data: Buffer): Buffer {
  const s = new Uint8Array(256)
  for (let i = 0; i < 256; i++) s[i] = i
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 255
    ;[s[i], s[j]] = [s[j], s[i]]
  }
  const out = Buffer.alloc(data.length)
  for (let n = 0, i = 0, j = 0; n < data.length; n++) {
    i = (i + 1) & 255
    j = (j + s[i]) & 255
    ;[s[i], s[j]] = [s[j], s[i]]
    out[n] = data[n] ^ s[(s[i] + s[j]) & 255]
  }
  return out
}

// AES-CBC with the IV in the first 16 bytes; padding removed when it is valid.
function aesDecrypt(key: Buffer, data: Buffer): Buffer {
  if (data.length < 32 || data.length % 16 !== 0) return Buffer.alloc(0)
  const decipher = createDecipheriv(`aes-${key.length * 8}-cbc`, key, data.subarray(0, 16))
  decipher.setAutoPadding(false)
  const out = Buffer.concat([decipher.update(data.subarray(16)), decipher.final()])
  const pad = out[out.length - 1]
  return pad >= 1 && pad <= 16 ? out.subarray(0, out.length - pad) : out
}

const aesNoIv = (key: Buffer, data: Buffer): Buffer => {
  const decipher = createDecipheriv('aes-256-cbc', key, Buffer.alloc(16))
  decipher.setAutoPadding(false)
  return Buffer.concat([decipher.update(data), decipher.final()])
}

// ISO 32000-2, algorithm 2.B (R6); plain SHA-256 for R5.
function hash6(password: Buffer, salt: Buffer, udata: Buffer, revision: number): Buffer {
  let k = createHash('sha256').update(password).update(salt).update(udata).digest()
  if (revision < 6) return k
  for (let round = 0; ; round++) {
    const k1 = Buffer.concat(Array(64).fill(Buffer.concat([password, k, udata])))
    const enc = encryptCbc(k.subarray(0, 16), k.subarray(16, 32), k1)
    let sum = 0
    for (let i = 0; i < 16; i++) sum += enc[i]
    const algo = ['sha256', 'sha384', 'sha512'][sum % 3]
    k = createHash(algo).update(enc).digest()
    if (round >= 63 && enc[enc.length - 1] <= round - 31) break
  }
  return k.subarray(0, 32)
}

function encryptCbc(key: Buffer, iv: Buffer, data: Buffer): Buffer {
  const cipher = createCipheriv('aes-128-cbc', key, iv)
  cipher.setAutoPadding(false)
  return Buffer.concat([cipher.update(data), cipher.final()])
}

const bytesOf = (o: PDFObject | undefined): Buffer =>
  o instanceof PDFString || o instanceof PDFHexString ? Buffer.from(o.asBytes()) : Buffer.alloc(0)

const numberOf = (o: PDFObject | undefined, fallback: number): number =>
  o instanceof PDFNumber ? o.asNumber() : fallback

interface Security {
  key: Buffer
  // Per object: 'rc4', 'aes' (with the object key) or AES-256 with the file key.
  method: 'rc4' | 'aes' | 'aes256' | 'none'
  strings: 'rc4' | 'aes' | 'aes256' | 'none'
  encryptMetadata: boolean
}

function cryptFilter(
  dict: PDFDict,
  name: PDFObject | undefined
): 'rc4' | 'aes' | 'aes256' | 'none' {
  if (!(name instanceof PDFName) || name.asString() === '/Identity') return 'none'
  const filters = dict.lookup(PDFName.of('CF'))
  const filter = filters instanceof PDFDict ? filters.lookup(name) : undefined
  const cfm = filter instanceof PDFDict ? filter.lookup(PDFName.of('CFM')) : undefined
  const method = cfm instanceof PDFName ? cfm.asString() : '/V2'
  return method === '/AESV2'
    ? 'aes'
    : method === '/AESV3'
      ? 'aes256'
      : method === '/None'
        ? 'none'
        : 'rc4'
}

function security(encrypt: PDFDict, id0: Buffer, password: string): Security {
  const filter = encrypt.lookup(PDFName.of('Filter'))
  if (!(filter instanceof PDFName) || filter.asString() !== '/Standard') {
    throw new Error('This PDF uses a security handler PDFx does not support')
  }
  const v = numberOf(encrypt.lookup(PDFName.of('V')), 0)
  const r = numberOf(encrypt.lookup(PDFName.of('R')), 2)
  const o = bytesOf(encrypt.lookup(PDFName.of('O')))
  const u = bytesOf(encrypt.lookup(PDFName.of('U')))
  const p = numberOf(encrypt.lookup(PDFName.of('P')), 0)
  const em = encrypt.lookup(PDFName.of('EncryptMetadata'))
  const encryptMetadata = !(em instanceof PDFBool) || em.asBoolean()

  if (r >= 5) {
    const pw = Buffer.from(password.normalize('NFKC'), 'utf8').subarray(0, 127)
    const oe = bytesOf(encrypt.lookup(PDFName.of('OE')))
    const ue = bytesOf(encrypt.lookup(PDFName.of('UE')))
    let key: Buffer | null = null
    if (hash6(pw, o.subarray(32, 40), u.subarray(0, 48), r).equals(o.subarray(0, 32))) {
      key = aesNoIv(hash6(pw, o.subarray(40, 48), u.subarray(0, 48), r), oe)
    } else if (hash6(pw, u.subarray(32, 40), Buffer.alloc(0), r).equals(u.subarray(0, 32))) {
      key = aesNoIv(hash6(pw, u.subarray(40, 48), Buffer.alloc(0), r), ue)
    }
    if (!key) throw new PdfPasswordError('Wrong password')
    const stm = cryptFilter(encrypt, encrypt.lookup(PDFName.of('StmF')))
    const str = cryptFilter(encrypt, encrypt.lookup(PDFName.of('StrF')))
    return { key, method: stm, strings: str, encryptMetadata }
  }

  const length = r === 2 ? 5 : numberOf(encrypt.lookup(PDFName.of('Length')), 40) / 8
  const padded = (pw: Buffer): Buffer => Buffer.concat([pw, PAD]).subarray(0, 32)
  const fileKey = (userPw: Buffer): Buffer => {
    const pBytes = Buffer.alloc(4)
    pBytes.writeInt32LE(p | 0)
    const parts = [padded(userPw), o, pBytes, id0]
    if (r >= 4 && !encryptMetadata) parts.push(Buffer.from([255, 255, 255, 255]))
    let key = md5(...parts)
    if (r >= 3) for (let i = 0; i < 50; i++) key = md5(key.subarray(0, length))
    return key.subarray(0, length)
  }
  const userOk = (key: Buffer): boolean => {
    if (r === 2) return rc4(key, PAD).equals(u.subarray(0, 32))
    let x = rc4(key, md5(PAD, id0))
    for (let i = 1; i <= 19; i++) x = rc4(Buffer.from(key.map((b) => b ^ i)), x)
    return x.subarray(0, 16).equals(u.subarray(0, 16))
  }
  const pw = Buffer.from(password, 'latin1')
  let key = fileKey(pw)
  if (!userOk(key)) {
    // Maybe the owner password: it unlocks the user password stored in O.
    let ownerKey = md5(padded(pw))
    if (r >= 3) for (let i = 0; i < 50; i++) ownerKey = md5(ownerKey)
    ownerKey = ownerKey.subarray(0, length)
    let userPw: Buffer
    if (r === 2) userPw = rc4(ownerKey, o)
    else {
      userPw = o
      for (let i = 19; i >= 0; i--) userPw = rc4(Buffer.from(ownerKey.map((b) => b ^ i)), userPw)
    }
    key = fileKey(userPw)
    if (!userOk(key)) throw new PdfPasswordError('Wrong password')
  }
  if (v >= 4) {
    const stm = cryptFilter(encrypt, encrypt.lookup(PDFName.of('StmF')))
    const str = cryptFilter(encrypt, encrypt.lookup(PDFName.of('StrF')))
    return { key, method: stm, strings: str, encryptMetadata }
  }
  return { key, method: 'rc4', strings: 'rc4', encryptMetadata }
}

function objectKey(sec: Security, ref: PDFRef, aes: boolean): Buffer {
  const extra = Buffer.alloc(5)
  extra.writeUIntLE(ref.objectNumber, 0, 3)
  extra.writeUIntLE(ref.generationNumber, 3, 2)
  const salt = aes ? Buffer.from('sAlT') : Buffer.alloc(0)
  return md5(sec.key, extra, salt).subarray(0, Math.min(sec.key.length + 5, 16))
}

function decryptWith(sec: Security, method: Security['method'], ref: PDFRef, data: Buffer): Buffer {
  if (method === 'none') return data
  if (method === 'aes256') return aesDecrypt(sec.key, data)
  if (method === 'aes') return aesDecrypt(objectKey(sec, ref, true), data)
  return rc4(objectKey(sec, ref, false), data)
}

// Strings anywhere inside `object` (dictionaries and arrays, not streams'
// data), decrypted in place.
function decryptStrings(sec: Security, ref: PDFRef, object: PDFObject): PDFObject {
  if (object instanceof PDFString || object instanceof PDFHexString) {
    const plain = decryptWith(sec, sec.strings, ref, Buffer.from(object.asBytes()))
    return PDFHexString.of(plain.toString('hex'))
  }
  if (object instanceof PDFDict) {
    for (const [key, value] of object.entries()) object.set(key, decryptStrings(sec, ref, value))
    return object
  }
  if (object instanceof PDFArray) {
    for (let i = 0; i < object.size(); i++) object.set(i, decryptStrings(sec, ref, object.get(i)))
    return object
  }
  return object
}

const typeOf = (dict: PDFDict): string | undefined => {
  const type = dict.lookup(PDFName.of('Type'))
  return type instanceof PDFName ? type.asString() : undefined
}

// The stream's own /Crypt filter, if it names one (Identity: left as is).
const streamMethod = (sec: Security, dict: PDFDict): Security['method'] => {
  const filters = dict.lookup(PDFName.of('Filter'))
  const first = filters instanceof PDFArray ? filters.get(0) : filters
  if (first instanceof PDFName && first.asString() === '/Crypt') return 'none'
  if (!sec.encryptMetadata && typeOf(dict) === '/Metadata') return 'none'
  return sec.method
}

function decryptStreamContents(sec: Security, ref: PDFRef, stream: PDFRawStream): void {
  const method = streamMethod(sec, stream.dict)
  const plain = decryptWith(sec, method, ref, Buffer.from(stream.contents))
  ;(stream as unknown as { contents: Uint8Array }).contents = new Uint8Array(plain)
  stream.dict.set(PDFName.of('Length'), PDFNumber.of(plain.length))
}

// Reads the file with pdf-lib, decrypting object streams as they are opened
// (`sec` null: only to find the trailer).
async function parse(
  bytes: Uint8Array,
  sec: Security | null
): Promise<{ context: PDFContext; fromStreams: Set<string> }> {
  const parser = PDFParser.forBytesWithOptions(bytes, Infinity, false, false)
  const context = (parser as unknown as { context: PDFContext }).context
  const fromStreams = new Set<string>()
  const self = parser as unknown as {
    parseIndirectObjectHeader: () => PDFRef
    parseIndirectObject: () => Promise<PDFRef>
  }
  let current: PDFRef | null = null
  const header = self.parseIndirectObjectHeader.bind(parser)
  self.parseIndirectObjectHeader = () => (current = header())
  const indirect = self.parseIndirectObject.bind(parser)
  self.parseIndirectObject = async () => {
    const ref = await indirect()
    // Assigned at the top level: encrypted on its own.
    if (context.lookup(ref) !== undefined) fromStreams.delete(ref.tag)
    return ref
  }
  const forStream = PDFObjectStreamParser.forStream
  ;(PDFObjectStreamParser as unknown as { forStream: unknown }).forStream = (
    raw: PDFRawStream,
    ...rest: unknown[]
  ) => {
    if (!sec || !current) {
      // First pass: object streams can't be read yet.
      return { parseIntoContext: async () => undefined }
    }
    decryptStreamContents(sec, current, raw)
    const inner = (forStream as (...a: unknown[]) => { parseIntoContext: () => Promise<void> })(
      raw,
      ...rest
    )
    return {
      parseIntoContext: async () => {
        const assign = context.assign.bind(context)
        context.assign = (ref, object) => {
          fromStreams.add(ref.tag)
          assign(ref, object)
        }
        try {
          await inner.parseIntoContext()
        } finally {
          context.assign = assign
        }
      }
    }
  }
  try {
    await parser.parseDocument()
  } finally {
    ;(PDFObjectStreamParser as unknown as { forStream: unknown }).forStream = forStream
  }
  return { context, fromStreams }
}

export async function isEncryptedPdf(bytes: Uint8Array): Promise<boolean> {
  const { context } = await parse(bytes, null)
  return context.lookup(context.trailerInfo.Encrypt) instanceof PDFDict
}

export async function decryptPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const first = await parse(bytes, null)
  const encrypt = first.context.lookup(first.context.trailerInfo.Encrypt)
  if (!(encrypt instanceof PDFDict)) return bytes
  const ids = first.context.lookup(first.context.trailerInfo.ID)
  const id0 = ids instanceof PDFArray ? bytesOf(ids.get(0)) : Buffer.alloc(0)
  const sec = security(encrypt, id0, password)

  const { context, fromStreams } = await parse(bytes, sec)
  const encryptRef = context.trailerInfo.Encrypt
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (fromStreams.has(ref.tag)) continue
    if (encryptRef instanceof PDFRef && ref.tag === encryptRef.tag) continue
    if (object instanceof PDFRawStream) {
      const type = typeOf(object.dict)
      if (type === '/XRef') continue
      decryptStrings(sec, ref, object.dict)
      decryptStreamContents(sec, ref, object)
    } else {
      decryptStrings(sec, ref, object)
    }
  }
  if (encryptRef instanceof PDFRef) context.delete(encryptRef)
  context.trailerInfo.Encrypt = undefined
  const doc = new (PDFDocument as unknown as new (
    c: PDFContext,
    ignoreEncryption: boolean,
    updateMetadata: boolean
  ) => PDFDocument)(context, true, false)
  return doc.save({ useObjectStreams: false })
}
