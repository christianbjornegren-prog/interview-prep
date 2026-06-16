/**
 * One-time reconcile: Peter Sallenius
 * Run from the functions/ directory:
 *   cd functions && node reconcile-peter.mjs
 *
 * Reads service-account.json from the same directory (functions/).
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir      = dirname(fileURLToPath(import.meta.url))
const UID        = '8EQsfxHOLvXraOI4dyfYLPT3aD62'
const PETER_EMAIL = 'peter.sallenius@boulder.se'
const PROJECT_ID = 'interview-prep-81cb6'

const sa = JSON.parse(readFileSync(resolve(__dir, 'service-account.json'), 'utf8'))
initializeApp({ credential: cert(sa), projectId: PROJECT_ID })
const db = getFirestore()

function log(msg)  { console.log(`  · ${msg}`) }
function ok(msg)   { console.log(`  ✓ ${msg}`) }
function warn(msg) { console.warn(`  ⚠ ${msg}`) }

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n=== reconcile-peter ===')
  console.log(`  uid   : ${UID}`)
  console.log(`  email : ${PETER_EMAIL}`)

  // 1. Find pendingProfiles doc – exact key, then case-insensitive scan
  let pendingRef  = db.collection('pendingProfiles').doc(PETER_EMAIL)
  let pendingSnap = await pendingRef.get()

  if (!pendingSnap.exists()) {
    warn(`Exact key not found – scanning case-insensitively…`)
    const all   = await db.collection('pendingProfiles').get()
    const match = all.docs.find(d => d.id.toLowerCase() === PETER_EMAIL.toLowerCase())
               ?? all.docs.find(d => d.id.toLowerCase().includes(PETER_EMAIL.split('@')[0]))
    if (!match) {
      console.error(`\nFATAL: no pendingProfiles doc for "${PETER_EMAIL}"`)
      console.error('Existing:', all.docs.map(d => d.id).join(', ') || '(none)')
      process.exit(1)
    }
    pendingRef  = match.ref
    pendingSnap = match
    ok(`Found as: "${pendingSnap.id}"`)
  } else {
    ok(`Found exact: "${pendingSnap.id}"`)
  }

  const pending      = pendingSnap.data()
  const competencies = pending.competencies ?? []
  const jobs         = pending.jobs         ?? []
  log(`name="${pending.name}", ${competencies.length} competencies, ${jobs.length} jobs`)

  // 2. Create users/{uid} if missing
  const userRef  = db.collection('users').doc(UID)
  const userSnap = await userRef.get()

  if (userSnap.exists()) {
    warn(`users/${UID} already exists – skipping create`)
  } else {
    await userRef.set({
      email:            (pending.email || PETER_EMAIL).toLowerCase(),
      name:             pending.name ?? '',
      role:             'konsult',
      profileActivated: true,
      createdAt:        FieldValue.serverTimestamp(),
    })
    ok(`Created users/${UID}`)
  }

  // 3. Copy competencies (idempotent)
  const compCol  = userRef.collection('competencies')
  const nComp    = (await compCol.count().get()).data().count
  if (nComp > 0) {
    warn(`competencies already has ${nComp} docs – skipping`)
  } else {
    log(`Writing ${competencies.length} competencies…`)
    for (const { createdAt: _ct, ...comp } of competencies) {
      await compCol.add({ ...comp, createdAt: FieldValue.serverTimestamp() })
    }
    const written = (await compCol.count().get()).data().count
    if (written !== competencies.length) {
      console.error(`FATAL: expected ${competencies.length}, verified ${written} – NOT deleting pending`)
      process.exit(1)
    }
    ok(`${written} competencies written & verified`)
  }

  // 4. Copy jobs (idempotent)
  const jobCol = userRef.collection('jobs')
  const nJobs  = (await jobCol.count().get()).data().count
  if (nJobs > 0) {
    warn(`jobs already has ${nJobs} docs – skipping`)
  } else {
    log(`Writing ${jobs.length} jobs…`)
    for (const { createdAt: _ct, id: _id, ...job } of jobs) {
      await jobCol.add({ ...job, createdAt: FieldValue.serverTimestamp() })
    }
    const written = (await jobCol.count().get()).data().count
    if (written !== jobs.length) {
      console.error(`FATAL: expected ${jobs.length}, verified ${written} – NOT deleting pending`)
      process.exit(1)
    }
    ok(`${written} jobs written & verified`)
  }

  // 5. Delete pending doc LAST
  await pendingRef.delete()
  ok(`pendingProfiles/${pendingSnap.id} deleted`)

  console.log('\n=== Done – Peter is unblocked ===\n')
}

main().catch(err => {
  console.error('\nFATAL:', err.message)
  process.exit(1)
})
