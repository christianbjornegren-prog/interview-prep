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

import { convertLegacyPendingCompetencies } from './cvs'

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
 * CV:n flyttas med SITT id (blir dokument-id i users/{uid}/cvs) – uppdragens
 * `cvId` pekar på det id:t, och kopplingen uppdrag→CV måste överleva
 * överlämningen. Äldre profiler med en samlad `competencies`-array görs om
 * till CV:n (grupperat på källfil) på vägen, så ingen data tappas.
 *
 * CV:ns `createdAt` (konkret Timestamp) behålls – det är uppladdningstiden.
 * Uppdragens `createdAt` strippas eftersom mottagaren ska få en färsk
 * servertidsstämpel, och `id` strippas från uppdrag eftersom pending-uppdrag bär ett genererat
 * id-fält som inte hör hemma i ett Firestore-dokument med eget dokument-id.
 *
 * @param {object} pendingData – innehållet i pendingProfiles/{email}
 * @returns {{ cvs: Array<{id: string, data: object}>, jobs: object[], total: number }}
 */
export function buildMigrationPlan(pendingData) {
  const data = pendingData && typeof pendingData === 'object' ? pendingData : {}
  const rawJobs = Array.isArray(data.jobs) ? data.jobs : []

  const { cvs: allCvs } = convertLegacyPendingCompetencies({
    cvs: (Array.isArray(data.cvs) ? data.cvs : []).filter((cv) => cv && typeof cv === 'object'),
    competencies: Array.isArray(data.competencies) ? data.competencies : [],
    competenciesMigrated: data.competenciesMigrated,
  })

  const cvs = allCvs
    .filter((cv) => typeof cv.id === 'string' && cv.id)
    .map(({ id, ...rest }) => ({ id, data: rest }))

  const jobs = rawJobs
    .filter((j) => j && typeof j === 'object')
    .map(({ createdAt: _createdAt, id: _id, ...rest }) => rest)

  return { cvs, jobs, total: cvs.length + jobs.length }
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
