/**
 * Lagringstid för träningsdata. Ren modul: ingen Firebase, fullt enhetstestbar.
 *
 * En träningssession (feedback-dokumentet) bär `expiresAt`. Firestores TTL-policy
 * (firestore.indexes.json → fieldOverrides, collectionGroup 'feedback') raderar
 * dokumentet automatiskt när tiden passerats – normalt inom ett dygn efteråt.
 * Firestore-regeln kräver fältet vid skapande, så ingen klient kan hoppa över det.
 *
 * Ljudet sparas aldrig, och utskriften av svaren sparas inte heller – den skickas
 * bara till Claude för att skapa feedbacken.
 */

export const FEEDBACK_RETENTION_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

/** När en session som skapas vid `from` ska raderas. */
export function feedbackExpiryDate(from = new Date()) {
  return new Date(from.getTime() + FEEDBACK_RETENTION_DAYS * DAY_MS)
}
