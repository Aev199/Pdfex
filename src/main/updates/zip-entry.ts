import { open } from 'fs/promises'
import { inflateRawSync } from 'zlib'

// Reads one small file out of a ZIP on disk through its central directory,
// without loading the archive (the portable ZIP is ~150 MB). Used to learn
// the version of a ZIP the browser downloaded.

const MAX_ENTRY = 1024 * 1024
const EOCD = 0x06054b50
const ZIP64_LOCATOR = 0x07064b50
const ZIP64_EOCD = 0x06064b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50

export async function readZipEntry(path: string, name: string): Promise<Buffer | null> {
  const file = await open(path, 'r')
  try {
    const { size } = await file.stat()
    const read = async (position: number, length: number): Promise<Buffer> => {
      const buffer = Buffer.alloc(length)
      const { bytesRead } = await file.read(buffer, 0, length, position)
      return buffer.subarray(0, bytesRead)
    }
    const tailLength = Math.min(size, 22 + 0xffff + 20)
    const tail = await read(size - tailLength, tailLength)
    let at = -1
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === EOCD) {
        at = i
        break
      }
    }
    if (at === -1) return null
    let cdSize = tail.readUInt32LE(at + 12)
    let cdOffset = tail.readUInt32LE(at + 16)
    if ((cdOffset === 0xffffffff || cdSize === 0xffffffff) && at >= 20) {
      if (tail.readUInt32LE(at - 20) !== ZIP64_LOCATOR) return null
      const record = await read(Number(tail.readBigUInt64LE(at - 12)), 56)
      if (record.length < 56 || record.readUInt32LE(0) !== ZIP64_EOCD) return null
      cdSize = Number(record.readBigUInt64LE(40))
      cdOffset = Number(record.readBigUInt64LE(48))
    }
    if (cdSize > 16 * 1024 * 1024 || cdOffset + cdSize > size) return null
    const cd = await read(cdOffset, cdSize)
    for (let p = 0; p + 46 <= cd.length && cd.readUInt32LE(p) === CENTRAL; ) {
      const method = cd.readUInt16LE(p + 10)
      const compressed = cd.readUInt32LE(p + 20)
      const nameLength = cd.readUInt16LE(p + 28)
      const extraLength = cd.readUInt16LE(p + 30)
      const commentLength = cd.readUInt16LE(p + 32)
      const localOffset = cd.readUInt32LE(p + 42)
      const entryName = cd.toString('utf8', p + 46, p + 46 + nameLength)
      p += 46 + nameLength + extraLength + commentLength
      if (entryName !== name) continue
      if (compressed > MAX_ENTRY || (method !== 0 && method !== 8)) return null
      const local = await read(localOffset, 30)
      if (local.length < 30 || local.readUInt32LE(0) !== LOCAL) return null
      const start = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28)
      const data = await read(start, compressed)
      return method === 0 ? data : inflateRawSync(data, { maxOutputLength: MAX_ENTRY })
    }
    return null
  } finally {
    await file.close()
  }
}
