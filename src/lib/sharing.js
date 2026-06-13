// ── Delningslogik (samtycke) ──────────────────────────────────────────────
//
// Konsulten äger sin träning. En feedback-session delas med säljaren ENDAST
// om konsulten själv slår på det, och kan återkallas när som helst.
//
// Rena hjälpare här (ingen Firestore/IO) så de kan enhetstestas.

/** Normaliserar Firestore Timestamp | Date | null → Date | null. */
export function toDate(ts) {
  if (!ts) return null
  if (typeof ts.toDate === 'function') return ts.toDate()
  if (ts instanceof Date) return ts
  return null
}

/**
 * Beskriver delningsstatus för ett feedback-dokument.
 * Saknat fält behandlas som ej delat (false).
 *
 * @returns {{ shared: boolean, date: string|null, label: string }}
 */
export function describeShareStatus(feedback, locale = 'sv-SE') {
  const shared = feedback?.sharedWithSeller === true
  if (!shared) {
    return { shared: false, date: null, label: 'Privat – syns bara för dig' }
  }
  const d = toDate(feedback?.sharedAt)
  const date = d
    ? d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })
    : null
  return {
    shared: true,
    date,
    label: date
      ? `Delad med din säljare sedan ${date}`
      : 'Delad med din säljare',
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
