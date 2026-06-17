import { describe, it, expect } from 'vitest'
import {
  buttonStateForPhase,
  shouldShowIntroHint,
  formatRecordingTime,
  PHASE_STATES,
} from '../../src/lib/interviewPhase.js'

// ── buttonStateForPhase ───────────────────────────────────────────────────

describe('buttonStateForPhase – CONNECTING', () => {
  const s = buttonStateForPhase(PHASE_STATES.CONNECTING)
  it('no button shown',    () => expect(s.label).toBe(''))
  it('not enabled',        () => expect(s.enabled).toBe(false))
  it('not recording',      () => expect(s.recording).toBe(false))
  it('spinner visible',    () => expect(s.showSpinner).toBe(true))
  it('subLabel non-empty', () => expect(s.subLabel.length).toBeGreaterThan(0))
})

describe('buttonStateForPhase – AI_SPEAKING', () => {
  it('no button, no spinner', () => {
    const s = buttonStateForPhase(PHASE_STATES.AI_SPEAKING)
    expect(s.label).toBe('')
    expect(s.enabled).toBe(false)
    expect(s.showSpinner).toBe(false)
  })
  it('interpolates interviewer name into subLabel', () => {
    const s = buttonStateForPhase(PHASE_STATES.AI_SPEAKING, { interviewerName: 'Maria Lindström' })
    expect(s.subLabel).toContain('Maria Lindström')
  })
  it('falls back gracefully when name omitted', () => {
    const s = buttonStateForPhase(PHASE_STATES.AI_SPEAKING)
    expect(s.subLabel.length).toBeGreaterThan(0)
  })
})

describe('buttonStateForPhase – WAITING_FOR_USER', () => {
  const s = buttonStateForPhase(PHASE_STATES.WAITING_FOR_USER)
  it('button enabled',               () => expect(s.enabled).toBe(true))
  it('not recording',                () => expect(s.recording).toBe(false))
  it('no spinner',                   () => expect(s.showSpinner).toBe(false))
  it('label contains "svara"',       () => expect(s.label).toMatch(/svara/i))
  it('subLabel contains "Din tur"',  () => expect(s.subLabel).toMatch(/Din tur/i))
})

describe('buttonStateForPhase – RECORDING', () => {
  const s = buttonStateForPhase(PHASE_STATES.RECORDING)
  it('button enabled',      () => expect(s.enabled).toBe(true))
  it('recording flag true', () => expect(s.recording).toBe(true))
  it('no spinner',          () => expect(s.showSpinner).toBe(false))
  it('label non-empty',     () => expect(s.label.length).toBeGreaterThan(0))
})

describe('buttonStateForPhase – PROCESSING', () => {
  const s = buttonStateForPhase(PHASE_STATES.PROCESSING)
  it('no button',                    () => expect(s.label).toBe(''))
  it('not enabled',                  () => expect(s.enabled).toBe(false))
  it('spinner visible',              () => expect(s.showSpinner).toBe(true))
  it('subLabel mentions analysing',  () => expect(s.subLabel).toMatch(/Analyserar/i))
})

describe('buttonStateForPhase – PREPARING_NEXT', () => {
  const s = buttonStateForPhase(PHASE_STATES.PREPARING_NEXT)
  it('no button',      () => expect(s.label).toBe(''))
  it('not enabled',    () => expect(s.enabled).toBe(false))
  it('spinner visible',() => expect(s.showSpinner).toBe(true))
})

describe('buttonStateForPhase – FINISHED', () => {
  const s = buttonStateForPhase(PHASE_STATES.FINISHED)
  it('no button',      () => expect(s.label).toBe(''))
  it('not enabled',    () => expect(s.enabled).toBe(false))
  it('not recording',  () => expect(s.recording).toBe(false))
  it('no spinner',     () => expect(s.showSpinner).toBe(false))
})

describe('buttonStateForPhase – unknown phase (regression guard)', () => {
  const s = buttonStateForPhase('some-future-state-nobody-thought-of')
  it('safe empty label',  () => expect(s.label).toBe(''))
  it('not enabled',       () => expect(s.enabled).toBe(false))
  it('not recording',     () => expect(s.recording).toBe(false))
  it('no spinner',        () => expect(s.showSpinner).toBe(false))
})

// All seven canonical states must have a non-null subLabel
describe('buttonStateForPhase – subLabel always a string', () => {
  Object.values(PHASE_STATES).forEach((phase) => {
    it(`${phase}: subLabel is string`, () => {
      expect(typeof buttonStateForPhase(phase).subLabel).toBe('string')
    })
  })
})

// ── shouldShowIntroHint ───────────────────────────────────────────────────

describe('shouldShowIntroHint', () => {
  it('shows when flag is false',     () => expect(shouldShowIntroHint(false)).toBe(true))
  it('shows when flag is undefined', () => expect(shouldShowIntroHint(undefined)).toBe(true))
  it('shows when flag is null',      () => expect(shouldShowIntroHint(null)).toBe(true))
  it('shows when flag is 0',         () => expect(shouldShowIntroHint(0)).toBe(true))
  it('hidden when flag is true',     () => expect(shouldShowIntroHint(true)).toBe(false))
})

// ── formatRecordingTime ───────────────────────────────────────────────────

describe('formatRecordingTime', () => {
  it('formats 0s as 0:00',   () => expect(formatRecordingTime(0)).toBe('0:00'))
  it('formats 5s as 0:05',   () => expect(formatRecordingTime(5)).toBe('0:05'))
  it('formats 59s as 0:59',  () => expect(formatRecordingTime(59)).toBe('0:59'))
  it('formats 60s as 1:00',  () => expect(formatRecordingTime(60)).toBe('1:00'))
  it('formats 90s as 1:30',  () => expect(formatRecordingTime(90)).toBe('1:30'))
  it('formats 125s as 2:05', () => expect(formatRecordingTime(125)).toBe('2:05'))
})
