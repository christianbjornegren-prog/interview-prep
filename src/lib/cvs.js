/**
 * CV-modellen. Ren modul: ingen React, ingen Firestore – fullt enhetstestbar.
 *
 * BAKGRUND: kompetenserna låg tidigare som EN samlad hög per konsult, och allt
 * (kravanalys, intervjufrågor, feedback) matchades mot hela högen. Men CV:n
 * förfinas mot specifika uppdrag – ett CV för en arkitektroll ser annorlunda ut
 * än ett för en projektledarroll. Därför:
 *
 *   - Ett CV är en egen enhet med sina EGNA kompetenser
 *     (users/{uid}/cvs/{cvId}, eller pendingProfiles/{email}.cvs[]).
 *   - UPPDRAGET STYR: varje uppdrag pekar ut exakt ETT CV via `cvId`.
 *     Ett CV kan användas av flera uppdrag.
 *   - Analys, frågor och feedback bygger enbart på det kopplade CV:ts
 *     kompetenser. Den aggregerade kompetensbanken finns inte längre.
 *   - Utan kopplat CV går det inte att starta intervjuträning.
 */

/** Gruppnyckel för äldre kompetenser som saknar källfil (manuellt tillagda). */
export const LEGACY_MANUAL_KEY = '__manual__'

/** Etikett för gruppen av manuellt tillagda äldre kompetenser. */
export const LEGACY_MANUAL_LABEL = 'Manuellt tillagda kompetenser'

/** Fält som aldrig ska följa med in i ett CV:s kompetenslista. */
const STRIPPED_COMPETENCY_FIELDS = ['docId', 'id', 'createdAt']

/**
 * Deterministisk, kort hash (djb2 → base36). Används för att ge äldre
 * kompetensgrupper ett STABILT CV-id: körs migreringen två gånger samtidigt
 * (konsulten och säljaren öppnar profilen samma sekund) skriver båda till
 * samma dokument i stället för att skapa dubbletter.
 *
 * @param {string} str
 * @returns {string}
 */
export function stableHash(str) {
  const s = String(str ?? '')
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  }
  return h.toString(36)
}

/**
 * CV-id för en grupp äldre kompetenser.
 * @param {string} groupKey – källfilens namn, eller LEGACY_MANUAL_KEY
 */
export function legacyCvId(groupKey) {
  return `legacy_${stableHash(groupKey)}`
}

/**
 * Genererar ett klientsidigt CV-id (för väntande profiler, där CV:n ligger i
 * en array och inte har Firestore-dokument-id). Id:t BEHÅLLS vid överlämningen
 * till konsultens konto så att uppdragens `cvId` fortsätter peka rätt.
 *
 * @param {() => number} [now]
 * @param {() => number} [rng]
 */
export function generateCvId(now = Date.now, rng = Math.random) {
  const rand = Math.floor(rng() * 36 ** 6).toString(36).padStart(6, '0')
  return `cv_${now().toString(36)}_${rand}`
}

/**
 * Visningsnamn från filnamn: "CV_Anna_Arkitekt.pdf" → "CV_Anna_Arkitekt".
 * @param {unknown} fileName
 */
export function cvLabelFromFileName(fileName) {
  const name = typeof fileName === 'string' ? fileName.trim() : ''
  if (!name) return 'CV'
  const withoutExt = name.replace(/\.(pdf|docx?)$/i, '').trim()
  return withoutExt || name
}

/**
 * Det namn ett CV visas med överallt.
 * @param {object|null|undefined} cv
 */
export function cvDisplayName(cv) {
  if (!cv || typeof cv !== 'object') return 'Namnlöst CV'
  const label = typeof cv.label === 'string' ? cv.label.trim() : ''
  if (label) return label
  if (cv.fileName) return cvLabelFromFileName(cv.fileName)
  return 'Namnlöst CV'
}

/**
 * Städar en kompetens inför lagring i ett CV: tar bort id- och tidsfält.
 * (serverTimestamp kan inte ligga i arrayer, och id:n hör inte hemma här.)
 *
 * @param {object} competency
 * @returns {object}
 */
export function cleanCompetency(competency) {
  if (!competency || typeof competency !== 'object') return null
  const out = {}
  for (const [k, v] of Object.entries(competency)) {
    if (STRIPPED_COMPETENCY_FIELDS.includes(k)) continue
    if (v === undefined) continue
    out[k] = v
  }
  return out
}

/** Säker åtkomst till ett CV:s kompetenser – kastar aldrig. */
export function cvCompetencies(cv) {
  const list = cv && Array.isArray(cv.competencies) ? cv.competencies : []
  return list.filter((c) => c && typeof c === 'object')
}

/**
 * Bygger datan för ett nytt CV (utan createdAt – sätts av lagringslagret).
 *
 * @param {{ fileName?: string, label?: string, competencies?: object[], source?: string }} input
 */
export function buildCvData({ fileName = '', label = '', competencies = [], source = 'upload' } = {}) {
  const comps = (Array.isArray(competencies) ? competencies : [])
    .map(cleanCompetency)
    .filter(Boolean)
  const cleanLabel = typeof label === 'string' ? label.trim() : ''
  return {
    fileName: typeof fileName === 'string' ? fileName : '',
    label: cleanLabel || cvLabelFromFileName(fileName),
    source,
    competencies: comps,
    competencyCount: comps.length,
  }
}

/**
 * Grupperar ÄLDRE kompetenser (den gamla samlade banken) till CV:n efter
 * källfil. Kompetenser utan källfil hamnar i en egen grupp. Ordningen följer
 * första förekomsten så resultatet är deterministiskt.
 *
 * @param {object[]} competencies – gärna med `docId` (Firestore-dokumentets id)
 * @returns {Array<{ id: string, groupKey: string, data: object, sourceDocIds: string[] }>}
 */
export function groupLegacyCompetencies(competencies) {
  const list = (Array.isArray(competencies) ? competencies : []).filter(
    (c) => c && typeof c === 'object'
  )
  const groups = new Map()
  for (const comp of list) {
    const file = typeof comp.sourceFile === 'string' ? comp.sourceFile.trim() : ''
    const key = file || LEGACY_MANUAL_KEY
    if (!groups.has(key)) groups.set(key, { comps: [], docIds: [] })
    const g = groups.get(key)
    g.comps.push(comp)
    if (comp.docId) g.docIds.push(comp.docId)
  }

  return [...groups.entries()].map(([key, g]) => {
    const isManual = key === LEGACY_MANUAL_KEY
    return {
      id: legacyCvId(key),
      groupKey: key,
      data: buildCvData({
        fileName: isManual ? '' : key,
        label: isManual ? LEGACY_MANUAL_LABEL : cvLabelFromFileName(key),
        competencies: g.comps,
        source: 'legacy',
      }),
      sourceDocIds: g.docIds,
    }
  })
}

/** Hittar ett CV på id. */
export function findCv(cvs, cvId) {
  if (!cvId) return null
  return (Array.isArray(cvs) ? cvs : []).find((cv) => cv && cv.id === cvId) ?? null
}

/**
 * Vilket CV gäller för uppdraget?
 *  - 'linked'  : uppdraget pekar på ett CV som finns
 *  - 'none'    : uppdraget har inget CV kopplat (t.ex. äldre uppdrag)
 *  - 'missing' : uppdraget pekar på ett CV som har raderats
 *
 * @returns {{ status: 'linked'|'none'|'missing', cv: object|null }}
 */
export function resolveJobCv(job, cvs) {
  const cvId = job && typeof job.cvId === 'string' && job.cvId ? job.cvId : null
  if (!cvId) return { status: 'none', cv: null }
  const cv = findCv(cvs, cvId)
  return cv ? { status: 'linked', cv } : { status: 'missing', cv: null }
}

/**
 * Får intervjuträningen startas för uppdraget?
 * CV måste vara kopplat (och finnas), och uppdraget måste ha frågor.
 *
 * @returns {{ ready: boolean, reason: null|'no-cv'|'cv-missing'|'no-questions' }}
 */
export function trainingReadiness(job, cvs) {
  const { status } = resolveJobCv(job, cvs)
  if (status === 'none') return { ready: false, reason: 'no-cv' }
  if (status === 'missing') return { ready: false, reason: 'cv-missing' }
  const questions = Array.isArray(job?.questions) ? job.questions : []
  if (questions.length === 0) return { ready: false, reason: 'no-questions' }
  return { ready: true, reason: null }
}

/** Tröst-och-vägledning per orsak – coach-ton, aldrig skuld. */
export const READINESS_MESSAGE = {
  'no-cv':
    'Koppla ett CV till uppdraget innan du startar träningen – då bygger frågorna och feedbacken på rätt profil.',
  'cv-missing':
    'CV:t som var kopplat till uppdraget finns inte längre. Välj ett annat CV för att kunna träna.',
  'no-questions':
    'Uppdraget saknar intervjufrågor. Koppla om CV:t för att generera nya.',
}

/** Uppdragen som använder ett visst CV. */
export function jobsUsingCv(cvId, jobs) {
  if (!cvId) return []
  return (Array.isArray(jobs) ? jobs : []).filter((j) => j && j.cvId === cvId)
}

/** cvId → uppdrag som använder det. */
export function cvUsageMap(cvs, jobs) {
  const map = {}
  for (const cv of Array.isArray(cvs) ? cvs : []) {
    if (cv?.id) map[cv.id] = jobsUsingCv(cv.id, jobs)
  }
  return map
}

/** Millisekunder ur Firestore-Timestamp, Date eller tal. 0 om okänt. */
export function toMillis(value) {
  if (!value) return 0
  if (typeof value.toMillis === 'function') return value.toMillis()
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  if (typeof value.seconds === 'number') return value.seconds * 1000
  return 0
}

/** Nyaste CV:t först (stabil för lika tider). */
export function sortCvsNewestFirst(cvs) {
  return [...(Array.isArray(cvs) ? cvs : [])].sort(
    (a, b) => toMillis(b?.createdAt) - toMillis(a?.createdAt)
  )
}

/**
 * Fälten som skrivs till uppdraget när ett CV kopplas.
 *
 * Analysen körs ALLTID om mot det nya CV:t – kravmatchning och frågor är
 * personliga, och en matchning mot ett annat CV vore missvisande. De engelska
 * frågorna nollställs så att de skapas om (lat) mot rätt CV nästa gång någon
 * väljer engelska. Rolltitel och kund rörs inte. Tidigare feedback rörs inte.
 *
 * @param {object} cv
 * @param {object} analysis – resultatet från analyzeJobPosting
 * @param {object} [job] – nuvarande uppdrag (fallback om analysen saknar fält)
 */
export function buildCvLinkUpdate(cv, analysis, job = {}) {
  const a = analysis && typeof analysis === 'object' ? analysis : {}
  const questions = Array.isArray(a.questions) && a.questions.length > 0
    ? a.questions
    : (Array.isArray(job?.questions) ? job.questions : [])
  return {
    cvId: cv.id,
    cvLabel: cvDisplayName(cv),
    requirements: Array.isArray(a.requirements) ? a.requirements : [],
    summary: a.summary ?? job?.summary ?? '',
    sections: Array.isArray(a.sections) ? a.sections : (job?.sections ?? []),
    quickFacts: a.quickFacts ?? job?.quickFacts ?? null,
    questions,
    questionsEn: [],
    jobTitleEn: '',
    competencySnapshot: cvCompetencies(cv).length,
  }
}

/** Fälten som skrivs när ett uppdrags CV tas bort (CV:t raderades). */
export function buildCvUnlinkUpdate() {
  return { cvId: null, cvLabel: '' }
}

/**
 * Kopplar ett CV till ett uppdrag: analyserar uppdraget mot CV:t och sparar.
 * Beroenden injiceras så flödet kan testas utan Claude eller Firestore.
 *
 * Kopplingen sparas FÖRST när analysen lyckats. Då kan `cvId` och analysen
 * aldrig hamna i otakt – misslyckas analysen är uppdraget orört.
 *
 * @param {{ job: object, cv: object,
 *           analyze: (jobText: string, companyInfo: string, competencies: object[]) => Promise<object>,
 *           save: (jobId: string, update: object) => Promise<void>,
 *           onPhase?: (phase: 'job'|'save'|'done') => void }} deps
 * @returns {Promise<object>} uppdateringen som sparades
 */
export async function linkCvToJob({ job, cv, analyze, save, onPhase = () => {} }) {
  if (!job?.docId) throw new Error('Uppdraget saknar id.')
  if (!cv?.id) throw new Error('Välj ett CV att koppla.')
  const jobText = job.rawJobText || job.summary || ''
  if (!jobText.trim()) throw new Error('Uppdraget saknar annonstext att analysera.')

  onPhase('job')
  const analysis = await analyze(jobText, job.companyInfo ?? '', cvCompetencies(cv))
  onPhase('save')
  const update = buildCvLinkUpdate(cv, analysis, job)
  await save(job.docId, update)
  onPhase('done')
  return update
}

// ── Väntande profiler (CV:n och uppdrag ligger som arrayer i ett dokument) ──

/** Ersätter fält på ett uppdrag i en pending-uppdragslista (matchar på id). */
export function patchJobInList(jobs, jobId, patch) {
  return (Array.isArray(jobs) ? jobs : []).map((j) =>
    j && j.id === jobId ? { ...j, ...patch } : j
  )
}

/** Ersätter fält på ett CV i en pending-CV-lista (matchar på id). */
export function patchCvInList(cvs, cvId, patch) {
  return (Array.isArray(cvs) ? cvs : []).map((cv) =>
    cv && cv.id === cvId ? { ...cv, ...patch } : cv
  )
}

/**
 * Tar bort ett CV ur en väntande profil och kopplar loss uppdragen som
 * använde det, i samma veva (en skrivning → aldrig halvfärdigt).
 */
export function removeCvFromProfile({ cvs, jobs }, cvId) {
  return {
    cvs: (Array.isArray(cvs) ? cvs : []).filter((cv) => cv && cv.id !== cvId),
    jobs: (Array.isArray(jobs) ? jobs : []).map((j) =>
      j && j.cvId === cvId ? { ...j, ...buildCvUnlinkUpdate() } : j
    ),
  }
}

/**
 * Konverterar en väntande profils äldre `competencies`-array till CV:n.
 * Redan konverterade grupper (samma stabila id) läggs inte till igen, och en
 * profil med `competenciesMigrated: true` konverteras aldrig om.
 *
 * @returns {{ cvs: object[], changed: boolean }}
 */
export function convertLegacyPendingCompetencies(profile, createdAt = null) {
  const existing = Array.isArray(profile?.cvs) ? profile.cvs : []
  const legacy = Array.isArray(profile?.competencies) ? profile.competencies : []
  // Redan konverterad: arrayen ligger kvar orörd (rollback-säkert) men får
  // aldrig konverteras igen – annars kommer ett raderat CV tillbaka.
  if (legacy.length === 0 || profile?.competenciesMigrated === true) {
    return { cvs: existing, changed: false }
  }

  const taken = new Set(existing.map((cv) => cv?.id))
  const added = groupLegacyCompetencies(legacy)
    .filter((g) => !taken.has(g.id))
    .map((g) => ({ id: g.id, ...g.data, ...(createdAt ? { createdAt } : {}) }))
  return { cvs: [...existing, ...added], changed: true }
}

/** Lägger till en kompetens i ett CV (returnerar nytt CV-data-fragment). */
export function withCompetencyAdded(cv, competency) {
  const next = [...cvCompetencies(cv), cleanCompetency(competency)].filter(Boolean)
  return { competencies: next, competencyCount: next.length }
}

/** Tar bort kompetensen på index (returnerar nytt CV-data-fragment). */
export function withCompetencyRemoved(cv, index) {
  const next = cvCompetencies(cv).filter((_, i) => i !== index)
  return { competencies: next, competencyCount: next.length }
}

/**
 * Översätter ett Firestore-/nätverksfel till begriplig svenska. Rå SDK-text
 * ("Missing or insufficient permissions.") säger ingenting för en säljare.
 *
 * @param {unknown} err
 * @returns {string}
 */
export function describeCvError(err) {
  const code = err && typeof err === 'object' ? err.code : null
  const msg = err && typeof err === 'object' && typeof err.message === 'string' ? err.message : ''
  if (code === 'permission-denied' || /insufficient permissions/i.test(msg)) {
    return 'CV:n kunde inte hämtas – kontot saknar behörighet. Kontakta en administratör.'
  }
  if (code === 'unavailable' || /offline|network/i.test(msg)) {
    return 'CV:n kunde inte hämtas – ingen anslutning. Kontrollera nätverket och ladda om sidan.'
  }
  return msg || 'Något gick fel med CV:n. Försök igen.'
}
