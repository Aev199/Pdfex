import { resolve } from 'path'
import { pathToFileURL } from 'url'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ clipboard: {} }))

const { dropFiles, fileUrlPaths } = await import('./clipboard')

describe('clipboard file lists', () => {
  it('reads file URLs, one per line', () => {
    const a = resolve('a b.pdf')
    const c = resolve('Отчёт.pdf')
    const list = `${pathToFileURL(a).href}\r\n${pathToFileURL(c).href}\n# comment\nhttps://x`
    expect(fileUrlPaths(list)).toEqual([a, c])
  })

  it("reads Explorer's DROPFILES list", () => {
    const names = 'C:\\Docs\\Отчёт.pdf\0D:\\b.pdf\0\0'
    const header = Buffer.alloc(20)
    header.writeUInt32LE(20, 0)
    header.writeUInt32LE(1, 16)
    expect(dropFiles(Buffer.concat([header, Buffer.from(names, 'ucs2')]))).toEqual([
      'C:\\Docs\\Отчёт.pdf',
      'D:\\b.pdf'
    ])
    expect(dropFiles(Buffer.alloc(4))).toEqual([])
  })
})
