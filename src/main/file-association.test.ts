import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, shell: {} }))
vi.mock('./settings', () => ({}))

const { openCommand, registrationFile, removalFile } = await import('./file-association')

describe('Windows file association', () => {
  it('writes the open command for the current user, escaped for .reg', () => {
    const exe = 'D:\\Программы\\PDFx\\pdfx.exe'
    const reg = registrationFile(exe, openCommand(exe, null))
    expect(reg.startsWith('Windows Registry Editor Version 5.00')).toBe(true)
    expect(reg).not.toMatch(/HKEY_LOCAL_MACHINE/)
    expect(reg).toContain(
      '[HKEY_CURRENT_USER\\Software\\Classes\\PDFx.Document\\shell\\open\\command]\r\n@="\\"D:\\\\Программы\\\\PDFx\\\\pdfx.exe\\" \\"%1\\""'
    )
    expect(reg).toContain('"PDFx.Document"=""')
    expect(openCommand('C:\\e\\electron.exe', 'C:\\src')).toBe(
      '"C:\\e\\electron.exe" "C:\\src" "%1"'
    )
  })

  it('removes every key it writes', () => {
    const removal = removalFile()
    for (const key of ['PDFx.Document', 'PDFx.Session', 'Applications\\pdfx.exe', 'shell\\PDFx']) {
      expect(removal).toContain(
        `[-HKEY_CURRENT_USER\\Software\\Classes\\${key.startsWith('shell') ? 'SystemFileAssociations\\.pdf\\' + key : key}]`
      )
    }
    expect(removal).toContain('"PDFx.Document"=-')
    expect(removal).toContain('"PDFx"=-')
  })
})
