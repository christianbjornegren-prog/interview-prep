import { describe, it, expect, vi } from 'vitest'
import {
  getCvFileType,
  validateCvFile,
  buildNewJobData,
  createJobFromPosting,
  MAX_CV_FILE_MB,
} from '../../src/lib/jobCreation.js'
import {
  CV_UPLOAD_STEPS,
  LINK_CV_STEPS,
  buildJobAnalysisSteps,
  buildJobCreateSteps,
  stepIndexAt,
} from '../../src/lib/progressSteps.js'

const pdf = (extra = {}) => ({ name: 'CV_Anna.pdf', type: 'application/pdf', size: 1000, ...extra })

describe('getCvFileType / validateCvFile', () => {
  it('känner igen pdf och docx via MIME eller filändelse', () => {
    expect(getCvFileType(pdf())).toBe('pdf')
    expect(getCvFileType({ name: 'a.PDF', type: '' })).toBe('pdf')
    expect(getCvFileType({ name: 'a.docx', type: '' })).toBe('docx')
    expect(getCvFileType({ name: 'a.txt', type: 'text/plain' })).toBeNull()
    expect(getCvFileType(null)).toBeNull()
  })
  it('validerar format och storlek', () => {
    expect(validateCvFile(pdf())).toBeNull()
    expect(validateCvFile({ name: 'a.txt' })).toMatch(/filformat/)
    expect(validateCvFile(pdf({ size: (MAX_CV_FILE_MB + 1) * 1024 * 1024 }))).toMatch(/för stor/)
    expect(validateCvFile(null)).toMatch(/Välj/)
  })
})

describe('buildNewJobData', () => {
  it('kopplar CV:t och tar med analysen', () => {
    const data = buildNewJobData(
      { jobTitle: 'Arkitekt', company: 'ICA', questions: [{ q: 1 }], requirements: [{ r: 1 }] },
      { jobText: ' Annons ', companyInfo: ' Info ', cv: { id: 'cv1', label: 'A', competencies: [{}, {}] }, now: () => 5 }
    )
    expect(data).toMatchObject({
      id: 'job_5', jobTitle: 'Arkitekt', company: 'ICA', rawJobText: 'Annons', companyInfo: 'Info',
      cvId: 'cv1', cvLabel: 'A', competencySnapshot: 2,
    })
  })
  it('utan CV: cvId null', () => {
    const data = buildNewJobData({}, { jobText: 'x' })
    expect(data.cvId).toBeNull()
    expect(data.cvLabel).toBe('')
    expect(data.questions).toEqual([])
  })
})

function deps(overrides = {}) {
  const calls = []
  return {
    calls,
    extract: vi.fn(async () => { calls.push('extract'); return [{ title: 'Azure' }] }),
    createCv: vi.fn(async (input) => { calls.push('createCv'); return { id: 'cvNew', label: 'CV_Anna', ...input } }),
    analyze: vi.fn(async () => { calls.push('analyze'); return { jobTitle: 'Roll', questions: [{ q: 1 }] } }),
    saveJob: vi.fn(async () => { calls.push('saveJob'); return 'docId' }),
    onPhase: vi.fn((p) => calls.push(`phase:${p}`)),
    ...overrides,
  }
}

describe('createJobFromPosting – nytt CV + uppdrag i ett svep', () => {
  it('tolkar och sparar CV:t FÖRE analysen, och analyserar mot just det CV:t', async () => {
    const d = deps()
    const res = await createJobFromPosting({ jobText: 'Annons', cvFile: pdf(), ...d })
    expect(d.calls).toEqual([
      'phase:cv', 'extract', 'phase:cv-save', 'createCv',
      'phase:job', 'analyze', 'phase:save', 'saveJob', 'phase:done',
    ])
    expect(d.analyze).toHaveBeenCalledWith('Annons', '', [{ title: 'Azure' }])
    expect(res.jobData.cvId).toBe('cvNew')
    expect(res.saved).toBe('docId')
  })

  it('ett nytt CV vinner över ett valt befintligt CV', async () => {
    const d = deps()
    const res = await createJobFromPosting({ jobText: 'A', cv: { id: 'old' }, cvFile: pdf(), ...d })
    expect(res.cv.id).toBe('cvNew')
  })

  it('befintligt CV: ingen uppladdning, analys mot dess kompetenser', async () => {
    const d = deps()
    const cv = { id: 'cv1', competencies: [{ title: 'Scrum' }] }
    await createJobFromPosting({ jobText: 'A', cv, ...d })
    expect(d.extract).not.toHaveBeenCalled()
    expect(d.analyze).toHaveBeenCalledWith('A', '', [{ title: 'Scrum' }])
    expect(d.saveJob.mock.calls[0][0].cvId).toBe('cv1')
  })

  it('utan CV: analys utan kompetenser, uppdraget sparas okopplat', async () => {
    const d = deps()
    await createJobFromPosting({ jobText: 'A', ...d })
    expect(d.analyze).toHaveBeenCalledWith('A', '', [])
    expect(d.saveJob.mock.calls[0][0].cvId).toBeNull()
  })

  it('analysfel efter sparat CV: felet bär CV:t så nästa försök inte laddar upp igen', async () => {
    const d = deps({ analyze: vi.fn(async () => { throw new Error('Claude nere') }) })
    const err = await createJobFromPosting({ jobText: 'A', cvFile: pdf(), ...d }).catch((e) => e)
    expect(err.message).toBe('Claude nere')
    expect(err.savedCv.id).toBe('cvNew')
    expect(d.saveJob).not.toHaveBeenCalled()
  })

  it('analysfel med befintligt CV: inget savedCv (inget nytt sparades)', async () => {
    const d = deps({ analyze: vi.fn(async () => { throw new Error('x') }) })
    const err = await createJobFromPosting({ jobText: 'A', cv: { id: 'c' }, ...d }).catch((e) => e)
    expect(err.savedCv).toBeUndefined()
  })

  it('fel vid CV-tolkning: inget sparas alls', async () => {
    const d = deps({ extract: vi.fn(async () => { throw new Error('trasig pdf') }) })
    await expect(createJobFromPosting({ jobText: 'A', cvFile: pdf(), ...d })).rejects.toThrow('trasig pdf')
    expect(d.createCv).not.toHaveBeenCalled()
    expect(d.saveJob).not.toHaveBeenCalled()
  })

  it('ogiltig fil stoppas innan något anrop görs', async () => {
    const d = deps()
    await expect(createJobFromPosting({ jobText: 'A', cvFile: { name: 'a.txt' }, ...d })).rejects.toThrow(/filformat/)
    expect(d.extract).not.toHaveBeenCalled()
  })

  it('tom annons stoppas direkt', async () => {
    const d = deps()
    await expect(createJobFromPosting({ jobText: '  ', ...d })).rejects.toThrow(/jobbannonsen/)
    expect(d.onPhase).not.toHaveBeenCalled()
  })
})

describe('progressSteps', () => {
  it('nytt CV ger CV-steg följt av uppdragssteg', () => {
    const steps = buildJobCreateSteps({ uploadCv: true })
    expect(steps.map((s) => s.phase)).toEqual(['cv', 'cv', 'cv', 'cv-save', 'job', 'job', 'job', 'job', 'save'])
    expect(steps.some((s) => /Matchar krav mot CV/.test(s.label))).toBe(true)
  })

  it('utan CV pratar stegen inte om CV-matchning', () => {
    const steps = buildJobCreateSteps({ uploadCv: false, hasCv: false })
    expect(steps.some((s) => /CV/.test(s.label))).toBe(false)
  })

  it('befintligt CV: inga CV-uppladdningssteg men CV-matchning', () => {
    const steps = buildJobCreateSteps({ hasCv: true })
    expect(steps[0].phase).toBe('job')
    expect(steps.some((s) => /Matchar krav mot CV/.test(s.label))).toBe(true)
  })

  it('understeg tickar fram på tid inom en fas', () => {
    const steps = buildJobAnalysisSteps()
    expect(stepIndexAt(steps, 'job', 0)).toBe(0)
    expect(stepIndexAt(steps, 'job', 7000)).toBe(1)
    expect(stepIndexAt(steps, 'job', 19000)).toBe(2)
  })

  it('springer ALDRIG förbi sin fas, hur lång tid det än tar', () => {
    const steps = buildJobAnalysisSteps()
    const lastJob = steps.map((s) => s.phase).lastIndexOf('job')
    expect(stepIndexAt(steps, 'job', 10 * 60 * 1000)).toBe(lastJob)
  })

  it('ny fas hoppar till sitt första steg', () => {
    const steps = buildJobCreateSteps({ uploadCv: true })
    expect(stepIndexAt(steps, 'cv-save', 0)).toBe(3)
    expect(stepIndexAt(steps, 'job', 0)).toBe(4)
  })

  it('done = alla klara; okänd/ingen fas = första steget', () => {
    expect(stepIndexAt(CV_UPLOAD_STEPS, 'done', 0)).toBe(CV_UPLOAD_STEPS.length)
    expect(stepIndexAt(CV_UPLOAD_STEPS, null, 99999)).toBe(0)
    expect(stepIndexAt(CV_UPLOAD_STEPS, 'cv', NaN)).toBe(0)
  })

  it('varje fas börjar på 0 ms och understegen är i stigande ordning', () => {
    ;[CV_UPLOAD_STEPS, LINK_CV_STEPS, buildJobCreateSteps({ uploadCv: true })].forEach((steps) => {
      const byPhase = {}
      steps.forEach((s) => { (byPhase[s.phase] ??= []).push(s.afterMs) })
      Object.values(byPhase).forEach((times) => {
        expect(times[0]).toBe(0)
        expect([...times].sort((a, b) => a - b)).toEqual(times)
      })
    })
  })
})
