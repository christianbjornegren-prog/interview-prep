/**
 * "Nytt uppdrag" som ett sammanhängande flöde:
 *   (1) ev. ett nytt CV tolkas och sparas,
 *   (2) uppdraget analyseras mot CV:t,
 *   (3) uppdraget sparas med CV:t kopplat.
 *
 * Ren orkestrering – Claude och Firestore injiceras, så ordningen och
 * felhanteringen kan enhetstestas (jobCreation.test.js).
 */
import { cvCompetencies, cvDisplayName } from './cvs'

/** CV-filer som stöds. Samma regler överallt där CV laddas upp. */
export const MAX_CV_FILE_MB = 20

/**
 * @param {{ name?: string, type?: string }} file
 * @returns {'pdf'|'docx'|null}
 */
export function getCvFileType(file) {
  const name = (file?.name ?? '').toLowerCase()
  // Vissa webbläsare rapporterar tom/fel MIME-typ vid drag-och-släpp –
  // falla tillbaka på filändelsen för BÅDA formaten.
  if (file?.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (
    file?.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) return 'docx'
  return null
}

/**
 * @returns {string|null} felmeddelande, eller null om filen är OK
 */
export function validateCvFile(file) {
  if (!file) return 'Välj en fil.'
  if (!getCvFileType(file)) return 'Otillåtet filformat. Ladda upp en PDF- eller DOCX-fil.'
  if ((file.size ?? 0) > MAX_CV_FILE_MB * 1024 * 1024) {
    return `Filen är för stor (max ${MAX_CV_FILE_MB} MB). Komprimera eller dela upp den.`
  }
  return null
}

/**
 * Bygger uppdragsdokumentet ur analysresultatet.
 * @param {object} result – från analyzeJobPosting
 * @param {{ jobText: string, companyInfo?: string, cv?: object|null, now?: () => number }} input
 */
export function buildNewJobData(result, { jobText, companyInfo = '', cv = null, now = Date.now }) {
  const r = result && typeof result === 'object' ? result : {}
  return {
    id: `job_${now()}`,
    jobTitle: r.jobTitle ?? '',
    company: r.company ?? '',
    summary: r.summary ?? '',
    quickFacts: r.quickFacts ?? null,
    sections: r.sections ?? [],
    rawJobText: String(jobText ?? '').trim(),
    companyInfo: String(companyInfo ?? '').trim(),
    questions: r.questions ?? [],
    requirements: r.requirements ?? [],
    competencySnapshot: cvCompetencies(cv).length,
    cvId: cv?.id ?? null,
    cvLabel: cv ? cvDisplayName(cv) : '',
  }
}

/**
 * Kör hela flödet.
 *
 * Felhantering: misslyckas analysen EFTER att ett nytt CV sparats, bär felet
 * med sig CV:t (`err.savedCv`). Sidan kan då välja det CV:t direkt så att ett
 * nytt försök inte laddar upp och tolkar samma fil en gång till.
 *
 * @param {{
 *   jobText: string, companyInfo?: string,
 *   cv?: object|null,            // befintligt CV som valts
 *   cvFile?: File|null,          // nytt CV att ladda upp (vinner över cv)
 *   extract: (file: File) => Promise<object[]>,
 *   createCv: (input: object) => Promise<object>,
 *   analyze: (jobText: string, companyInfo: string, competencies: object[]) => Promise<object>,
 *   saveJob: (jobData: object) => Promise<any>,
 *   onPhase?: (phase: 'cv'|'cv-save'|'job'|'save'|'done') => void,
 * }} deps
 * @returns {Promise<{ cv: object|null, jobData: object, saved: any }>}
 */
export async function createJobFromPosting({
  jobText, companyInfo = '', cv = null, cvFile = null,
  extract, createCv, analyze, saveJob, onPhase = () => {},
}) {
  if (!String(jobText ?? '').trim()) throw new Error('Klistra in jobbannonsen först.')

  let linkedCv = cv
  if (cvFile) {
    const invalid = validateCvFile(cvFile)
    if (invalid) throw new Error(invalid)
    onPhase('cv')
    const competencies = await extract(cvFile)
    onPhase('cv-save')
    linkedCv = await createCv({ fileName: cvFile.name, competencies, source: 'upload' })
  }

  onPhase('job')
  let result
  try {
    result = await analyze(jobText, companyInfo, cvCompetencies(linkedCv))
  } catch (err) {
    if (cvFile && linkedCv) err.savedCv = linkedCv
    throw err
  }

  onPhase('save')
  const jobData = buildNewJobData(result, { jobText, companyInfo, cv: linkedCv })
  let saved
  try {
    saved = await saveJob(jobData)
  } catch (err) {
    if (cvFile && linkedCv) err.savedCv = linkedCv
    throw err
  }
  onPhase('done')
  return { cv: linkedCv, jobData, saved }
}
