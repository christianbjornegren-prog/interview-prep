import { describe, it, expect } from 'vitest'
import { buildSystemEvent, sanitizeContext, summarizeEvents } from '../../src/lib/systemEvents.js'

describe('buildSystemEvent', () => {
  it('applies defaults and normalizes types', () => {
    const e = buildSystemEvent({ type: 'session_completed', uid: 'u1' })
    expect(e).toEqual({
      type: 'session_completed',
      severity: 'info',
      step: '',
      message: '',
      uid: 'u1',
    })
  })

  it('forces an invalid severity to info', () => {
    expect(buildSystemEvent({ type: 'x', severity: 'critical' }).severity).toBe('info')
    expect(buildSystemEvent({ type: 'x', severity: 'error' }).severity).toBe('error')
  })

  it('clamps the message to 500 chars', () => {
    const long = 'a'.repeat(900)
    expect(buildSystemEvent({ type: 'x', message: long }).message.length).toBe(500)
  })

  it('never carries betyg/feedback fields – only the known keys', () => {
    const e = buildSystemEvent({ type: 'x', uid: 'u' })
    expect(Object.keys(e).sort()).toEqual(['message', 'severity', 'step', 'type', 'uid'])
  })

  it('defaults missing uid to null', () => {
    expect(buildSystemEvent({ type: 'x' }).uid).toBe(null)
  })
})

describe('summarizeEvents', () => {
  const now = Date.parse('2026-06-13T12:00:00Z')
  const DAY = 24 * 60 * 60 * 1000

  const events = [
    { type: 'session_completed', severity: 'info', uid: 'a', createdAtMs: now - 1 * DAY },
    { type: 'session_completed', severity: 'info', uid: 'b', createdAtMs: now - 6 * DAY },
    { type: 'session_completed', severity: 'info', uid: 'a', createdAtMs: now - 20 * DAY },
    { type: 'session_completed', severity: 'info', uid: 'c', createdAtMs: now - 40 * DAY },
    { type: 'pipeline_error', severity: 'error', uid: 'a', step: 'whisper', createdAtMs: now - 2 * DAY },
    { type: 'pipeline_error', severity: 'error', uid: 'b', step: 'tts', createdAtMs: now - 3 * DAY },
  ]

  it('counts completed sessions across windows', () => {
    const s = summarizeEvents(events, now)
    expect(s.completedTotal).toBe(4)
    expect(s.completed7).toBe(2)   // 1d + 6d
    expect(s.completed30).toBe(3)  // 1d + 6d + 20d
  })

  it('counts distinct active consultants from completed sessions', () => {
    expect(summarizeEvents(events, now).activeConsultants).toBe(3) // a, b, c
  })

  it('computes error count and error rate over terminal outcomes', () => {
    const s = summarizeEvents(events, now)
    expect(s.errorTotal).toBe(2)
    expect(s.attempts).toBe(6) // 4 completed + 2 errors
    expect(s.errorRate).toBeCloseTo(2 / 6)
  })

  it('returns zeroed stats and no divide-by-zero for empty input', () => {
    const s = summarizeEvents([], now)
    expect(s).toEqual({
      completedTotal: 0, completed7: 0, completed30: 0,
      activeConsultants: 0, errorTotal: 0, attempts: 0, errorRate: 0,
    })
  })
})

describe('buildSystemEvent – context (felsökningsunderlag)', () => {
  it('keeps whitelisted technical fields', () => {
    const e = buildSystemEvent({
      type: 'pipeline_error', severity: 'error', step: 'tts', uid: 'u',
      context: { device: 'iPhone · Safari 18', phase: 'AI_SPEAKING', questionIndex: 0, mobile: true },
    })
    expect(e.context).toEqual({
      device: 'iPhone · Safari 18', phase: 'AI_SPEAKING', questionIndex: 0, mobile: true,
    })
  })

  it('drops everything outside the whitelist – the log can never carry betyg or answers', () => {
    const e = buildSystemEvent({
      type: 'x',
      context: { overallScore: 9, transcript: 'mitt svar', feedback: 'bra', answer: 'hej', device: 'Mac' },
    })
    expect(e.context).toEqual({ device: 'Mac' })
  })

  it('omits context entirely when nothing usable remains', () => {
    expect('context' in buildSystemEvent({ type: 'x', context: { overallScore: 9 } })).toBe(false)
    expect('context' in buildSystemEvent({ type: 'x', context: {} })).toBe(false)
    expect('context' in buildSystemEvent({ type: 'x', context: 'nope' })).toBe(false)
  })

  it('never lets undefined, null, NaN or nested objects through (Firestore would reject them)', () => {
    const clean = sanitizeContext({
      device: undefined, phase: null, route: '', elapsedMs: NaN, httpStatus: Infinity,
      detail: { nested: true }, voice: () => 'x', language: 'sv',
    })
    expect(clean).toEqual({ language: 'sv' })
  })

  it('clips long strings, with more room for stack/userAgent/detail', () => {
    const clean = sanitizeContext({ device: 'a'.repeat(900), stack: 'b'.repeat(5000) })
    expect(clean.device.length).toBe(300)
    expect(clean.stack.length).toBe(1500)
  })

  it('keeps the LAST 40 trail entries, as clipped strings', () => {
    const trail = Array.from({ length: 60 }, (_, i) => `+${i}s steg ${'x'.repeat(200)}`)
    const clean = sanitizeContext({ trail })
    expect(clean.trail).toHaveLength(40)
    expect(clean.trail[0].startsWith('+20s')).toBe(true)
    expect(clean.trail.every((t) => t.length <= 100)).toBe(true)
  })

  it('drops an empty or malformed trail', () => {
    expect(sanitizeContext({ trail: [] })).toBe(null)
    expect(sanitizeContext({ trail: 'not a list' })).toBe(null)
  })
})
