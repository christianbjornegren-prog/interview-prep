// ── Teknisk driftloggning ─────────────────────────────────────────────────
//
// systemEvents/{eventId} är en oföränderlig TEKNISK logg över hur kedjan
// Whisper → Claude → TTS → Firestore mår. Den innehåller ALDRIG betyg,
// feedbacktext eller annan prestationsdata – enbart driftsignaler.
//
// Datamodell: { type, severity, step, message, uid, createdAt, context? }
//
// `context` (valfri) är felsökningsunderlaget: enhet/webbläsare, appversion,
// läge i intervjun, sessions-id och ett kort spår över vad som hände före
// felet. Fortfarande enbart teknik – se lib/diagnostics.js. Fältet saknas på
// händelser loggade före 2026-11.
//
// Loggningen får ALDRIG blockera användarflödet: logSystemEvent sväljer
// alla egna fel och returnerar tyst.

import { db, auth, collection, addDoc, serverTimestamp } from './firebase'
import { collectEnvironment, CONTEXT_FIELDS } from './diagnostics'

export const SEVERITY = { INFO: 'info', ERROR: 'error' }
const MAX_MESSAGE = 500

// Tak för kontexten, så ett enskilt fel aldrig kan bli ett jättedokument.
const MAX_CONTEXT_STRING = 300
const MAX_CONTEXT_LONG = 1500        // stack, userAgent, detail
const LONG_CONTEXT_KEYS = new Set(['stack', 'userAgent', 'detail'])
const MAX_TRAIL = 40

/**
 * Pure helper – gör om valfri kontext till något Firestore säkert tar emot:
 * platt objekt med strängar/tal/booleaner (plus `trail`, en lista strängar).
 * Bara fält på vitlistan CONTEXT_FIELDS släpps igenom – allt annat kastas, så
 * loggen förblir rent teknisk. undefined, funktioner och nästlade objekt
 * släpps aldrig igenom (ett enda undefined-fält får hela skrivningen att kastas).
 */
export function sanitizeContext(context) {
  if (!context || typeof context !== 'object') return null
  const out = {}
  for (const [key, value] of Object.entries(context)) {
    if (!CONTEXT_FIELDS.has(key)) continue
    if (value === undefined || value === null || value === '') continue
    if (key === 'trail') {
      if (Array.isArray(value) && value.length) {
        out.trail = value.slice(-MAX_TRAIL).map((v) => String(v).slice(0, 100))
      }
    } else if (typeof value === 'boolean') {
      out[key] = value
    } else if (typeof value === 'number') {
      if (Number.isFinite(value)) out[key] = value
    } else if (typeof value === 'string') {
      out[key] = value.slice(0, LONG_CONTEXT_KEYS.has(key) ? MAX_CONTEXT_LONG : MAX_CONTEXT_STRING)
    }
  }
  return Object.keys(out).length ? out : null
}

/**
 * Pure helper – normaliserar ett event-payload utan timestamp eller IO.
 * Bryts ut för att kunna enhetstestas. Klipper meddelandet, tvingar en
 * giltig severity och garanterar strängfält.
 */
export function buildSystemEvent({ type, severity = 'info', step = '', message = '', uid = null, context } = {}) {
  const event = {
    type: String(type ?? 'unknown'),
    severity: severity === 'error' ? 'error' : 'info',
    step: String(step ?? ''),
    message: String(message ?? '').slice(0, MAX_MESSAGE),
    uid: uid ?? null,
  }
  // Fältet utelämnas helt när det inte finns någon kontext.
  const cleanContext = sanitizeContext(context)
  if (cleanContext) event.context = cleanContext
  return event
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
    // Miljön (enhet, webbläsare, appversion, nät) följer med VARJE händelse –
    // det är den som avgör om ett fel är mobilen, Safari eller något annat.
    const event = buildSystemEvent({
      ...input,
      uid,
      context: { ...collectEnvironment(), ...(input?.context ?? {}) },
    })
    await addDoc(collection(db, 'systemEvents'), {
      ...event,
      createdAt: serverTimestamp(),
    })
  } catch (err) {
    // Loggning får aldrig störa intervjuflödet.
    console.warn('[systemEvents] kunde inte logga händelse:', err)
  }
}
