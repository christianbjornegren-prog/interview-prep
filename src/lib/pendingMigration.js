/**
 * Överlämning av säljar-förberedda profiler till konsultens eget konto.
 * Ren modul: ingen React, ingen Firestore – fullt enhetstestbar.
 *
 * BAKGRUND: en säljare förbereder en konsult i pendingProfiles. När konsulten
 * loggar in ska kompetenser och uppdrag flyttas till users/{uid} och
 * pending-dokumentet raderas. Misslyckades något steg tidigare blev personen
 * kvar som BÅDE aktiv konsult OCH väntande, och den förberedda datan kom aldrig
 * fram. Två saker gjorde det möjligt:
 *
 *   1. Skrivning och radering var skilda operationer – en partiell körning
 *      lämnade pending-dokumentet kvar. Åtgärdat: raderingen ligger numera i
 *      SAMMA batch som skrivningarna (allt eller inget).
 *   2. Migreringen kördes bara vid FÖRSTA inloggningen och försökte aldrig
 *      igen. Åtgärdat: den körs vid varje inloggning och är ofarlig att köra
 *      om, eftersom en lyckad körning tar bort sitt eget underlag.
 */

/** Firestore tar max 500 operationer per batch. */
export const MAX_BATCH_OPERATIONS = 500

/**
 * Normaliserar en e-postadress för jämförelse.
 * Pending-dokument nycklas på gemener (SäljarePage lowercasear vid skapande),
 * men användardokument kan bära adressen som den skrevs.
 *
 * @param {unknown} email
 * @returns {string}
 */
export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

/**
 * Bygger listan över vad som ska skrivas över till konsultens eget träd.
 *
 * `createdAt` strippas eftersom mottagaren ska få en färsk servertidsstämpel,
 * och `id` strippas från uppdrag eftersom pending-uppdrag bär ett genererat
 * id-fält som inte hör hemma i ett Firestore-dokument med eget dokument-id.
 *
 * @param {object} pendingData – innehållet i pendingProfiles/{email}
 * @returns {{ competencies: object[], jobs: object[], total: number }}
 */
export function buildMigrationPlan(pendingData) {
  const data = pendingData && typeof pendingData === 'object' ? pendingData : {}
  const rawComps = Array.isArray(data.competencies) ? data.competencies : []
  const rawJobs = Array.isArray(data.jobs) ? data.jobs : []

  const competencies = rawComps
    .filter((c) => c && typeof c === 'object')
    .map(({ createdAt: _createdAt, ...rest }) => rest)

  const jobs = rawJobs
    .filter((j) => j && typeof j === 'object')
    .map(({ createdAt: _createdAt, id: _id, ...rest }) => rest)

  return { competencies, jobs, total: competencies.length + jobs.length }
}

/**
 * Får hela överlämningen plats i EN atomär batch?
 * Skrivningarna plus den avslutande raderingen av pending-dokumentet.
 *
 * @param {{ total: number }} plan
 * @returns {boolean}
 */
export function fitsInOneBatch(plan) {
  const total = typeof plan?.total === 'number' ? plan.total : 0
  return total + 1 <= MAX_BATCH_OPERATIONS
}

/**
 * Filtrerar bort förberedda profiler som INTE längre inväntar inloggning.
 *
 * Säljarvyn rubricerar listan "inväntar inloggning". Någon som redan har ett
 * konto inväntar inte inloggning – att visa hen där betyder att samma person
 * syns som både aktiv och väntande, vilket är ett tillstånd som inte ska kunna
 * uppstå. Jämförelsen sker på normaliserad e-post.
 *
 * @param {Array<{email?: string}>} pendingProfiles
 * @param {Array<{email?: string}>} activeUsers
 * @returns {Array} de profiler som faktiskt väntar på inloggning
 */
export function filterAwaitingLogin(pendingProfiles, activeUsers) {
  const pending = Array.isArray(pendingProfiles) ? pendingProfiles : []
  const active = Array.isArray(activeUsers) ? activeUsers : []

  const taken = new Set(
    active.map((u) => normalizeEmail(u?.email)).filter(Boolean)
  )

  return pending.filter((p) => {
    const email = normalizeEmail(p?.email)
    // Saknad e-post kan inte matchas mot ett konto – visa hellre för mycket
    // än att tyst dölja en profil säljaren skapat.
    if (!email) return true
    return !taken.has(email)
  })
}
