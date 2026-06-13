// ── Onboarding / dashboard-logik ──────────────────────────────────────────
//
// Rena hjälpare (ingen Firestore/IO) som styr förstagångsupplevelsen för
// inloggade konsulter. Bryts ut hit för att kunna enhetstestas.

/**
 * Beräknar onboarding-checklistans tre steg utifrån Firestore-läget.
 * - cvUploaded:   profilen är aktiverad (CV uppladdat) → alltid true när
 *                 checklistan visas (visas bara om profileActivated)
 * - jobAdded:     minst ett uppdrag finns (users/{uid}/jobs)
 * - firstTraining: minst ett feedback-dokument finns
 * allDone styr när bannern döljs automatiskt.
 */
export function computeChecklist({ profileActivated, jobCount, feedbackCount } = {}) {
  const cvUploaded = profileActivated === true
  const jobAdded = (jobCount ?? 0) > 0
  const firstTraining = (feedbackCount ?? 0) > 0
  return {
    cvUploaded,
    jobAdded,
    firstTraining,
    allDone: cvUploaded && jobAdded && firstTraining,
  }
}

/**
 * Avgör hur primärknappen "Starta intervjuträning" ska bete sig.
 * - inga uppdrag      → { mode: 'hidden' }            (tomma-state-kortet tar över)
 * - exakt ett uppdrag → { mode: 'single', jobId }     (navigera direkt till JobPage)
 * - flera uppdrag     → { mode: 'multi' }             (visa väljare)
 *
 * Ta in de uppdrag som faktiskt går att träna på (aktiva uppdrag).
 */
export function resolvePrimaryCta(jobs = []) {
  if (jobs.length === 0) return { mode: 'hidden' }
  if (jobs.length === 1) return { mode: 'single', jobId: jobs[0].docId }
  return { mode: 'multi' }
}

/**
 * Väljer vilket vägledande tomma-state-kort som ska visas.
 * - 'no-jobs'     : inga (aktiva) uppdrag alls
 * - 'no-training' : har uppdrag men inget feedback-dokument finns
 * - 'normal'      : har uppdrag och minst en genomförd träning
 */
export function resolveEmptyState({ jobCount, feedbackCount } = {}) {
  if ((jobCount ?? 0) === 0) return 'no-jobs'
  if ((feedbackCount ?? 0) === 0) return 'no-training'
  return 'normal'
}
