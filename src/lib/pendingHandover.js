/**
 * Överlämning av en säljar-förberedd profil till konsultens konto.
 * Körs av AuthGate vid VARJE inloggning (se pendingMigration.js för varför).
 * Bruten ur AuthGate så att den kan testas end-to-end mot emulatorn
 * (test/integration) – testet kör exakt den här koden.
 */
import { collection, db, doc, getDoc, serverTimestamp, writeBatch } from './firebase'
import { MAX_BATCH_OPERATIONS, buildMigrationPlan, fitsInOneBatch } from './pendingMigration'

/**
 * @param {string} uid   – konsultens uid
 * @param {string} email – normaliserad e-post (= pending-dokumentets id)
 * @returns {Promise<boolean>} true om en profil fanns och lämnades över
 */
export async function migratePendingProfile(uid, email) {
  const pendingRef = doc(db, 'pendingProfiles', email)
  const pendingSnap = await getDoc(pendingRef)
  if (!pendingSnap.exists()) return false

  const plan = buildMigrationPlan(pendingSnap.data())

  if (!fitsInOneBatch(plan)) {
    throw new Error(
      `Profilen rymms inte i en atomär överlämning: ${plan.total} ` +
      `poster, max ${MAX_BATCH_OPERATIONS - 1}.`
    )
  }

  // ATOMÄRT: skrivningarna OCH raderingen i SAMMA batch. Antingen
  // landar allt, eller ingenting. Tidigare var commit och delete två
  // skilda operationer – gick den ena igenom men inte den andra blev
  // konsulten kvar som både aktiv OCH väntande, med data på vift.
  const batch = writeBatch(db)
  // CV:n behåller sitt id – uppdragens cvId pekar på det.
  for (const cv of plan.cvs) {
    batch.set(
      doc(db, 'users', uid, 'cvs', cv.id),
      { ...cv.data, createdAt: cv.data.createdAt ?? serverTimestamp() }
    )
  }
  for (const job of plan.jobs) {
    batch.set(
      doc(collection(db, 'users', uid, 'jobs')),
      { ...job, createdAt: serverTimestamp() }
    )
  }
  batch.delete(pendingRef)

  await batch.commit()
  return true
}
