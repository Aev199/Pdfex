import { describe, expect, it } from 'vitest'
import { countOccurrences, normalizeText } from './normalize'

describe('normalizeText', () => {
  it('folds case and whitespace in Cyrillic text', () => {
    expect(normalizeText('  Отчёт   ИГИ\n\tСкважина ')).toBe('отчет иги скважина')
  })

  it('treats ё and е as the same letter', () => {
    const haystack = normalizeText('Расчётное сопротивление грунта')
    expect(countOccurrences(haystack, normalizeText('расчетное'))).toBe(1)
    expect(countOccurrences(haystack, normalizeText('РАСЧЁТНОЕ'))).toBe(1)
  })
})
