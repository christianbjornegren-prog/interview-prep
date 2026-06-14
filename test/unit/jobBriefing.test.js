import { describe, it, expect } from 'vitest'
import { deriveGapBuckets, resolveRequirements, coverageFromJob } from '../../src/lib/gapAnalysis.js'
import { cleanJobDescription, resolveQuickFacts, parseJobDescription } from '../../src/lib/jobDescription.js'

// Bygg ett krav för en (match, importance)-kombination
const req = (match, importance) => ({ requirement: `${match}-${importance}`, importance, match })

describe('deriveGapBuckets – alla match/importance-kombinationer', () => {
  const all = []
  for (const importance of ['hög', 'medel', 'låg']) {
    for (const match of ['stark', 'delvis', 'svag']) all.push(req(match, importance))
  }
  const b = deriveGapBuckets(all)

  it('styrkor = alla med stark matchning', () => {
    expect(b.styrkor.map((r) => r.requirement).sort())
      .toEqual(['stark-hög', 'stark-medel', 'stark-låg'].sort())
  })

  it('prioritera = svag matchning & viktigt (hög|medel)', () => {
    expect(b.prioritera.map((r) => r.requirement).sort())
      .toEqual(['svag-hög', 'svag-medel'].sort())
  })

  it('förbered = delvis, ELLER svag & låg vikt', () => {
    expect(b.förbered.map((r) => r.requirement).sort())
      .toEqual(['delvis-hög', 'delvis-medel', 'delvis-låg', 'svag-låg'].sort())
  })

  it('reconciliation: styrkor + förbered + prioritera === requirements.length', () => {
    expect(b.styrkor.length + b.förbered.length + b.prioritera.length).toBe(all.length)
    expect(b.total).toBe(9)
  })

  it('coverage = antal stark / antal krav', () => {
    expect(b.coverage).toBeCloseTo(3 / 9)
  })
})

describe('deriveGapBuckets – kanter', () => {
  it('tomt → allt tomt, coverage 0, ingen division med noll', () => {
    expect(deriveGapBuckets([])).toEqual({ styrkor: [], förbered: [], prioritera: [], coverage: 0, total: 0 })
    expect(deriveGapBuckets(undefined).total).toBe(0)
  })

  it('0 prioritera när inga svaga viktiga krav finns', () => {
    const b = deriveGapBuckets([req('stark', 'hög'), req('delvis', 'medel'), req('svag', 'låg')])
    expect(b.prioritera).toHaveLength(0)
    expect(b.styrkor.length + b.förbered.length).toBe(3)
  })

  it('normaliserar ogiltiga match/importance (match→delvis, importance→medel)', () => {
    const b = deriveGapBuckets([{ requirement: 'x', match: 'bogus', importance: 'nope' }])
    expect(b.förbered).toHaveLength(1) // bogus→delvis → förbered
    expect(b.total).toBe(1)
  })
})

describe('resolveRequirements – nya + äldre jobb', () => {
  it('nya jobb: job.requirements används direkt', () => {
    const reqs = [req('stark', 'hög')]
    expect(resolveRequirements({ requirements: reqs })).toBe(reqs)
  })

  it('äldre jobb: härleds från gapAnalysis (covered→stark, prep→delvis, critical→svag/hög)', () => {
    const job = {
      gapAnalysis: {
        coveredRequirements: [{ skill: 'React' }],
        preparationAreas: [{ skill: 'Go', type: 'meriterande' }],
        criticalGaps: [{ skill: 'Kubernetes', reason: 'krävs', howToAddress: 'var ärlig' }],
      },
    }
    const out = resolveRequirements(job)
    expect(out).toEqual([
      { requirement: 'React', importance: 'medel', match: 'stark', note: '', howToAddress: '' },
      { requirement: 'Go', importance: 'låg', match: 'delvis', note: '', howToAddress: '' },
      { requirement: 'Kubernetes', importance: 'hög', match: 'svag', note: 'krävs', howToAddress: 'var ärlig' },
    ])
  })

  it('saknad analys → tom lista (ingen krasch)', () => {
    expect(resolveRequirements({})).toEqual([])
    expect(resolveRequirements(null)).toEqual([])
  })

  it('äldre jobb bucketas konsekvent (critical=svag/hög → prioritera)', () => {
    const job = { gapAnalysis: { criticalGaps: [{ skill: 'K8s' }], preparationAreas: [], coveredRequirements: [] } }
    const b = deriveGapBuckets(resolveRequirements(job))
    expect(b.prioritera).toHaveLength(1)
  })
})

describe('coverageFromJob', () => {
  it('nytt jobb: covered = starkt matchade, total = antal krav', () => {
    const job = { requirements: [req('stark', 'hög'), req('delvis', 'medel'), req('svag', 'hög')] }
    expect(coverageFromJob(job)).toEqual({ covered: 1, total: 3, ratio: 1 / 3 })
  })

  it('äldre jobb via gapAnalysis', () => {
    const job = { gapAnalysis: { coveredRequirements: [{ skill: 'a' }, { skill: 'b' }], preparationAreas: [{ skill: 'c' }], criticalGaps: [] } }
    expect(coverageFromJob(job)).toEqual({ covered: 2, total: 3, ratio: 2 / 3 })
  })

  it('tomt jobb', () => {
    expect(coverageFromJob({})).toEqual({ covered: 0, total: 0, ratio: 0 })
  })
})

describe('cleanJobDescription', () => {
  it('strippar ett ledande "Uppdragsbeskrivning:"-prefix', () => {
    expect(cleanJobDescription('Uppdragsbeskrivning: Vi söker en utvecklare')).toBe('Vi söker en utvecklare')
  })

  it('strippar dubblerade prefix', () => {
    expect(cleanJobDescription('Uppdragsbeskrivning:\nUppdragsbeskrivning: Rolltext')).toBe('Rolltext')
  })

  it('bevarar interna radbrytningar', () => {
    expect(cleanJobDescription('Uppdragsbeskrivning:\nRad 1\nRad 2')).toBe('Rad 1\nRad 2')
  })

  it('null/icke-sträng → ""', () => {
    expect(cleanJobDescription(null)).toBe('')
    expect(cleanJobDescription(42)).toBe('')
  })
})

describe('resolveQuickFacts', () => {
  it('bygger fakta och droppar tomma fält', () => {
    const job = { quickFacts: { kund: 'ACME', roll: 'Arkitekt', miljö: 'Azure', fokus: '' } }
    expect(resolveQuickFacts(job)).toEqual([
      { label: 'Kund', value: 'ACME' },
      { label: 'Roll', value: 'Arkitekt' },
      { label: 'Miljö', value: 'Azure' },
    ])
  })

  it('faller tillbaka på company/jobTitle för äldre jobb', () => {
    expect(resolveQuickFacts({ company: 'Boulder', jobTitle: 'Fullstack' })).toEqual([
      { label: 'Kund', value: 'Boulder' },
      { label: 'Roll', value: 'Fullstack' },
    ])
  })

  it('tomt → []', () => {
    expect(resolveQuickFacts({})).toEqual([])
    expect(resolveQuickFacts(null)).toEqual([])
  })
})

describe('parseJobDescription', () => {
  it('tom/null → []', () => {
    expect(parseJobDescription('')).toEqual([])
    expect(parseJobDescription(null)).toEqual([])
  })

  it('strippar prefix och bevarar radbrytningar inom ett stycke', () => {
    const blocks = parseJobDescription('Uppdragsbeskrivning:\nRad 1\nRad 2')
    expect(blocks).toEqual([{ type: 'paragraph', text: 'Rad 1\nRad 2' }])
  })

  it('tom rad separerar stycken', () => {
    const blocks = parseJobDescription('Stycke ett\n\nStycke två')
    expect(blocks).toEqual([
      { type: 'paragraph', text: 'Stycke ett' },
      { type: 'paragraph', text: 'Stycke två' },
    ])
  })

  it('detekterar rubriker (kolon och versalrad) och punkter', () => {
    const blocks = parseJobDescription('KRAV\n- Java\n- Python\nVi erbjuder:\nText')
    expect(blocks).toEqual([
      { type: 'heading', text: 'KRAV' },
      { type: 'list', items: ['Java', 'Python'] },
      { type: 'heading', text: 'Vi erbjuder' },
      { type: 'paragraph', text: 'Text' },
    ])
  })
})
