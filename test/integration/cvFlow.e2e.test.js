/**
 * END-TO-END: CV per uppdrag, på riktigt.
 *
 *   - RIKTIGA Claude-anrop (CV-tolkning, uppdragsanalys, feedback) – nyckeln
 *     läses från .env.local. Kostar några anrop per körning.
 *   - RIKTIG Firestore (emulatorn) med de RIKTIGA säkerhetsreglerna, och
 *     varje steg körs som den roll som gör det i appen (säljare/konsult).
 *   - Appens EGNA moduler körs: cvStore, jobCreation, cvs.linkCvToJob,
 *     pendingHandover (samma kod som AuthGate) och claude.js.
 *
 * Det enda som byts ut är lib/firebase.js, som pekar på emulatorn med
 * inloggad roll i stället för produktion.
 *
 * Kör: npm run test:e2e   (kräver Java/Firestore-emulatorn + VITE_CLAUDE_API_KEY)
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import * as fs from 'firebase/firestore'
import JSZip from 'jszip'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')

// ── Claude-nyckeln från .env.local ────────────────────────────────────────
function readEnvLocal() {
  const p = resolve(root, '.env.local')
  if (!existsSync(p)) return {}
  return Object.fromEntries(
    readFileSync(p, 'utf8').split('\n')
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
      .filter(Boolean)
      .map(([, k, v]) => [k, v.replace(/^['"]|['"]$/g, '')])
  )
}
const CLAUDE_KEY = readEnvLocal().VITE_CLAUDE_API_KEY
vi.stubEnv('VITE_CLAUDE_API_KEY', CLAUDE_KEY ?? '')

// ── lib/firebase.js → emulatorn, som den roll testet just nu agerar som ──
let currentDb = null
vi.mock('../../src/lib/firebase.js', async () => {
  const real = await vi.importActual('firebase/firestore')
  return {
    ...real,
    get db() { return currentDb },
    auth: { currentUser: null },
  }
})

// mammoth: appen körs i webbläsaren där Vite väljer mammoths browser-bygge
// (som tar { arrayBuffer }). Node-bygget vill ha { buffer } – översätt bara
// argumentet, själva DOCX-tolkningen är densamma.
vi.mock('mammoth', async () => {
  const real = (await vi.importActual('mammoth')).default
  const extractRawText = (input) =>
    real.extractRawText(input?.arrayBuffer ? { buffer: Buffer.from(input.arrayBuffer) } : input)
  return { default: { ...real, extractRawText }, extractRawText }
})

const { createUserCvStore, createPendingCvStore } = await import('../../src/lib/cvStore.js')
const { createJobFromPosting, getCvFileType } = await import('../../src/lib/jobCreation.js')
const { linkCvToJob, trainingReadiness, resolveJobCv, cvCompetencies } = await import('../../src/lib/cvs.js')
const { migratePendingProfile } = await import('../../src/lib/pendingHandover.js')
const { extractCompetencies, analyzeJobPosting, analyzeInterviewFeedback } = await import('../../src/lib/claude.js')

// ── Testdata: två CV:n för samma person, olika profiler ───────────────────
async function makeDocx(name, paragraphs) {
  const zip = new JSZip()
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>')
  zip.file('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>')
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  zip.file('word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${esc(p)}</w:t></w:r></w:p>`).join('') +
    '</w:body></w:document>')
  const buf = await zip.generateAsync({ type: 'uint8array' })
  return new File([buf], name, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}

const ANDROID_CV = [
  'Anna Testsson – Senior Android-utvecklare',
  'Sammanfattning: 9 års erfarenhet av native Android-utveckling i Kotlin.',
  'ICA Banken (2021–2024): Byggde om bankappen med Jetpack Compose, MVVM och Kotlin Coroutines. Ledde migreringen från XML-vyer till Compose för 1,2 miljoner användare.',
  'Spotify (2018–2021): Android-utvecklare i playback-teamet. Kotlin, Dagger/Hilt, Retrofit, Room, enhetstester med JUnit och Espresso.',
  'Tekniker: Kotlin, Java, Jetpack Compose, Coroutines, Flow, Hilt, Retrofit, Room, Gradle, Firebase, CI/CD med GitHub Actions.',
  'Utbildning: Civilingenjör datateknik, KTH.',
]
const PM_CV = [
  'Anna Testsson – Projektledare och agil coach',
  'Sammanfattning: Leder digitala utvecklingsprojekt med fokus på agila arbetssätt.',
  'Region Stockholm (2020–2024): Projektledare för införandet av ett nytt journalsystem. Budget 40 MSEK, 25 personer.',
  'Telia (2016–2020): Scrum Master för tre team. Införde SAFe och förbättrade leveransprecisionen.',
  'Kompetenser: Projektledning, PMP, SAFe, Scrum, intressenthantering, budgetansvar, förändringsledning.',
]
const JOB_TEXT = [
  'Senior Android-utvecklare till Truecaller',
  'Vi söker en senior Android-utvecklare som vill bygga framtidens kommunikationsapp.',
  'Krav: Minst 5 års erfarenhet av Android-utveckling i Kotlin. Gedigen erfarenhet av Jetpack Compose.',
  'Erfarenhet av Coroutines och Flow. Erfarenhet av testautomation.',
  'Meriterande: Erfarenhet av appar med miljontals användare. Erfarenhet av Kotlin Multiplatform.',
  'Uppdraget är på heltid i Stockholm, start omgående, 12 månader.',
].join('\n')

// ── Miljö ─────────────────────────────────────────────────────────────────
const KONSULT = 'e2e_konsult'
const SALJARE = 'e2e_saljare'
const PENDING_EMAIL = 'ny.konsult@boulder.se'
let testEnv
const as = (uid, email) => {
  currentDb = testEnv.authenticatedContext(uid, email ? { email } : undefined).firestore()
  return currentDb
}

const [host, portStr] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-intervjucoach',
    firestore: { rules: readFileSync(resolve(root, 'firestore.rules'), 'utf8'), host, port: Number(portStr) },
  })
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await fs.setDoc(fs.doc(db, 'users', KONSULT), { role: 'konsult', email: 'k@boulder.se' })
    await fs.setDoc(fs.doc(db, 'users', SALJARE), { role: 'saljare', email: 's@boulder.se' })
  })
})

afterAll(async () => { await testEnv?.cleanup() })

const claude = CLAUDE_KEY ? describe : describe.skip
const LONG = 240_000
const extract = (file) => extractCompetencies(file, getCvFileType(file))
const log = (...a) => console.log('   ›', ...a)

claude('E2E: säljaren skapar uppdrag + laddar upp CV i ETT svep (aktiv konsult)', () => {
  let store, jobId, androidCv

  it('Nytt uppdrag med nytt CV: CV tolkas, sparas, uppdraget analyseras mot det och kopplas', async () => {
    as(SALJARE)
    store = createUserCvStore(KONSULT)
    const phases = []
    const stamps = []
    const cvFile = await makeDocx('CV_Anna_Android.docx', ANDROID_CV)

    const { cv, jobData, saved } = await createJobFromPosting({
      jobText: JOB_TEXT,
      cvFile,
      extract,
      createCv: (input) => store.create(input),
      analyze: (t, i, c) => analyzeJobPosting(t, i, c),
      saveJob: async (data) => {
        const ref = await fs.addDoc(fs.collection(currentDb, 'users', KONSULT, 'jobs'), {
          ...data, createdAt: fs.serverTimestamp(),
        })
        return ref.id
      },
      onPhase: (p) => phases.push(p) && stamps.push([p, Date.now()]),
    })
    jobId = saved
    log(`tid per fas: ${stamps.slice(0, -1).map(([p, t], i) => `${p} ${Math.round((stamps[i + 1][1] - t) / 1000)}s`).join(', ')}`)
    androidCv = cv

    log(`faser: ${phases.join(' → ')}`)
    log(`CV "${cv.label}": ${cv.competencyCount} kompetenser`)
    log(`uppdrag: ${jobData.jobTitle} · ${jobData.company} · ${jobData.requirements.length} krav · ${jobData.questions.length} frågor`)

    expect(phases).toEqual(['cv', 'cv-save', 'job', 'save', 'done'])
    expect(cv.competencyCount).toBeGreaterThanOrEqual(5)
    expect(jobData.cvId).toBe(cv.id)
    expect(jobData.requirements.length).toBeGreaterThan(0)
    expect(jobData.questions.length).toBeGreaterThan(0)
    // Datakontraktet: svenska enum-värden
    for (const r of jobData.requirements) {
      expect(['stark', 'delvis', 'svag']).toContain(r.match)
      expect(['hög', 'medel', 'låg']).toContain(r.importance)
    }
  }, LONG)

  it('Android-CV mot Android-uppdrag ger flera starka matchningar', async () => {
    as(SALJARE)
    const job = (await fs.getDoc(fs.doc(currentDb, 'users', KONSULT, 'jobs', jobId))).data()
    const strong = job.requirements.filter((r) => r.match === 'stark').length
    log(`stark matchning: ${strong} av ${job.requirements.length}`)
    expect(strong).toBeGreaterThanOrEqual(2)
  })

  it('CV:t syns i listan och träningen är upplåst', async () => {
    as(SALJARE)
    const cvs = await store.list()
    const job = { docId: jobId, ...(await fs.getDoc(fs.doc(currentDb, 'users', KONSULT, 'jobs', jobId))).data() }
    expect(cvs.map((c) => c.id)).toContain(androidCv.id)
    expect(trainingReadiness(job, cvs)).toEqual({ ready: true, reason: null })
  })

  it('Byte till projektledar-CV: analysen görs om, matchningen sjunker, engelska frågor nollställs', async () => {
    as(SALJARE)
    const pmCv = await store.create({
      fileName: 'CV_Anna_PL.docx',
      competencies: await extract(await makeDocx('CV_Anna_PL.docx', PM_CV)),
    })
    const ref = fs.doc(currentDb, 'users', KONSULT, 'jobs', jobId)
    await fs.updateDoc(ref, { questionsEn: [{ question: 'old' }], jobTitleEn: 'Old' })
    const before = (await fs.getDoc(ref)).data()

    const phases = []
    await linkCvToJob({
      job: { docId: jobId, ...before },
      cv: pmCv,
      analyze: (t, i, c) => analyzeJobPosting(t, i, c),
      save: (id, u) => store.saveJob(id, u),
      onPhase: (p) => phases.push(p),
    })
    const after = (await fs.getDoc(ref)).data()
    const strongBefore = before.requirements.filter((r) => r.match === 'stark').length
    const strongAfter = after.requirements.filter((r) => r.match === 'stark').length
    log(`stark före (Android-CV): ${strongBefore}, efter (PL-CV): ${strongAfter}`)

    expect(phases).toEqual(['job', 'save', 'done'])
    expect(after.cvId).toBe(pmCv.id)
    expect(after.questionsEn).toEqual([])
    expect(after.jobTitleEn).toBe('')
    expect(after.jobTitle).toBe(before.jobTitle)
    expect(strongAfter).toBeLessThan(strongBefore)
  }, LONG)

  it('Feedback-analysen fungerar mot det kopplade CV:ts kompetenser', async () => {
    as(KONSULT)
    const cv = await createUserCvStore(KONSULT).get(androidCv.id)
    const fb = await analyzeInterviewFeedback(
      [{ question: 'Berätta om din erfarenhet av Jetpack Compose.', answer: 'På ICA Banken ledde jag migreringen av bankappen från XML till Compose för över en miljon användare. Vi införde MVVM och Coroutines.' }],
      'Senior Android-utvecklare', 'Truecaller', cvCompetencies(cv), { focus: 'Mix', difficulty: 'Standard', language: 'sv' }
    )
    log(`feedback: betyg ${fb.overallScore}/10`)
    expect(fb.overallScore).toBeGreaterThanOrEqual(1)
    expect(fb.overallScore).toBeLessThanOrEqual(10)
  }, LONG)

  it('Radera CV som används: uppdraget kopplas loss och träningen spärras', async () => {
    as(KONSULT)
    const own = createUserCvStore(KONSULT)
    const job = (await fs.getDoc(fs.doc(currentDb, 'users', KONSULT, 'jobs', jobId))).data()
    const unlinked = await own.remove(job.cvId)
    const after = { docId: jobId, ...(await fs.getDoc(fs.doc(currentDb, 'users', KONSULT, 'jobs', jobId))).data() }
    expect(unlinked).toBe(1)
    expect(after.cvId).toBeNull()
    expect(trainingReadiness(after, await own.list()).reason).toBe('no-cv')
  })
})

claude('E2E: väntande profil → konsulten loggar in (överlämningen)', () => {
  it('säljaren förbereder CV + uppdrag; kopplingen överlever inloggningen', async () => {
    as(SALJARE)
    await fs.setDoc(fs.doc(currentDb, 'pendingProfiles', PENDING_EMAIL), {
      name: 'Ny Konsult', email: PENDING_EMAIL, createdAt: fs.serverTimestamp(), cvs: [], jobs: [],
    })
    const pending = createPendingCvStore(PENDING_EMAIL)

    // Samma flöde som JobCreate i pending-läge
    const { cv } = await createJobFromPosting({
      jobText: JOB_TEXT,
      cvFile: await makeDocx('CV_Ny.docx', ANDROID_CV),
      extract,
      createCv: (input) => pending.create(input),
      analyze: (t, i, c) => analyzeJobPosting(t, i, c),
      saveJob: (data) => fs.updateDoc(fs.doc(currentDb, 'pendingProfiles', PENDING_EMAIL), {
        jobs: fs.arrayUnion({ ...data, createdAt: fs.Timestamp.now() }),
      }),
    })
    log(`väntande CV ${cv.id} med ${cv.competencyCount} kompetenser`)

    // Konsulten loggar in → exakt AuthGates överlämningskod
    const NEW_UID = 'e2e_ny_konsult'
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await fs.setDoc(fs.doc(ctx.firestore(), 'users', NEW_UID), { role: 'konsult', email: PENDING_EMAIL })
    })
    as(NEW_UID, PENDING_EMAIL)
    expect(await migratePendingProfile(NEW_UID, PENDING_EMAIL)).toBe(true)

    const cvs = await createUserCvStore(NEW_UID).list()
    const jobs = (await fs.getDocs(fs.collection(currentDb, 'users', NEW_UID, 'jobs'))).docs
      .map((d) => ({ docId: d.id, ...d.data() }))
    expect(cvs.map((c) => c.id)).toEqual([cv.id])
    expect(jobs).toHaveLength(1)
    expect(resolveJobCv(jobs[0], cvs).status).toBe('linked')
    expect(trainingReadiness(jobs[0], cvs).ready).toBe(true)
    // Pending-dokumentet är borta
    as(SALJARE)
    expect((await fs.getDoc(fs.doc(currentDb, 'pendingProfiles', PENDING_EMAIL))).exists()).toBe(false)
  }, LONG)
})

describe('E2E: befintlig konsult med gammal samlad kompetensbank (utan Claude)', () => {
  it('säljaren öppnar profilen → banken blir CV:n per fil, inget tappas, inga dubbletter', async () => {
    const UID = 'e2e_legacy'
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await fs.setDoc(fs.doc(db, 'users', UID), { role: 'konsult', email: 'l@boulder.se' })
      const comps = [
        { title: 'Azure', sourceFile: 'CV_2023.pdf' },
        { title: 'TOGAF', sourceFile: 'CV_2023.pdf' },
        { title: 'Scrum', sourceFile: 'CV_PL.pdf' },
        { title: 'Ledarskap' },
      ]
      for (const [i, c] of comps.entries()) {
        await fs.setDoc(fs.doc(db, 'users', UID, 'competencies', `c${i}`), { ...c, createdAt: fs.Timestamp.now() })
      }
      await fs.setDoc(fs.doc(db, 'users', UID, 'jobs', 'old'), { jobTitle: 'Gammalt uppdrag', questions: [{ q: 1 }] })
    })

    as(SALJARE)
    const store = createUserCvStore(UID)
    // Två "samtidiga" öppningar (konsult + säljare) får inte dubblera
    const [a, b] = await Promise.all([store.list(), createUserCvStore(UID).list()])
    const cvs = await store.list()
    log(`CV:n: ${cvs.map((c) => `${c.label} (${c.competencyCount})`).join(', ')}`)

    expect(cvs).toHaveLength(3)
    expect(cvs.reduce((n, c) => n + c.competencyCount, 0)).toBe(4)
    expect(a.length + b.length).toBeGreaterThan(0)
    // Rollback-säkert: originalen ligger kvar, alla märkta som flyttade
    const originals = await fs.getDocs(fs.collection(currentDb, 'users', UID, 'competencies'))
    expect(originals.size).toBe(4)
    expect(originals.docs.every((d) => typeof d.data().migratedToCvId === 'string')).toBe(true)

    const old = { docId: 'old', ...(await fs.getDoc(fs.doc(currentDb, 'users', UID, 'jobs', 'old'))).data() }
    expect(trainingReadiness(old, cvs).reason).toBe('no-cv')
  })

  it('en annan konsult kan inte läsa CV:na (reglerna gäller även i flödet)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await fs.setDoc(fs.doc(ctx.firestore(), 'users', 'e2e_other'), { role: 'konsult', email: 'o@boulder.se' })
    })
    as('e2e_other')
    const err = await createUserCvStore('e2e_legacy').list().catch((e) => e)
    expect(err?.code).toBe('permission-denied')
  })
})
