import { describe, it, expect } from 'vitest'
import {
  findInvalidRequirementValues,
  deriveGapBuckets,
} from '../../src/lib/gapAnalysis.js'

// Den farligaste risken i språkanalysen: om modellen svarar med ENGELSKA
// enum-värden normaliserar deriveGapBuckets bort dem i tysthet – varje krav
// hamnar under "delvis", kravtäckningen faller till 0 % och sidan ser helt
// normal ut fast den är fel. Det här är testet som gör felet högljutt.

const VALID = [
  { requirement: 'React', importance: 'hög', match: 'stark' },
  { requirement: 'Azure', importance: 'medel', match: 'delvis' },
  { requirement: 'Kafka', importance: 'låg', match: 'svag' },
]

describe('findInvalidRequirementValues – giltig svensk indata', () => {
  it('ger tom lista', () => {
    expect(findInvalidRequirementValues(VALID)).toEqual([])
  })

  it('tom lista in ger tom lista ut', () => {
    expect(findInvalidRequirementValues([])).toEqual([])
  })

  it('tål icke-arrayer utan att kasta', () => {
    expect(findInvalidRequirementValues(null)).toEqual([])
    expect(findInvalidRequirementValues(undefined)).toEqual([])
    expect(findInvalidRequirementValues('nej')).toEqual([])
    expect(findInvalidRequirementValues({})).toEqual([])
  })
})

describe('findInvalidRequirementValues – engelska värden LARMAR', () => {
  it('flaggar engelskt match-värde', () => {
    const out = findInvalidRequirementValues([
      { requirement: 'React', importance: 'hög', match: 'strong' },
    ])
    expect(out).toContainEqual({ index: 0, field: 'match', value: 'strong' })
  })

  it('flaggar engelskt importance-värde', () => {
    const out = findInvalidRequirementValues([
      { requirement: 'React', importance: 'high', match: 'stark' },
    ])
    expect(out).toContainEqual({ index: 0, field: 'importance', value: 'high' })
  })

  it('flaggar båda fälten när hela svaret är engelskt', () => {
    const out = findInvalidRequirementValues([
      { requirement: 'React', importance: 'high', match: 'strong' },
      { requirement: 'Azure', importance: 'medium', match: 'partial' },
    ])
    expect(out).toHaveLength(4)
    expect(out.map((f) => f.index)).toEqual([0, 0, 1, 1])
  })

  it('pekar ut rätt index i en blandad lista', () => {
    const out = findInvalidRequirementValues([
      VALID[0],
      { requirement: 'Kafka', importance: 'hög', match: 'weak' },
      VALID[1],
    ])
    expect(out).toEqual([{ index: 1, field: 'match', value: 'weak' }])
  })
})

describe('findInvalidRequirementValues – saknade och trasiga värden', () => {
  it('flaggar saknade fält', () => {
    const out = findInvalidRequirementValues([{ requirement: 'React' }])
    expect(out).toHaveLength(2)
    expect(out.map((f) => f.field).sort()).toEqual(['importance', 'match'])
  })

  it('flaggar null-poster utan att kasta', () => {
    expect(findInvalidRequirementValues([null])).toHaveLength(2)
  })

  it('flaggar felaktiga typer', () => {
    const out = findInvalidRequirementValues([
      { requirement: 'X', importance: 5, match: true },
    ])
    expect(out).toHaveLength(2)
  })

  it('versaler räknas som ogiltiga – kontraktet är exakt gemener', () => {
    const out = findInvalidRequirementValues([
      { requirement: 'X', importance: 'Hög', match: 'Stark' },
    ])
    expect(out).toHaveLength(2)
  })
})

// ── Regressionslås ────────────────────────────────────────────────────────
// deriveGapBuckets är MEDVETET oförändrad. Skyddet lades bredvid, inte i
// stället – äldre jobb ska bete sig exakt som före språkstödet.

describe('deriveGapBuckets är oförändrad (regressionslås)', () => {
  it('delar upp svensk indata som förut', () => {
    const b = deriveGapBuckets(VALID)
    expect(b.styrkor).toHaveLength(1)
    expect(b.förbered).toHaveLength(2)   // delvis + (svag & låg)
    expect(b.prioritera).toHaveLength(0)
    expect(b.total).toBe(3)
    expect(b.coverage).toBeCloseTo(1 / 3)
  })

  it('svag + hög hamnar under prioritera', () => {
    const b = deriveGapBuckets([{ requirement: 'X', importance: 'hög', match: 'svag' }])
    expect(b.prioritera).toHaveLength(1)
    expect(b.förbered).toHaveLength(0)
  })

  it('reconciliation håller: summan är alltid antalet krav', () => {
    const b = deriveGapBuckets(VALID)
    expect(b.styrkor.length + b.förbered.length + b.prioritera.length).toBe(VALID.length)
  })

  it('normaliserar fortfarande okända värden i tysthet', () => {
    // Detta ÄR det tysta beteendet – det är därför skyddet ovan behövs.
    const b = deriveGapBuckets([{ requirement: 'X', importance: 'high', match: 'strong' }])
    expect(b.styrkor).toHaveLength(0)
    expect(b.förbered).toHaveLength(1)
    expect(b.coverage).toBe(0)
  })

  it('tom indata ger noll täckning utan att kasta', () => {
    const b = deriveGapBuckets([])
    expect(b.total).toBe(0)
    expect(b.coverage).toBe(0)
  })
})
