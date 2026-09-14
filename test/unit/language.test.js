import { describe, it, expect } from 'vitest'
import {
  LANGUAGES,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  LANGUAGE_LABEL,
  normalizeLanguage,
  isEnglish,
} from '../../src/lib/language.js'

describe('normalizeLanguage – giltiga värden', () => {
  it('sv passerar',            () => expect(normalizeLanguage('sv')).toBe('sv'))
  it('en passerar',            () => expect(normalizeLanguage('en')).toBe('en'))
  it('versaler normaliseras',  () => expect(normalizeLanguage('EN')).toBe('en'))
  it('blandade versaler',      () => expect(normalizeLanguage('Sv')).toBe('sv'))
  it('regionkod sv-SE',        () => expect(normalizeLanguage('sv-SE')).toBe('sv'))
  it('regionkod en-GB',        () => expect(normalizeLanguage('en-GB')).toBe('en'))
  it('blanksteg trimmas',      () => expect(normalizeLanguage('  en  ')).toBe('en'))
})

describe('normalizeLanguage – faller ALLTID tillbaka på svenska', () => {
  // Ett trasigt språkvärde får aldrig kunna välta intervjun.
  const junk = [null, undefined, '', '   ', 42, 0, {}, [], true, false, NaN]
  junk.forEach((value) => {
    it(`${String(value)} → sv`, () => expect(normalizeLanguage(value)).toBe('sv'))
  })

  it('okänt språk → sv',       () => expect(normalizeLanguage('de')).toBe('sv'))
  it('okänd regionkod → sv',   () => expect(normalizeLanguage('fr-FR')).toBe('sv'))
  it('enstaka tecken → sv',    () => expect(normalizeLanguage('e')).toBe('sv'))
})

describe('isEnglish', () => {
  it('true för en',            () => expect(isEnglish('en')).toBe(true))
  it('true för en-GB',         () => expect(isEnglish('en-GB')).toBe(true))
  it('false för sv',           () => expect(isEnglish('sv')).toBe(false))
  it('false för saknat värde', () => expect(isEnglish(undefined)).toBe(false))
  it('false för skräp',        () => expect(isEnglish('klingon')).toBe(false))
})

describe('konstanter', () => {
  it('svenska är default',     () => expect(DEFAULT_LANGUAGE).toBe(LANGUAGES.SV))
  it('två språk stöds',        () => expect(SUPPORTED_LANGUAGES).toEqual(['sv', 'en']))

  it('varje stött språk har en etikett', () => {
    SUPPORTED_LANGUAGES.forEach((lang) => {
      expect(typeof LANGUAGE_LABEL[lang]).toBe('string')
      expect(LANGUAGE_LABEL[lang].length).toBeGreaterThan(0)
    })
  })

  it('normalizeLanguage returnerar alltid ett stött språk', () => {
    const inputs = ['sv', 'en', 'de', null, 99, 'EN', 'sv-FI', {}]
    inputs.forEach((v) => {
      expect(SUPPORTED_LANGUAGES).toContain(normalizeLanguage(v))
    })
  })
})
