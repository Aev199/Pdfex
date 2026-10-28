import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ clipboard: {} }))

const { dropFiles, fileUrlPaths } = await import('./clipboard')

describe('clipboard file lists', () => {
  it('reads file URLs, one per line', () => {
    expect(
      fileUrlPaths('file:///tmp/a%20b.pdf\r\nfile:///tmp/c.pdf\n# comment\nhttps://x')
    ).toEqual(['/tmp/a b.pdf', '/tmp/c.pdf'])
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
