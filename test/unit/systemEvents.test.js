import { describe, it, expect } from 'vitest'
import { buildSystemEvent, summarizeEvents } from '../../src/lib/systemEvents.js'

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
