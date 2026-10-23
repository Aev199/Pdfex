// Word, Excel and PowerPoint documents (and their OpenDocument cousins),
// converted to PDF by the Office or LibreOffice installed on this computer
// (see main/office.ts).

export class ConvertError extends Error {}

// Kept in step with EXT_APP in main/office.ts.
const OFFICE_EXT =
  /\.(docx?|docm|dotx?|dotm|odt|xlsx?|xlsm|xlsb|xltx?|xltm|ods|pptx?|pptm|ppsx?|potx?|odp)$/i

type OfficeKind = 'word' | 'excel' | 'powerpoint'

const kindOf = (ext: string): OfficeKind =>
  /^(do|odt)/.test(ext) ? 'word' : /^(pp|po|odp)/.test(ext) ? 'powerpoint' : 'excel'

const LABEL: Record<OfficeKind, string> = {
  word: 'Word',
  excel: 'Excel',
  powerpoint: 'PowerPoint'
}

export const isOfficeFile = (name: string): boolean => OFFICE_EXT.test(name)
export const stripOfficeExtension = (name: string): string => name.replace(OFFICE_EXT, '')

export async function officeToPdf(name: string, data: Uint8Array): Promise<Uint8Array> {
  const ext = (OFFICE_EXT.exec(name)?.[1] ?? '').toLowerCase()
  const kind = kindOf(ext)
  if (!(await window.api.officeConverter(kind))) {
    throw new ConvertError(
      `${name}: install Microsoft ${LABEL[kind]} or LibreOffice to open ${LABEL[kind]} documents`
    )
  }
  try {
    return await window.api.officeConvert(ext, data)
  } catch (error) {
    console.error('Office conversion failed', error)
    throw new ConvertError(`${name}: conversion to PDF failed`)
  }
}
