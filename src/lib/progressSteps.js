/**
 * Stegvisning för långa bakgrundsjobb (CV-tolkning, uppdragsanalys).
 * Ren modul – enhetstestad i progressSteps.test.js.
 *
 * PROBLEMET: ett Claude-anrop tar 20–60 s och ger ingen löpande status.
 * Tidigare hoppade stegvisaren direkt till ett steg och stod still där hela
 * väntan – det såg ut som att appen hängt sig.
 *
 * LÖSNINGEN: flödet består av riktiga FASER (cv → cv-save → job → save) som
 * koden rapporterar när de faktiskt startar. Inom en fas avancerar
 * understegen på TID (afterMs), så användaren ser vad som pågår. Ett
 * tidsstyrt understeg kan aldrig springa förbi sin fas – nästa fas börjar
 * först när koden säger det. Värsta fallet är alltså att sista understeget i
 * en fas står kvar en stund, aldrig att visningen ligger före verkligheten.
 *
 * KALIBRERAT mot riktiga Claude-anrop (test/integration, 2026-11-06):
 * CV-tolkning ≈ 20 s, uppdragsanalys ≈ 45 s, sparning < 1 s.
 */

/** Steg för att tolka och spara ett CV. */
export const CV_UPLOAD_STEPS = [
  { phase: 'cv', afterMs: 0, label: 'Läser CV:t', subtext: 'Öppnar dokumentet...' },
  { phase: 'cv', afterMs: 4000, label: 'Plockar ut kompetenser', subtext: 'Går igenom erfarenheter, roller och kompetenser...' },
  { phase: 'cv', afterMs: 14000, label: 'Kategoriserar kompetenserna', subtext: 'Nästan klart med CV:t...' },
  { phase: 'cv-save', afterMs: 0, label: 'Sparar CV:t', subtext: 'Sparar CV:t och dess kompetenser...' },
]

/**
 * Steg för att analysera ett uppdrag (mot ett CV om ett finns).
 * @param {{ hasCv?: boolean }} [opts]
 */
export function buildJobAnalysisSteps({ hasCv = true } = {}) {
  return [
    { phase: 'job', afterMs: 0, label: 'Läser uppdraget', subtext: 'Tolkar annonsen och kraven...' },
    hasCv
      ? { phase: 'job', afterMs: 6000, label: 'Matchar krav mot CV:t', subtext: 'Jämför varje krav med CV:ts kompetenser...' }
      : { phase: 'job', afterMs: 6000, label: 'Analyserar kraven', subtext: 'Sorterar krav efter hur viktiga de är...' },
    { phase: 'job', afterMs: 18000, label: 'Skapar intervjufrågor', subtext: 'Skräddarsyr frågor för uppdraget...' },
    { phase: 'job', afterMs: 32000, label: 'Sammanställer förberedelsen', subtext: 'Styrkor, vad du ska förbereda och sammanfattning...' },
    { phase: 'save', afterMs: 0, label: 'Sparar uppdraget', subtext: 'Snart klart...' },
  ]
}

/**
 * Hela "Nytt uppdrag"-flödet: (CV-uppladdning) + uppdragsanalys.
 * @param {{ uploadCv?: boolean, hasCv?: boolean }} [opts]
 */
export function buildJobCreateSteps({ uploadCv = false, hasCv = false } = {}) {
  return [
    ...(uploadCv ? CV_UPLOAD_STEPS : []),
    ...buildJobAnalysisSteps({ hasCv: uploadCv || hasCv }),
  ]
}

/** Steg för att koppla/byta CV på ett befintligt uppdrag (analys + spara). */
export const LINK_CV_STEPS = buildJobAnalysisSteps({ hasCv: true })

/** Fas som betyder att allt är klart. */
export const DONE_PHASE = 'done'

/**
 * Vilket steg ska visas just nu?
 *
 * @param {Array<{phase: string, afterMs: number}>} steps
 * @param {string|null} phase – fasen koden senast rapporterade
 * @param {number} elapsedMs – tid sedan fasen startade
 * @returns {number} index; steps.length när allt är klart
 */
export function stepIndexAt(steps, phase, elapsedMs) {
  const list = Array.isArray(steps) ? steps : []
  if (phase === DONE_PHASE) return list.length
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
  let index = -1
  list.forEach((step, i) => {
    if (step.phase === phase && step.afterMs <= elapsed) index = i
  })
  if (index !== -1) return index
  // Okänd fas (eller ingen än) → första steget, aldrig ett hopp framåt.
  return 0
}
