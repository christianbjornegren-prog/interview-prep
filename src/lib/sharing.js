// ── Delningslogik (samtycke) ──────────────────────────────────────────────
//
// Konsulten äger sin träning. En feedback-session delas med säljaren ENDAST
// om konsulten själv slår på det, och kan återkallas när som helst.
//
// Rena hjälpare här (ingen Firestore/IO) så de kan enhetstestas.

import { LANGUAGES, normalizeLanguage } from './language.js'

/** Normaliserar Firestore Timestamp | Date | null → Date | null. */
export function toDate(ts) {
  if (!ts) return null
  if (typeof ts.toDate === 'function') return ts.toDate()
  if (ts instanceof Date) return ts
  return null
}

const SHARE_LABELS = {
  [LANGUAGES.SV]: {
    locale:      'sv-SE',
    private:     'Privat – syns bara för dig',
    sharedSince: (date) => `Delad med din säljare sedan ${date}`,
    shared:      'Delad med din säljare',
  },
  [LANGUAGES.EN]: {
    locale:      'en-GB',
    private:     'Private – only visible to you',
    sharedSince: (date) => `Shared with your salesperson since ${date}`,
    shared:      'Shared with your salesperson',
  },
}

/**
 * Beskriver delningsstatus för ett feedback-dokument.
 * Saknat fält behandlas som ej delat (false).
 *
 * Språket följer sessionens språk – en engelsk session presenteras på engelska,
 * hela vägen. Utan argument (och för allt okänt) blir det svenska, så varje
 * befintligt anrop beter sig exakt som förut.
 *
 * @param {object} feedback
 * @param {unknown} [language] – 'sv' | 'en'
 * @returns {{ shared: boolean, date: string|null, label: string }}
 */
export function describeShareStatus(feedback, language) {
  const t = SHARE_LABELS[normalizeLanguage(language)]
  const shared = feedback?.sharedWithSeller === true
  if (!shared) {
    return { shared: false, date: null, label: t.private }
  }
  const d = toDate(feedback?.sharedAt)
  const date = d
    ? d.toLocaleDateString(t.locale, { year: 'numeric', month: 'long', day: 'numeric' })
    : null
  return {
    shared: true,
    date,
    label: date ? t.sharedSince(date) : t.shared,
  }
}

/**
 * Bygger fältuppdateringen för att slå på/av delning.
 * sharedAt sätts av anroparen med serverTimestamp() när on === true,
 * därför returnerar vi en markör (sharedAt: null) som anroparen ersätter.
 *
 * Hålls ren (ingen serverTimestamp) för enhetstest – se FeedbackPage för
 * den faktiska skrivningen.
 */
export function buildShareUpdate(on) {
  return on
    ? { sharedWithSeller: true }   // sharedAt: serverTimestamp() läggs till av anroparen
    : { sharedWithSeller: false, sharedAt: null }
}
