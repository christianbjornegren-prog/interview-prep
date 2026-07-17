import { collection, getDocs, writeBatch, db, auth } from './firebase'

/**
 * Deletes every document in users/{uid}/{collectionName}.
 * Firestore batches are capped at 500 writes, so we chunk in 400s.
 * Returns the number of documents removed.
 */
export async function clearCollection(collectionName) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Ingen inloggad användare.')

  const snap = await getDocs(collection(db, 'users', uid, collectionName))
  const docs = snap.docs
  if (docs.length === 0) return 0

  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db)
    docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
  return docs.length
}

/** Clears the current user's competency bank. */
export function clearCompetencies() {
  return clearCollection('competencies')
}

/** Clears the current user's saved job postings / uppdrag. */
export function clearJobs() {
  return clearCollection('jobs')
}

/** Clears both the competency bank and the jobs for the current user. */
export async function clearAll() {
  const competencies = await clearCompetencies()
  const jobs = await clearJobs()
  return { competencies, jobs }
}
