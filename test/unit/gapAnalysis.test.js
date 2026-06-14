import { describe, it, expect } from 'vitest'
import { normalizeGapAnalysis, computeCoverage } from '../../src/lib/gapAnalysis.js'

describe('normalizeGapAnalysis – new structure', () => {
  it('passes through a full new-shape object', () => {
    const ga = {
      criticalGaps: [{ skill: 'Kubernetes', reason: 'krävs', howToAddress: 'var ärlig' }],
      preparationAreas: [{ skill: 'Terraform', type: 'meriterande' }],
      coveredRequirements: [{ skill: 'React' }],
    }
    expect(normalizeGapAnalysis(ga)).toEqual(ga)
  })

  it('fills missing arrays when only one new field is present', () => {
    const out = normalizeGapAnalysis({ criticalGaps: [{ skill: 'X' }] })
    expect(out.criticalGaps).toHaveLength(1)
    expect(out.preparationAreas).toEqual([])
    expect(out.coveredRequirements).toEqual([])
  })
})

describe('normalizeGapAnalysis – backward compatibility (old shape)', () => {
  it('maps old covered/gaps to the new structure', () => {
    const old = {
      covered: [{ requirement: 'React', competencyName: 'Frontend', strength: 'hög' }],
      gaps: [{ requirement: 'Go', suggestion: 'lär dig' }],
    }
    const out = normalizeGapAnalysis(old)
    expect(out.criticalGaps).toEqual([]) // can't infer critical from old data
    expect(out.coveredRequirements).toEqual([{ skill: 'React' }])
    expect(out.preparationAreas).toEqual([{ skill: 'Go', type: 'infererat' }])
  })

  it('falls back to competencyName when requirement is absent in old covered', () => {
    const out = normalizeGapAnalysis({ covered: [{ competencyName: 'Ledarskap' }], gaps: [] })
    expect(out.coveredRequirements).toEqual([{ skill: 'Ledarskap' }])
  })
})

describe('normalizeGapAnalysis – missing/invalid (no crash, empty arrays)', () => {
  it('returns empty arrays for undefined (job utan fältet)', () => {
    expect(normalizeGapAnalysis(undefined)).toEqual({
      criticalGaps: [], preparationAreas: [], coveredRequirements: [],
    })
  })

  it('returns empty arrays for null', () => {
    expect(normalizeGapAnalysis(null)).toEqual({
      criticalGaps: [], preparationAreas: [], coveredRequirements: [],
    })
  })

  it('returns empty arrays for a non-object', () => {
    expect(normalizeGapAnalysis('nope')).toEqual({
      criticalGaps: [], preparationAreas: [], coveredRequirements: [],
    })
  })

  it('returns empty arrays for an empty object (neither shape)', () => {
    expect(normalizeGapAnalysis({})).toEqual({
      criticalGaps: [], preparationAreas: [], coveredRequirements: [],
    })
  })
})

describe('computeCoverage', () => {
  it('counts covered and total across all three buckets', () => {
    const gap = {
      criticalGaps: [{ skill: 'a' }],
      preparationAreas: [{ skill: 'b' }, { skill: 'c' }],
      coveredRequirements: [{ skill: 'd' }, { skill: 'e' }, { skill: 'f' }],
    }
    const cov = computeCoverage(gap)
    expect(cov.covered).toBe(3)
    expect(cov.total).toBe(6) // 3 covered + 2 prep + 1 critical
    expect(cov.ratio).toBeCloseTo(0.5)
  })

  it('handles empty input without divide-by-zero', () => {
    expect(computeCoverage()).toEqual({ covered: 0, total: 0, ratio: 0 })
    expect(computeCoverage({ criticalGaps: [], preparationAreas: [], coveredRequirements: [] }))
      .toEqual({ covered: 0, total: 0, ratio: 0 })
  })

  it('is consistent when fed the output of normalizeGapAnalysis (old shape)', () => {
    const cov = computeCoverage(normalizeGapAnalysis({
      covered: [{ requirement: 'React' }, { requirement: 'Node' }],
      gaps: [{ requirement: 'Go' }],
    }))
    expect(cov).toEqual({ covered: 2, total: 3, ratio: 2 / 3 })
  })
})
