/**
 * One-time reconcile: Peter
 *
 * Run from the functions/ directory (picks up its firebase-admin):
 *   cd functions && node ../scripts/reconcile-peter.mjs
 *
 * Auth – pick ONE:
 *   A) Download a service account key from Firebase Console →
 *      Project Settings → Service accounts → Generate new private key
 *      Save as service-account.json in the project root, then:
 *        GOOGLE_APPLICATION_CREDENTIALS=../service-account.json node ../scripts/reconcile-peter.mjs
 *
 *   B) gcloud auth application-default login (then run without env var)
 */

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ── Config ────────────────────────────────────────────────────────────────
const UID          = '8EQsfxHOLvXraOI4dyfYLPT3aD62'
const PETER_EMAIL  = 'peter.sallenius@boulder.se'   // ← adjust if wrong casing/spelling
const PROJECT_ID   = 'interview-prep-81cb6'

// ── Init ──────────────────────────────────────────────────────────────────
const __dir   = dirname(fileURLToPath(import.meta.url))
const saPath  = resolve(__dir, '..', 'service-account.json')
const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS

let credential
if (envPath && existsSync(envPath)) {
  credential = cert(JSON.parse(readFileSync(envPath, 'utf8')))
  console.log('Auth: GOOGLE_APPLICATION_CREDENTIALS')
} else if (existsSync(saPath)) {
  credential = cert(JSON.parse(readFileSync(saPath, 'utf8')))
  console.log('Auth: service-account.json')
} else {
  credential = applicationDefault()
  console.log('Auth: Application Default Credentials')
}

initializeApp({ credential, projectId: PROJECT_ID })
const db = getFirestore()

// ── Helpers ───────────────────────────────────────────────────────────────
function log(msg)  { console.log(`  ${msg}`) }
function ok(msg)   { console.log(`  ✓ ${msg}`) }
function warn(msg) { console.warn(`  ⚠ ${msg}`) }

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n=== reconcile-peter ===')
  console.log(`UID   : ${UID}`)
  console.log(`Email : ${PETER_EMAIL}`)

  // ── 1. Locate pendingProfiles doc (case-insensitive fallback) ────────────
  let pendingRef  = db.collection('pendingProfiles').doc(PETER_EMAIL)
  let pendingSnap = await pendingRef.get()

  if (!pendingSnap.exists()) {
    warn(`Exact key "${PETER_EMAIL}" not found – scanning case-insensitively…`)
    const all   = await db.collection('pendingProfiles').get()
    const match = all.docs.find(d => d.id.toLowerCase() === PETER_EMAIL.toLowerCase())
    if (!match) {
      // Broaden: look for any doc whose id contains the first part of the email
      const namePart = PETER_EMAIL.split('@')[0].toLowerCase()
      const loose    = all.docs.find(d => d.id.toLowerCase().includes(namePart))
      if (!loose) {
        console.error(`\nFATAL: no pendingProfiles doc found matching "${PETER_EMAIL}"`)
        console.error('Existing docs:', all.docs.map(d => d.id).join(', '))
        process.exit(1)
      }
      pendingRef  = loose.ref
      pendingSnap = loose
    } else {
      pendingRef  = match.ref
      pendingSnap = match
    }
    ok(`Found as: "${pendingSnap.id}"`)
  } else {
    ok(`Found exact: "${pendingSnap.id}"`)
  }

  const pending      = pendingSnap.data()
  const competencies = pending.competencies ?? []
  const jobs         = pending.jobs         ?? []
  log(`Data: ${competencies.length} competencies, ${jobs.length} jobs, name="${pending.name}"`)

  // ── 2. Create users/{uid} if missing ────────────────────────────────────
  const userRef  = db.collection('users').doc(UID)
  const userSnap = await userRef.get()

  if (userSnap.exists()) {
    warn(`users/${UID} already exists – skipping creation`)
    log(JSON.stringify(userSnap.data()))
  } else {
    await userRef.set({
      email:            pending.email || PETER_EMAIL,
      name:             pending.name  || '',
      role:             'konsult',
      profileActivated: true,
      createdAt:        FieldValue.serverTimestamp(),
    })
    ok(`Created users/${UID}`)
  }

  // ── 3. Copy competencies ────────────────────────────────────────────────
  const compCol = userRef.collection('competencies')

  // Idempotent: skip if already populated
  const existingComp = await compCol.count().get()
  if (existingComp.data().count > 0) {
    warn(`competencies subcollection already has ${existingComp.data().count} docs – skipping`)
  } else {
    log(`Writing ${competencies.length} competencies…`)
    for (const { createdAt: _ct, ...comp } of competencies) {
      await compCol.add({ ...comp, createdAt: FieldValue.serverTimestamp() })
    }
    const after = await compCol.count().get()
    if (after.data().count !== competencies.length) {
      console.error(`FATAL: wrote ${competencies.length} but verified ${after.data().count} – aborting before delete`)
      process.exit(1)
    }
    ok(`${after.data().count} competencies written & verified`)
  }

  // ── 4. Copy jobs ────────────────────────────────────────────────────────
  const jobCol = userRef.collection('jobs')

  const existingJobs = await jobCol.count().get()
  if (existingJobs.data().count > 0) {
    warn(`jobs subcollection already has ${existingJobs.data().count} docs – skipping`)
  } else {
    log(`Writing ${jobs.length} jobs…`)
    for (const { createdAt: _ct, id: _id, ...job } of jobs) {
      await jobCol.add({ ...job, createdAt: FieldValue.serverTimestamp() })
    }
    const after = await jobCol.count().get()
    if (after.data().count !== jobs.length) {
      console.error(`FATAL: wrote ${jobs.length} but verified ${after.data().count} – aborting before delete`)
      process.exit(1)
    }
    ok(`${after.data().count} jobs written & verified`)
  }

  // ── 5. Delete pendingProfiles doc (LAST, only if all writes confirmed) ───
  await pendingRef.delete()
  ok(`pendingProfiles/${pendingSnap.id} deleted`)

  console.log('\n=== Done – Peter is reconciled ===\n')
}

main().catch(err => {
  console.error('\nFATAL:', err.message)
  process.exit(1)
})
