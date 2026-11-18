// Engångskörning: ger BEFINTLIGA träningssessioner ett raderingsdatum och tar
// bort utskriften av svaren. Nya sessioner får detta redan när de skapas.
//
//   node scripts/retention-backfill.mjs            → visar bara vad som skulle ändras
//   node scripts/retention-backfill.mjs --apply    → ändrar
//
// Befintliga sessioner får raderingsdatum 30 dagar från KÖRNINGEN (inte från
// träningen) – ingen förlorar sin historik utan förvarning.
// Kör med Googles standardinloggning (gcloud auth application-default login)
// eller mot emulatorn (FIRESTORE_EMULATOR_HOST). Skriver bara ut antal – aldrig innehåll.
import { createRequire } from 'node:module'
import { feedbackExpiryDate } from '../src/lib/retention.js'

const require = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore')

const apply = process.argv.includes('--apply')
const projectId = process.env.GCLOUD_PROJECT || 'interview-prep-81cb6'

initializeApp({ projectId })
const db = getFirestore()

const expiresAt = Timestamp.fromDate(feedbackExpiryDate())
const snap = await db.collectionGroup('feedback').get()

let needsExpiry = 0
let hasTranscript = 0
let batch = db.batch()
let pending = 0

for (const docSnap of snap.docs) {
  const data = docSnap.data()
  const update = {}
  if (!data.expiresAt) { update.expiresAt = expiresAt; needsExpiry++ }
  if ('transcript' in data) { update.transcript = FieldValue.delete(); hasTranscript++ }
  if (Object.keys(update).length === 0) continue
  if (apply) {
    batch.update(docSnap.ref, update)
    if (++pending === 400) { await batch.commit(); batch = db.batch(); pending = 0 }
  }
}
if (apply && pending > 0) await batch.commit()

console.log(`Projekt: ${projectId}${process.env.FIRESTORE_EMULATOR_HOST ? ' (emulator)' : ''}`)
console.log(`Träningssessioner totalt: ${snap.size}`)
console.log(`Får raderingsdatum ${expiresAt.toDate().toISOString().slice(0, 10)}: ${needsExpiry}`)
console.log(`Utskrift av svaren tas bort: ${hasTranscript}`)
console.log(apply ? 'Klart – ändringarna är gjorda.' : 'Ingenting ändrat (lägg till --apply för att ändra).')
