import { describe, it, expect } from 'vitest'
import {
  extractJsonObject,
  normalizeInterviewFeedback,
  sanitizeCompetencies,
} from '../../src/lib/claude.js'

describe('extractJsonObject', () => {
  it('parses a clean JSON object', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 })
  })

  it('extracts JSON embedded in surrounding prose', () => {
    expect(extractJsonObject('Här är svaret:\n{"x": "y"}\nTack!')).toEqual({ x: 'y' })
  })

  it('handles nested braces', () => {
    expect(extractJsonObject('{"a":{"b":2},"c":[1,2]}')).toEqual({ a: { b: 2 }, c: [1, 2] })
  })

  it('throws a clear error on truncated/malformed JSON', () => {
    // Simulates a response cut off at max_tokens mid-object
    expect(() => extractJsonObject('{"requirements":[{"requirement":"X"')).toThrow(
      /ofullständigt|JSON/i
    )
  })

  it('throws on empty input', () => {
    expect(() => extractJsonObject('')).toThrow()
    expect(() => extractJsonObject(null)).toThrow()
  })

  it('throws when there is no JSON at all', () => {
    expect(() => extractJsonObject('bara text utan objekt')).toThrow(/Ingen JSON/i)
  })
})

describe('normalizeInterviewFeedback', () => {
  it('fills all fields with safe defaults when Claude omits them', () => {
    const out = normalizeInterviewFeedback({})
    expect(out).toEqual({
      overallScore: null,
      summary: '',
      strengths: [],
      improvements: [],
      competencyGaps: [],
      questionFeedback: [],
    })
  })

  it('never returns undefined fields (Firestore rejects undefined)', () => {
    const out = normalizeInterviewFeedback({ overallScore: 8, summary: 'Bra' })
    for (const v of Object.values(out)) expect(v).not.toBeUndefined()
  })

  it('preserves valid values and coerces score to a number', () => {
    const out = normalizeInterviewFeedback({
      overallScore: '7',
      summary: 'Sammanfattning',
      strengths: ['a'],
      improvements: ['b'],
      competencyGaps: ['c'],
      questionFeedback: [{ question: 'Q', score: '9', comment: 'C' }],
    })
    expect(out.overallScore).toBe(7)
    expect(out.questionFeedback[0]).toEqual({ question: 'Q', score: 9, comment: 'C' })
  })

  it('coerces non-array fields and bad scores without throwing', () => {
    const out = normalizeInterviewFeedback({
      overallScore: 'not-a-number',
      strengths: 'oops',
      questionFeedback: [{ question: 1, score: null, comment: undefined }],
    })
    expect(out.overallScore).toBeNull()
    expect(out.strengths).toEqual([])
    expect(out.questionFeedback[0]).toEqual({ question: '', score: null, comment: '' })
  })

  it('tolerates null/garbage input', () => {
    expect(normalizeInterviewFeedback(null).summary).toBe('')
    expect(normalizeInterviewFeedback(undefined).strengths).toEqual([])
  })
})

describe('sanitizeCompetencies', () => {
  it('maps title/description/tags and strips ids', () => {
    const out = sanitizeCompetencies([
      { docId: 'x', title: 'T', description: 'D', tags: ['a'] },
    ])
    expect(out).toEqual([{ namn: 'T', beskrivning: 'D', taggar: ['a'] }])
  })

  it('handles missing arrays and null input safely', () => {
    expect(sanitizeCompetencies(null)).toEqual([])
    expect(sanitizeCompetencies([{}])).toEqual([{ namn: '', beskrivning: '', taggar: [] }])
  })
})
