// ── Teknisk driftloggning ─────────────────────────────────────────────────
//
// systemEvents/{eventId} är en oföränderlig TEKNISK logg över hur kedjan
// Whisper → Claude → TTS → Firestore mår. Den innehåller ALDRIG betyg,
// feedbacktext eller annan prestationsdata – enbart driftsignaler.
//
// Datamodell: { type, severity, step, message, uid, createdAt }
//
// Loggningen får ALDRIG blockera användarflödet: logSystemEvent sväljer
// alla egna fel och returnerar tyst.

import { db, auth, collection, addDoc, serverTimestamp } from './firebase'

export const SEVERITY = { INFO: 'info', ERROR: 'error' }
const MAX_MESSAGE = 500

/**
 * Pure helper – normaliserar ett event-payload utan timestamp eller IO.
 * Bryts ut för att kunna enhetstestas. Klipper meddelandet, tvingar en
 * giltig severity och garanterar strängfält.
 */
export function buildSystemEvent({ type, severity = 'info', step = '', message = '', uid = null } = {}) {
  return {
    type: String(type ?? 'unknown'),
    severity: severity === 'error' ? 'error' : 'info',
    step: String(step ?? ''),
    message: String(message ?? '').slice(0, MAX_MESSAGE),
    uid: uid ?? null,
  }
}

/**
 * Pure helper – aggregerar tekniska events till en hälsovy för driftöversikten.
 * Tar emot events med normaliserad tidsstämpel `createdAtMs` (millisekunder)
 * så funktionen blir deterministisk och enhetstestbar.
 *
 * INGA betyg, INGEN feedbacktext – bara driftaggregat.
 *
 * @returns {{ completedTotal, completed7, completed30, activeConsultants,
 *             errorTotal, attempts, errorRate }}
 */
export function summarizeEvents(events = [], now = Date.now()) {
  const DAY = 24 * 60 * 60 * 1000
  let completedTotal = 0
  let completed7 = 0
  let completed30 = 0
  let errorTotal = 0
  const activeUids = new Set()

  for (const e of events) {
    const ts = typeof e.createdAtMs === 'number' ? e.createdAtMs : 0
    if (e.type === 'session_completed') {
      completedTotal++
      if (e.uid) activeUids.add(e.uid)
      if (ts && now - ts <= 7 * DAY) completed7++
      if (ts && now - ts <= 30 * DAY) completed30++
    } else if (e.severity === 'error') {
      errorTotal++
    }
  }

  const attempts = completedTotal + errorTotal
  return {
    completedTotal,
    completed7,
    completed30,
    activeConsultants: activeUids.size,
    errorTotal,
    attempts,
    errorRate: attempts > 0 ? errorTotal / attempts : 0,
  }
}

/**
 * Skriver ett tekniskt event till Firestore. Fire-and-forget:
 * kastar aldrig vidare till anroparen och kräver inloggad användare
 * (reglerna tillåter bara create när uid === request.auth.uid).
 */
export async function logSystemEvent(input) {
  try {
    const uid = auth.currentUser?.uid
    if (!uid) return
    const event = buildSystemEvent({ ...input, uid })
    await addDoc(collection(db, 'systemEvents'), {
      ...event,
      createdAt: serverTimestamp(),
    })
  } catch (err) {
    // Loggning får aldrig störa intervjuflödet.
    console.warn('[systemEvents] kunde inte logga händelse:', err)
  }
}
