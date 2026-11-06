/**
 * Lagring av CV:n – ETT gränssnitt, två adaptrar:
 *
 *   createUserCvStore(uid)      → users/{uid}/cvs/{cvId} (+ users/{uid}/jobs)
 *   createPendingCvStore(email) → pendingProfiles/{email}.cvs[] (+ .jobs[])
 *
 * Sidorna (Mina CV, konsultprofilen, väntande profil, uppdragssidan) pratar
 * bara med gränssnittet och behöver inte veta var datan ligger. Ren logik
 * ligger i lib/cvs.js; här finns bara Firestore-anropen.
 *
 * Gränssnitt:
 *   list()                       → CV[] (nyaste först), migrerar äldre data först
 *   get(cvId)                    → CV | null
 *   create({ fileName, label, competencies, source }) → CV
 *   rename(cvId, label)
 *   remove(cvId)                 → kopplar ALLTID loss uppdragen som använde CV:t
 *   addCompetency(cvId, comp)
 *   removeCompetency(cvId, index)
 *   saveJob(jobId, update)       → skriver CV-koppling/analys till uppdraget
 */
import {
  collection,
  db,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  query,
  runTransaction,
  writeBatch,
} from './firebase'
import { MAX_BATCH_OPERATIONS } from './pendingMigration'
import {
  buildCvData,
  buildCvUnlinkUpdate,
  convertLegacyPendingCompetencies,
  cvCompetencies,
  generateCvId,
  groupLegacyCompetencies,
  patchCvInList,
  patchJobInList,
  removeCvFromProfile,
  sortCvsNewestFirst,
  withCompetencyAdded,
  withCompetencyRemoved,
} from './cvs'

// ── Konsultens konto ──────────────────────────────────────────────────────

/**
 * Fält som markerar att en gammal kompetens har flyttats in i ett CV.
 * Originalet RADERAS INTE – det ligger kvar orört (plus markeringen) så att
 * en rollback till den gamla appversionen ser exakt samma kompetensbank som
 * förut. Städning av originalen är ett separat, senare beslut.
 */
export const MIGRATED_FIELD = 'migratedToCvId'

/**
 * Flyttar den gamla samlade kompetensbanken (users/{uid}/competencies) till
 * CV:n, grupperat på källfil. Körs innan CV:n listas – för både konsulten och
 * säljaren – så ingen behöver göra något manuellt.
 *
 * ICKE-DESTRUKTIV: originalen märks med `migratedToCvId` i stället för att
 * raderas (rollback-säkert, se MIGRATED_FIELD).
 *
 * ATOMÄRT PER CV: varje grupp (skapa/utöka CV + märk dess kompetenser) är en
 * egen transaktion. Antingen flyttas hela gruppen eller ingenting av den. Avbryts en
 * körning flyttas resten nästa gång – ofarligt att köra om, eftersom redan
 * märkta kompetenser hoppas över. CV-id:t är deterministiskt (legacyCvId), så
 * två samtidiga körningar skriver till samma dokument i stället för att skapa
 * dubbletter. Dyker nya omärkta kompetenser upp senare för en fil som redan
 * flyttats (t.ex. skapade av gamla appen under en rollback) läggs de TILL i
 * det befintliga CV:t – det skrivs aldrig över.
 *
 * @returns {Promise<number>} antal CV-grupper som flyttades
 */
export async function migrateLegacyCompetencies(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'competencies'))
  if (snap.empty) return 0

  const comps = snap.docs
    .map((d) => ({ docId: d.id, ...d.data() }))
    .filter((c) => !c[MIGRATED_FIELD])
  if (comps.length === 0) return 0

  const groups = groupLegacyCompetencies(comps)

  let moved = 0
  for (const group of groups) {
    if (group.sourceDocIds.length + 1 > MAX_BATCH_OPERATIONS) {
      throw new Error(
        `CV-gruppen "${group.data.label}" har för många kompetenser för en atomär flytt.`
      )
    }
    const cvRef = doc(db, 'users', uid, 'cvs', group.id)
    const compRef = (id) => doc(db, 'users', uid, 'competencies', id)

    // TRANSAKTION: läser om CV:t och varje kompetens och flyttar bara de som
    // fortfarande är omärkta. Två samtidiga körningar (konsulten och säljaren
    // öppnar samma profil) kan därmed aldrig flytta samma kompetens två
    // gånger – Firestore kör om den transaktion som krockar.
    const didMove = await runTransaction(db, async (tx) => {
      const cvSnap = await tx.get(cvRef)
      const fresh = []
      for (const id of group.sourceDocIds) {
        const snap = await tx.get(compRef(id))
        if (snap.exists() && !snap.data()[MIGRATED_FIELD]) fresh.push({ docId: id, ...snap.data() })
      }
      if (fresh.length === 0) return false

      const data = buildCvData({
        fileName: group.data.fileName,
        label: group.data.label,
        competencies: fresh,
        source: 'legacy',
      })
      if (cvSnap.exists()) {
        const merged = [...cvCompetencies(cvSnap.data()), ...data.competencies]
        tx.update(cvRef, { competencies: merged, competencyCount: merged.length })
      } else {
        // Äldsta kompetensens tid blir CV:ts uppladdningstid – den bästa
        // uppskattningen av när CV:t faktiskt laddades upp.
        const times = fresh
          .map((c) => c.createdAt)
          .filter((t) => t && typeof t.toMillis === 'function')
          .sort((a, b) => a.toMillis() - b.toMillis())
        tx.set(cvRef, { ...data, createdAt: times[0] ?? serverTimestamp() })
      }
      for (const c of fresh) tx.update(compRef(c.docId), { [MIGRATED_FIELD]: group.id })
      return true
    })
    if (didMove) moved++
  }
  return moved
}

export function createUserCvStore(uid) {
  const cvsCol = () => collection(db, 'users', uid, 'cvs')
  const cvRef = (cvId) => doc(db, 'users', uid, 'cvs', cvId)

  async function get(cvId) {
    if (!cvId) return null
    const snap = await getDoc(cvRef(cvId))
    return snap.exists() ? { id: snap.id, ...snap.data() } : null
  }

  return {
    kind: 'user',

    async list() {
      try {
        await migrateLegacyCompetencies(uid)
      } catch (err) {
        // Migreringen får aldrig blockera vyn – det som inte flyttades nu
        // flyttas nästa gång.
        console.error('[CV-migrering] Misslyckades:', err)
      }
      const snap = await getDocs(cvsCol())
      return sortCvsNewestFirst(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    },

    get,

    async create(input) {
      const ref = doc(cvsCol())
      const data = buildCvData(input)
      await setDoc(ref, { ...data, createdAt: serverTimestamp() })
      return { id: ref.id, ...data, createdAt: Timestamp.now() }
    },

    async rename(cvId, label) {
      const clean = String(label ?? '').trim()
      if (!clean) throw new Error('Namnet kan inte vara tomt.')
      await updateDoc(cvRef(cvId), { label: clean })
    },

    // Raderingen och lossningen av uppdragen ligger i SAMMA batch – annars
    // kan ett uppdrag bli kvar och peka på ett CV som inte finns.
    async remove(cvId) {
      const jobsSnap = await getDocs(
        query(collection(db, 'users', uid, 'jobs'), where('cvId', '==', cvId))
      )
      const batch = writeBatch(db)
      batch.delete(cvRef(cvId))
      for (const j of jobsSnap.docs) batch.update(j.ref, buildCvUnlinkUpdate())
      await batch.commit()
      return jobsSnap.size
    },

    async addCompetency(cvId, competency) {
      const cv = await get(cvId)
      if (!cv) throw new Error('CV:t finns inte längre.')
      await updateDoc(cvRef(cvId), withCompetencyAdded(cv, competency))
    },

    async removeCompetency(cvId, index) {
      const cv = await get(cvId)
      if (!cv) throw new Error('CV:t finns inte längre.')
      await updateDoc(cvRef(cvId), withCompetencyRemoved(cv, index))
    },

    async saveJob(jobId, update) {
      await updateDoc(doc(db, 'users', uid, 'jobs', jobId), update)
    },
  }
}

/**
 * Raderar ALLA CV:n för en användare (och eventuell kvarvarande gammal
 * kompetensbank). Uppdragen behåller sitt cvId och visas som "CV saknas".
 */
export async function clearUserCvs(uid) {
  const [cvSnap, legacySnap] = await Promise.all([
    getDocs(collection(db, 'users', uid, 'cvs')),
    getDocs(collection(db, 'users', uid, 'competencies')),
  ])
  const refs = [...cvSnap.docs, ...legacySnap.docs].map((d) => d.ref)
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db)
    refs.slice(i, i + 400).forEach((r) => batch.delete(r))
    await batch.commit()
  }
  return cvSnap.size + groupLegacyCompetencies(
    legacySnap.docs.map((d) => ({ docId: d.id, ...d.data() })).filter((c) => !c[MIGRATED_FIELD])
  ).length
}

/** Antal CV:n för en användare, inklusive äldre data som ännu inte flyttats. */
export async function countUserCvs(uid) {
  const [cvSnap, legacySnap] = await Promise.all([
    getDocs(collection(db, 'users', uid, 'cvs')),
    getDocs(collection(db, 'users', uid, 'competencies')),
  ])
  const legacyIds = groupLegacyCompetencies(
    legacySnap.docs.map((d) => d.data()).filter((c) => !c[MIGRATED_FIELD])
  ).map((g) => g.id)
  const ids = new Set([...cvSnap.docs.map((d) => d.id), ...legacyIds])
  return ids.size
}

// ── Väntande profil ───────────────────────────────────────────────────────

export function createPendingCvStore(email) {
  const ref = () => doc(db, 'pendingProfiles', email)

  async function read() {
    const snap = await getDoc(ref())
    if (!snap.exists()) throw new Error('Profilen finns inte längre.')
    return snap.data()
  }

  async function readCvs() {
    const data = await read()
    return Array.isArray(data.cvs) ? data.cvs : []
  }

  return {
    kind: 'pending',

    async list() {
      const data = await read()
      // Äldre väntande profiler har en samlad `competencies`-array. Den görs
      // om till CV:n i EN skrivning. Arrayen RÖRS INTE (rollback-säkert);
      // flaggan competenciesMigrated hindrar att den konverteras igen.
      const { cvs, changed } = convertLegacyPendingCompetencies(data, Timestamp.now())
      if (changed) {
        try {
          await updateDoc(ref(), { cvs, competenciesMigrated: true })
        } catch (err) {
          console.error('[CV-migrering] Väntande profil:', err)
        }
      }
      return sortCvsNewestFirst(cvs)
    },

    async get(cvId) {
      return (await readCvs()).find((cv) => cv.id === cvId) ?? null
    },

    async create(input) {
      // serverTimestamp() kan inte ligga i en array – konkret tidsstämpel.
      const cv = { id: generateCvId(), ...buildCvData(input), createdAt: Timestamp.now() }
      const cvs = await readCvs()
      await updateDoc(ref(), { cvs: [...cvs, cv] })
      return cv
    },

    async rename(cvId, label) {
      const clean = String(label ?? '').trim()
      if (!clean) throw new Error('Namnet kan inte vara tomt.')
      const cvs = await readCvs()
      await updateDoc(ref(), { cvs: patchCvInList(cvs, cvId, { label: clean }) })
    },

    async remove(cvId) {
      const data = await read()
      const next = removeCvFromProfile(data, cvId)
      const unlinked = (data.jobs ?? []).filter((j) => j?.cvId === cvId).length
      await updateDoc(ref(), { cvs: next.cvs, jobs: next.jobs })
      return unlinked
    },

    async addCompetency(cvId, competency) {
      const cvs = await readCvs()
      const cv = cvs.find((c) => c.id === cvId)
      if (!cv) throw new Error('CV:t finns inte längre.')
      await updateDoc(ref(), { cvs: patchCvInList(cvs, cvId, withCompetencyAdded(cv, competency)) })
    },

    async removeCompetency(cvId, index) {
      const cvs = await readCvs()
      const cv = cvs.find((c) => c.id === cvId)
      if (!cv) throw new Error('CV:t finns inte längre.')
      await updateDoc(ref(), { cvs: patchCvInList(cvs, cvId, withCompetencyRemoved(cv, index)) })
    },

    async saveJob(jobId, update) {
      const data = await read()
      const exists = (data.jobs ?? []).some((j) => j?.id === jobId)
      if (!exists) throw new Error('Uppdraget finns inte längre.')
      await updateDoc(ref(), { jobs: patchJobInList(data.jobs, jobId, update) })
    },
  }
}
