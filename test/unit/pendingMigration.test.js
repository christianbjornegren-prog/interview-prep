import { describe, it, expect } from 'vitest'
import {
  normalizeEmail,
  buildMigrationPlan,
  fitsInOneBatch,
  filterAwaitingLogin,
  MAX_BATCH_OPERATIONS,
} from '../../src/lib/pendingMigration.js'

describe('normalizeEmail', () => {
  it('gemenar och trimmar', () => {
    expect(normalizeEmail('  Ivar.Stevens@Boulder.SE ')).toBe('ivar.stevens@boulder.se')
  })

  it('tål icke-strängar', () => {
    ;[null, undefined, 42, {}, []].forEach((v) => expect(normalizeEmail(v)).toBe(''))
  })
})

describe('buildMigrationPlan', () => {
  it('plockar ut kompetenser och uppdrag', () => {
    const plan = buildMigrationPlan({
      competencies: [{ title: 'Azure' }, { title: 'React' }],
      jobs: [{ jobTitle: 'IT-chef' }],
    })
    expect(plan.competencies).toHaveLength(2)
    expect(plan.jobs).toHaveLength(1)
    expect(plan.total).toBe(3)
  })

  it('strippar createdAt från kompetenser (mottagaren får färsk tidsstämpel)', () => {
    const plan = buildMigrationPlan({
      competencies: [{ title: 'Azure', createdAt: 'gammal' }],
    })
    expect(plan.competencies[0]).toEqual({ title: 'Azure' })
    expect('createdAt' in plan.competencies[0]).toBe(false)
  })

  it('strippar createdAt OCH id från uppdrag', () => {
    const plan = buildMigrationPlan({
      jobs: [{ jobTitle: 'IT-chef', id: 'job_123', createdAt: 'gammal', company: 'Boulder' }],
    })
    expect(plan.jobs[0]).toEqual({ jobTitle: 'IT-chef', company: 'Boulder' })
  })

  it('bevarar allt annat innehåll orört', () => {
    const job = {
      jobTitle: 'IT-chef', company: 'Boulder', questions: [{ id: 'q1' }],
      requirements: [{ requirement: 'Azure', importance: 'hög', match: 'stark' }],
      questionsEn: [{ id: 'q1' }], jobTitleEn: 'Head of IT',
    }
    const plan = buildMigrationPlan({ jobs: [job] })
    expect(plan.jobs[0]).toEqual(job)
  })

  it('enum-värden i uppdragen rörs inte av migreringen', () => {
    const plan = buildMigrationPlan({
      jobs: [{ requirements: [{ importance: 'hög', match: 'stark' }] }],
    })
    expect(plan.jobs[0].requirements[0]).toEqual({ importance: 'hög', match: 'stark' })
  })

  it('tomt eller trasigt underlag ger en tom plan utan att kasta', () => {
    ;[null, undefined, {}, 'nej', 42, []].forEach((input) => {
      const plan = buildMigrationPlan(input)
      expect(plan.competencies).toEqual([])
      expect(plan.jobs).toEqual([])
      expect(plan.total).toBe(0)
    })
  })

  it('hoppar över trasiga poster i listorna', () => {
    const plan = buildMigrationPlan({
      competencies: [null, { title: 'Azure' }, 'skräp', undefined],
      jobs: [{ jobTitle: 'OK' }, null],
    })
    expect(plan.competencies).toHaveLength(1)
    expect(plan.jobs).toHaveLength(1)
  })

  it('icke-array-fält behandlas som tomma', () => {
    const plan = buildMigrationPlan({ competencies: 'oops', jobs: { a: 1 } })
    expect(plan.total).toBe(0)
  })
})

describe('fitsInOneBatch – atomicitetens gräns', () => {
  it('normal profil får plats', () => {
    expect(fitsInOneBatch({ total: 33 })).toBe(true)
  })

  it('exakt vid gränsen får plats (skrivningar + raderingen)', () => {
    expect(fitsInOneBatch({ total: MAX_BATCH_OPERATIONS - 1 })).toBe(true)
  })

  it('en över gränsen får INTE plats', () => {
    expect(fitsInOneBatch({ total: MAX_BATCH_OPERATIONS })).toBe(false)
  })

  it('tål saknad plan', () => {
    expect(fitsInOneBatch(undefined)).toBe(true)
    expect(fitsInOneBatch({})).toBe(true)
  })
})

// Detta är testet som gör tillståndet "både aktiv och väntande" omöjligt att visa.
describe('filterAwaitingLogin', () => {
  const pending = [
    { email: 'david.nilsson@boulder.se' },
    { email: 'ivar.stevens@boulder.se' },
    { email: 'gustaf@boulder.se' },
  ]

  it('döljer den som redan har konto', () => {
    const out = filterAwaitingLogin(pending, [{ email: 'ivar.stevens@boulder.se' }])
    expect(out.map((p) => p.email)).toEqual([
      'david.nilsson@boulder.se',
      'gustaf@boulder.se',
    ])
  })

  it('matchar oberoende av versaler och blanksteg', () => {
    const out = filterAwaitingLogin(pending, [{ email: '  Ivar.Stevens@Boulder.SE ' }])
    expect(out).toHaveLength(2)
  })

  it('utan aktiva konton visas alla', () => {
    expect(filterAwaitingLogin(pending, [])).toHaveLength(3)
  })

  it('en profil UTAN e-post visas hellre än göms tyst', () => {
    const out = filterAwaitingLogin([{ name: 'Namnlös' }], [{ email: 'a@boulder.se' }])
    expect(out).toHaveLength(1)
  })

  it('tål trasiga indata utan att kasta', () => {
    expect(filterAwaitingLogin(null, null)).toEqual([])
    expect(filterAwaitingLogin(pending, null)).toHaveLength(3)
    expect(filterAwaitingLogin(pending, [null, {}, { email: null }])).toHaveLength(3)
  })

  it('alla aktiva ger tom väntelista', () => {
    const active = pending.map((p) => ({ email: p.email }))
    expect(filterAwaitingLogin(pending, active)).toEqual([])
  })
})
