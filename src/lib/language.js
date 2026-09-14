/**
 * Intervjuspråk – enda sanningskällan.
 * Ren modul: ingen React, ingen Firebase, inga sidoeffekter.
 *
 * VIKTIGT: språket styr PROSA och TAL. Det styr ALDRIG datavärden.
 * Enum-värdena (match, importance, strength, category, CATEGORY_ENUM) är
 * nycklar som koden fattar beslut på och förblir svenska oavsett språkval.
 */

export const LANGUAGES = {
  SV: 'sv',
  EN: 'en',
}

export const DEFAULT_LANGUAGE = LANGUAGES.SV

export const SUPPORTED_LANGUAGES = [LANGUAGES.SV, LANGUAGES.EN]

/** Etiketter för språkväljaren i UI:t. */
export const LANGUAGE_LABEL = {
  [LANGUAGES.SV]: 'Svenska',
  [LANGUAGES.EN]: 'English',
}

/**
 * Normaliserar ett godtyckligt språkvärde till 'sv' eller 'en'.
 * Allt okänt, saknat eller trasigt faller tillbaka på svenska – appens
 * standardläge ska aldrig kunna gå sönder av ett dåligt språkvärde.
 *
 * Tål regionkoder ('sv-SE', 'en-GB'), versaler och omgivande blanksteg.
 *
 * @param {unknown} value
 * @returns {'sv'|'en'}
 */
export function normalizeLanguage(value) {
  if (typeof value !== 'string') return DEFAULT_LANGUAGE
  const base = value.trim().toLowerCase().slice(0, 2)
  return SUPPORTED_LANGUAGES.includes(base) ? base : DEFAULT_LANGUAGE
}

/**
 * @param {unknown} language
 * @returns {boolean} true om intervjun ska hållas på engelska
 */
export function isEnglish(language) {
  return normalizeLanguage(language) === LANGUAGES.EN
}
