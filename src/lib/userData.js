import { collection, getDocs, writeBatch, db, auth } from './firebase'

function requireUid() {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Ingen inloggad användare.')
  return uid
}

/** Deletes an array of doc refs in chunks (Firestore batches cap at 500). */
async function deleteRefs(refs) {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db)
    refs.slice(i, i + 400).forEach((ref) => batch.delete(ref))
    await batch.commit()
  }
}

/**
 * Deletes every document in users/{uid}/{collectionName}.
 * Returns the number of documents removed.
 */
export async function clearCollection(collectionName) {
  const uid = requireUid()
  const snap = await getDocs(collection(db, 'users', uid, collectionName))
  if (snap.empty) return 0
  await deleteRefs(snap.docs.map((d) => d.ref))
  return snap.docs.length
}

/** Clears the current user's competency bank. */
export function clearCompetencies() {
  return clearCollection('competencies')
}

/**
 * Clears the current user's uppdrag. Each job has a `feedback` subcollection
 * that Firestore does NOT delete with the parent, so we remove those first to
 * avoid orphaned interview history. Returns the number of jobs removed.
 */
export async function clearJobs() {
  const uid = requireUid()
  const jobsSnap = await getDocs(collection(db, 'users', uid, 'jobs'))
  if (jobsSnap.empty) return 0

  for (const jobDoc of jobsSnap.docs) {
    const fbSnap = await getDocs(
      collection(db, 'users', uid, 'jobs', jobDoc.id, 'feedback')
    )
    if (!fbSnap.empty) await deleteRefs(fbSnap.docs.map((d) => d.ref))
  }

  await deleteRefs(jobsSnap.docs.map((d) => d.ref))
  return jobsSnap.docs.length
}

/** Clears both the competency bank and all uppdrag for the current user. */
export async function clearAll() {
  const competencies = await clearCompetencies()
  const jobs = await clearJobs()
  return { competencies, jobs }
}
