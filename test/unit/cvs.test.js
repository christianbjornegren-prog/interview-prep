import { describe, it, expect, vi } from 'vitest'
import {
  LEGACY_MANUAL_LABEL,
  stableHash,
  legacyCvId,
  generateCvId,
  cvLabelFromFileName,
  cvDisplayName,
  cleanCompetency,
  cvCompetencies,
  buildCvData,
  groupLegacyCompetencies,
  findCv,
  resolveJobCv,
  trainingReadiness,
  READINESS_MESSAGE,
  jobsUsingCv,
  cvUsageMap,
  toMillis,
  sortCvsNewestFirst,
  buildCvLinkUpdate,
  buildCvUnlinkUpdate,
  linkCvToJob,
  patchJobInList,
  patchCvInList,
  removeCvFromProfile,
  convertLegacyPendingCompetencies,
  withCompetencyAdded,
  withCompetencyRemoved,
  describeCvError,
} from '../../src/lib/cvs.js'

const CV_A = { id: 'cv_a', label: 'Arkitekt', competencies: [{ title: 'Azure' }, { title: 'TOGAF' }] }
const CV_B = { id: 'cv_b', label: 'Projektledare', competencies: [{ title: 'Scrum' }] }

describe('stableHash / legacyCvId', () => {
  it('är deterministisk', () => {
    expect(stableHash('a.pdf')).toBe(stableHash('a.pdf'))
    expect(legacyCvId('a.pdf')).toBe(legacyCvId('a.pdf'))
  })
  it('skiljer olika nycklar åt', () => {
    expect(legacyCvId('a.pdf')).not.toBe(legacyCvId('b.pdf'))
  })
  it('ger ett giltigt Firestore-dokument-id', () => {
    expect(legacyCvId('CV med/snedstreck.pdf')).toMatch(/^legacy_[0-9a-z]+$/)
  })
  it('tål null', () => {
    expect(typeof stableHash(null)).toBe('string')
  })
})

describe('generateCvId', () => {
  it('bygger id av tid och slump (injicerbart)', () => {
    expect(generateCvId(() => 36, () => 0)).toBe('cv_10_000000')
  })
  it('ger olika id:n vid olika slump', () => {
    expect(generateCvId(() => 1, () => 0.1)).not.toBe(generateCvId(() => 1, () => 0.2))
  })
})

describe('cvLabelFromFileName / cvDisplayName', () => {
  it('strippar filändelse', () => {
    expect(cvLabelFromFileName('CV_Anna.pdf')).toBe('CV_Anna')
    expect(cvLabelFromFileName('CV_Anna.DOCX')).toBe('CV_Anna')
  })
  it('faller tillbaka på "CV"', () => {
    expect(cvLabelFromFileName('')).toBe('CV')
    expect(cvLabelFromFileName(null)).toBe('CV')
  })
  it('label vinner över filnamn', () => {
    expect(cvDisplayName({ label: ' Arkitekt ', fileName: 'x.pdf' })).toBe('Arkitekt')
  })
  it('filnamn när label saknas', () => {
    expect(cvDisplayName({ fileName: 'x.pdf' })).toBe('x')
  })
  it('tål trasigt CV', () => {
    expect(cvDisplayName(null)).toBe('Namnlöst CV')
    expect(cvDisplayName({})).toBe('Namnlöst CV')
  })
})

describe('cleanCompetency', () => {
  it('tar bort docId, id och createdAt men behåller innehållet', () => {
    expect(
      cleanCompetency({ docId: 'd', id: 'i', createdAt: 'x', title: 'Azure', tags: ['a'], strength: 'Hög' })
    ).toEqual({ title: 'Azure', tags: ['a'], strength: 'Hög' })
  })
  it('tar bort undefined-värden (Firestore tål dem inte)', () => {
    expect(cleanCompetency({ title: 'A', impact: undefined })).toEqual({ title: 'A' })
  })
  it('returnerar null för skräp', () => {
    expect(cleanCompetency(null)).toBeNull()
    expect(cleanCompetency('x')).toBeNull()
  })
})

describe('cvCompetencies', () => {
  it('returnerar listan', () => {
    expect(cvCompetencies(CV_A)).toHaveLength(2)
  })
  it('kastar aldrig', () => {
    expect(cvCompetencies(null)).toEqual([])
    expect(cvCompetencies({ competencies: 'nej' })).toEqual([])
    expect(cvCompetencies({ competencies: [null, { title: 'A' }] })).toEqual([{ title: 'A' }])
  })
})

describe('buildCvData', () => {
  it('bygger ett CV med städade kompetenser och antal', () => {
    const data = buildCvData({
      fileName: 'CV_Anna.pdf',
      competencies: [{ title: 'Azure', createdAt: 'x' }, null],
    })
    expect(data).toEqual({
      fileName: 'CV_Anna.pdf',
      label: 'CV_Anna',
      source: 'upload',
      competencies: [{ title: 'Azure' }],
      competencyCount: 1,
    })
  })
  it('egen label vinner', () => {
    expect(buildCvData({ fileName: 'a.pdf', label: 'Arkitekt' }).label).toBe('Arkitekt')
  })
  it('tål tomt anrop', () => {
    expect(buildCvData().competencies).toEqual([])
  })
})

describe('groupLegacyCompetencies', () => {
  const legacy = [
    { docId: 'c1', title: 'Azure', sourceFile: 'a.pdf' },
    { docId: 'c2', title: 'Ledarskap' },
    { docId: 'c3', title: 'React', sourceFile: 'a.pdf' },
    { docId: 'c4', title: 'Scrum', sourceFile: 'b.pdf' },
  ]

  it('grupperar på källfil i ordning för första förekomst', () => {
    const groups = groupLegacyCompetencies(legacy)
    expect(groups.map((g) => g.groupKey)).toEqual(['a.pdf', '__manual__', 'b.pdf'])
  })

  it('varje kompetens hamnar i exakt ett CV (inget tappas)', () => {
    const groups = groupLegacyCompetencies(legacy)
    const total = groups.reduce((n, g) => n + g.data.competencies.length, 0)
    expect(total).toBe(legacy.length)
    expect(groups.flatMap((g) => g.sourceDocIds).sort()).toEqual(['c1', 'c2', 'c3', 'c4'])
  })

  it('manuella kompetenser får en egen tydlig grupp', () => {
    const manual = groupLegacyCompetencies(legacy).find((g) => g.groupKey === '__manual__')
    expect(manual.data.label).toBe(LEGACY_MANUAL_LABEL)
    expect(manual.data.fileName).toBe('')
  })

  it('CV:n märks som legacy och strippar docId', () => {
    const a = groupLegacyCompetencies(legacy)[0]
    expect(a.data.source).toBe('legacy')
    expect(a.data.competencies[0]).toEqual({ title: 'Azure', sourceFile: 'a.pdf' })
  })

  it('stabila id:n – samma indata ger samma CV-id (ingen dubblett vid omkörning)', () => {
    expect(groupLegacyCompetencies(legacy).map((g) => g.id)).toEqual(
      groupLegacyCompetencies(legacy).map((g) => g.id)
    )
  })

  it('tomt/trasigt underlag ger inga grupper', () => {
    expect(groupLegacyCompetencies(null)).toEqual([])
    expect(groupLegacyCompetencies([null, 'x'])).toEqual([])
  })
})

describe('resolveJobCv', () => {
  it('linked när CV:t finns', () => {
    expect(resolveJobCv({ cvId: 'cv_a' }, [CV_A, CV_B])).toEqual({ status: 'linked', cv: CV_A })
  })
  it('none när uppdraget saknar CV (äldre uppdrag)', () => {
    expect(resolveJobCv({}, [CV_A]).status).toBe('none')
    expect(resolveJobCv({ cvId: null }, [CV_A]).status).toBe('none')
    expect(resolveJobCv({ cvId: '' }, [CV_A]).status).toBe('none')
  })
  it('missing när CV:t har raderats', () => {
    expect(resolveJobCv({ cvId: 'borta' }, [CV_A])).toEqual({ status: 'missing', cv: null })
  })
  it('tål null-uppdrag och null-lista', () => {
    expect(resolveJobCv(null, null).status).toBe('none')
    expect(resolveJobCv({ cvId: 'cv_a' }, null).status).toBe('missing')
  })
  it('findCv utan id ger null', () => {
    expect(findCv([CV_A], null)).toBeNull()
  })
})

describe('trainingReadiness – CV krävs innan träning', () => {
  const questions = [{ question: 'Q' }]
  it('redo när CV finns och frågor finns', () => {
    expect(trainingReadiness({ cvId: 'cv_a', questions }, [CV_A])).toEqual({ ready: true, reason: null })
  })
  it('spärrad utan CV', () => {
    expect(trainingReadiness({ questions }, [CV_A])).toEqual({ ready: false, reason: 'no-cv' })
  })
  it('spärrad när CV:t raderats', () => {
    expect(trainingReadiness({ cvId: 'x', questions }, [CV_A]).reason).toBe('cv-missing')
  })
  it('spärrad utan frågor', () => {
    expect(trainingReadiness({ cvId: 'cv_a', questions: [] }, [CV_A]).reason).toBe('no-questions')
  })
  it('CV-kravet prövas före frågorna', () => {
    expect(trainingReadiness({}, []).reason).toBe('no-cv')
  })
  it('varje orsak har ett vägledande meddelande', () => {
    ;['no-cv', 'cv-missing', 'no-questions'].forEach((r) => {
      expect(typeof READINESS_MESSAGE[r]).toBe('string')
      expect(READINESS_MESSAGE[r].length).toBeGreaterThan(10)
    })
  })
})

describe('jobsUsingCv / cvUsageMap', () => {
  const jobs = [
    { docId: 'j1', cvId: 'cv_a' },
    { docId: 'j2', cvId: 'cv_a' },
    { docId: 'j3', cvId: 'cv_b' },
    { docId: 'j4' },
    null,
  ]
  it('ett CV kan ha flera uppdrag', () => {
    expect(jobsUsingCv('cv_a', jobs).map((j) => j.docId)).toEqual(['j1', 'j2'])
  })
  it('uppdrag utan CV räknas aldrig', () => {
    expect(jobsUsingCv(null, jobs)).toEqual([])
    expect(jobsUsingCv(undefined, jobs)).toEqual([])
  })
  it('karta per CV, även oanvända', () => {
    const map = cvUsageMap([CV_A, CV_B, { id: 'cv_c' }], jobs)
    expect(map.cv_a).toHaveLength(2)
    expect(map.cv_b).toHaveLength(1)
    expect(map.cv_c).toEqual([])
  })
})

describe('toMillis / sortCvsNewestFirst', () => {
  it('läser Timestamp, Date, tal och {seconds}', () => {
    expect(toMillis({ toMillis: () => 5 })).toBe(5)
    expect(toMillis(new Date(7))).toBe(7)
    expect(toMillis(9)).toBe(9)
    expect(toMillis({ seconds: 2 })).toBe(2000)
    expect(toMillis(null)).toBe(0)
  })
  it('nyaste först, saknad tid sist', () => {
    const sorted = sortCvsNewestFirst([
      { id: 'old', createdAt: 1 },
      { id: 'none' },
      { id: 'new', createdAt: 3 },
    ])
    expect(sorted.map((c) => c.id)).toEqual(['new', 'old', 'none'])
  })
  it('muterar inte indata', () => {
    const input = [{ id: 'a', createdAt: 1 }, { id: 'b', createdAt: 2 }]
    sortCvsNewestFirst(input)
    expect(input[0].id).toBe('a')
  })
})

describe('buildCvLinkUpdate', () => {
  const analysis = {
    requirements: [{ requirement: 'Azure', importance: 'hög', match: 'stark' }],
    summary: 'Ny sammanfattning',
    sections: [{ heading: 'H', points: [] }],
    quickFacts: { kund: 'K' },
    questions: [{ question: 'Ny', category: 'erfarenhet' }],
  }

  it('sätter cvId och skriver om hela analysen mot CV:t', () => {
    const u = buildCvLinkUpdate(CV_A, analysis)
    expect(u.cvId).toBe('cv_a')
    expect(u.cvLabel).toBe('Arkitekt')
    expect(u.requirements).toEqual(analysis.requirements)
    expect(u.questions).toEqual(analysis.questions)
    expect(u.competencySnapshot).toBe(2)
  })

  it('nollställer engelska frågor så de skapas om mot rätt CV', () => {
    const u = buildCvLinkUpdate(CV_A, analysis, { questionsEn: [{ q: 1 }], jobTitleEn: 'X' })
    expect(u.questionsEn).toEqual([])
    expect(u.jobTitleEn).toBe('')
  })

  it('rör aldrig rolltitel eller kund', () => {
    const u = buildCvLinkUpdate(CV_A, { ...analysis, jobTitle: 'Annan', company: 'Annan' })
    expect('jobTitle' in u).toBe(false)
    expect('company' in u).toBe(false)
  })

  it('behåller gamla frågor om analysen inte gav några', () => {
    const old = [{ question: 'Gammal' }]
    expect(buildCvLinkUpdate(CV_A, { ...analysis, questions: [] }, { questions: old }).questions).toEqual(old)
  })

  it('enum-värden passerar orörda (datakontraktet är svenskt)', () => {
    expect(buildCvLinkUpdate(CV_A, analysis).requirements[0]).toEqual({
      requirement: 'Azure', importance: 'hög', match: 'stark',
    })
  })

  it('tål trasig analys utan att kasta', () => {
    const u = buildCvLinkUpdate(CV_A, null, { summary: 'S' })
    expect(u.requirements).toEqual([])
    expect(u.summary).toBe('S')
    expect(u.quickFacts).toBeNull()
  })

  it('unlink nollställer bara kopplingen', () => {
    expect(buildCvUnlinkUpdate()).toEqual({ cvId: null, cvLabel: '' })
  })
})

describe('linkCvToJob', () => {
  const job = { docId: 'j1', rawJobText: 'Annons', companyInfo: 'Info', questions: [] }

  it('analyserar mot ENBART det valda CV:ts kompetenser och sparar', async () => {
    const analyze = vi.fn(async () => ({ requirements: [], questions: [{ question: 'Q' }] }))
    const save = vi.fn(async () => {})
    const update = await linkCvToJob({ job, cv: CV_B, analyze, save })
    expect(analyze).toHaveBeenCalledWith('Annons', 'Info', CV_B.competencies)
    expect(save).toHaveBeenCalledWith('j1', update)
    expect(update.cvId).toBe('cv_b')
  })

  it('sparar INTE kopplingen om analysen misslyckas (aldrig i otakt)', async () => {
    const analyze = vi.fn(async () => { throw new Error('Claude nere') })
    const save = vi.fn()
    await expect(linkCvToJob({ job, cv: CV_A, analyze, save })).rejects.toThrow('Claude nere')
    expect(save).not.toHaveBeenCalled()
  })

  it('rapporterar faserna i rätt ordning (för stegvisningen)', async () => {
    const phases = []
    await linkCvToJob({
      job, cv: CV_A, analyze: async () => ({}), save: async () => {}, onPhase: (p) => phases.push(p),
    })
    expect(phases).toEqual(['job', 'save', 'done'])
  })

  it('faller tillbaka på summary om annonstexten saknas', async () => {
    const analyze = vi.fn(async () => ({}))
    await linkCvToJob({ job: { docId: 'j', summary: 'Sammanfattning' }, cv: CV_A, analyze, save: async () => {} })
    expect(analyze.mock.calls[0][0]).toBe('Sammanfattning')
  })

  it('kräver uppdrag, CV och text', async () => {
    const deps = { analyze: async () => ({}), save: async () => {} }
    await expect(linkCvToJob({ ...deps, job: {}, cv: CV_A })).rejects.toThrow()
    await expect(linkCvToJob({ ...deps, job, cv: null })).rejects.toThrow()
    await expect(linkCvToJob({ ...deps, job: { docId: 'j' }, cv: CV_A })).rejects.toThrow()
  })
})

describe('väntande profiler (arrayer)', () => {
  it('patchJobInList ändrar bara rätt uppdrag', () => {
    const jobs = [{ id: 'a', x: 1 }, { id: 'b', x: 1 }]
    expect(patchJobInList(jobs, 'b', { x: 2 })).toEqual([{ id: 'a', x: 1 }, { id: 'b', x: 2 }])
  })

  it('patchCvInList ändrar bara rätt CV', () => {
    expect(patchCvInList([CV_A, CV_B], 'cv_a', { label: 'Ny' })[0].label).toBe('Ny')
    expect(patchCvInList([CV_A, CV_B], 'cv_a', { label: 'Ny' })[1]).toBe(CV_B)
  })

  it('removeCvFromProfile raderar CV:t och kopplar loss dess uppdrag i samma veva', () => {
    const next = removeCvFromProfile(
      { cvs: [CV_A, CV_B], jobs: [{ id: 'j1', cvId: 'cv_a' }, { id: 'j2', cvId: 'cv_b' }] },
      'cv_a'
    )
    expect(next.cvs).toEqual([CV_B])
    expect(next.jobs[0].cvId).toBeNull()
    expect(next.jobs[1].cvId).toBe('cv_b')
  })

  it('removeCvFromProfile tål saknade listor', () => {
    expect(removeCvFromProfile({}, 'x')).toEqual({ cvs: [], jobs: [] })
  })

  it('convertLegacyPendingCompetencies gör om samlad array till CV:n', () => {
    const { cvs, changed } = convertLegacyPendingCompetencies(
      { cvs: [CV_A], competencies: [{ title: 'X', sourceFile: 'x.pdf' }] },
      'nu'
    )
    expect(changed).toBe(true)
    expect(cvs).toHaveLength(2)
    expect(cvs[1]).toMatchObject({ fileName: 'x.pdf', source: 'legacy', createdAt: 'nu' })
  })

  it('convertLegacyPendingCompetencies är idempotent', () => {
    const first = convertLegacyPendingCompetencies({ competencies: [{ title: 'X' }] })
    const again = convertLegacyPendingCompetencies({ cvs: first.cvs, competencies: [{ title: 'X' }] })
    expect(again.cvs).toHaveLength(1)
  })

  it('redan konverterad profil (flagga) konverteras aldrig igen', () => {
    expect(convertLegacyPendingCompetencies({ cvs: [], competencies: [{ title: 'X' }], competenciesMigrated: true }))
      .toEqual({ cvs: [], changed: false })
  })

  it('inget att konvertera → oförändrat', () => {
    expect(convertLegacyPendingCompetencies({ cvs: [CV_A] })).toEqual({ cvs: [CV_A], changed: false })
  })
})

describe('kompetenser inom ett CV', () => {
  it('lägger till och uppdaterar antalet', () => {
    expect(withCompetencyAdded(CV_B, { title: 'Kanban', createdAt: 'x' })).toEqual({
      competencies: [{ title: 'Scrum' }, { title: 'Kanban' }],
      competencyCount: 2,
    })
  })
  it('tar bort på index och uppdaterar antalet', () => {
    expect(withCompetencyRemoved(CV_A, 0)).toEqual({
      competencies: [{ title: 'TOGAF' }],
      competencyCount: 1,
    })
  })
  it('index utanför listan ändrar ingenting', () => {
    expect(withCompetencyRemoved(CV_A, 9).competencyCount).toBe(2)
  })
})

describe('describeCvError', () => {
  it('behörighetsfel blir begriplig svenska (inte rå SDK-text)', () => {
    expect(describeCvError({ code: 'permission-denied', message: 'Missing or insufficient permissions.' }))
      .toMatch(/saknar behörighet/)
    expect(describeCvError(new Error('Missing or insufficient permissions.'))).toMatch(/saknar behörighet/)
  })
  it('nätverksfel', () => {
    expect(describeCvError({ code: 'unavailable' })).toMatch(/ingen anslutning/)
  })
  it('övriga fel behåller sitt meddelande', () => {
    expect(describeCvError(new Error('CV:t finns inte längre.'))).toBe('CV:t finns inte längre.')
  })
  it('tål skräp', () => {
    expect(describeCvError(null)).toMatch(/Något gick fel/)
  })
})
