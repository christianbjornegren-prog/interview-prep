import { describe, it, expect } from 'vitest'
import {
  buttonStateForPhase,
  shouldShowIntroHint,
  formatRecordingTime,
  buildRecordingLabel,
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

// ── Språkstöd ─────────────────────────────────────────────────────────────
// Svenskan ovan är oförändrad (default). Nedan bevisas den engelska varianten
// och att inget läge kan sakna text på något av språken.

describe('buttonStateForPhase – engelska', () => {
  it('CONNECTING', () => {
    const s = buttonStateForPhase(PHASE_STATES.CONNECTING, { language: 'en' })
    expect(s.subLabel).toMatch(/Connecting/i)
    expect(s.showSpinner).toBe(true)
  })

  it('AI_SPEAKING interpolerar namnet', () => {
    const s = buttonStateForPhase(PHASE_STATES.AI_SPEAKING, {
      interviewerName: 'Sarah Mitchell',
      language: 'en',
    })
    expect(s.subLabel).toContain('Sarah Mitchell')
    expect(s.subLabel).toMatch(/asking/i)
  })

  it('WAITING_FOR_USER', () => {
    const s = buttonStateForPhase(PHASE_STATES.WAITING_FOR_USER, { language: 'en' })
    expect(s.label).toMatch(/answer/i)
    expect(s.subLabel).toMatch(/Your turn/i)
    expect(s.enabled).toBe(true)
  })

  it('RECORDING', () => {
    const s = buttonStateForPhase(PHASE_STATES.RECORDING, { language: 'en' })
    expect(s.subLabel).toMatch(/Recording/i)
    expect(s.recording).toBe(true)
  })

  it('PROCESSING', () => {
    const s = buttonStateForPhase(PHASE_STATES.PROCESSING, { language: 'en' })
    expect(s.subLabel).toMatch(/Analysing/i)
    expect(s.showSpinner).toBe(true)
  })

  it('PREPARING_NEXT', () => {
    const s = buttonStateForPhase(PHASE_STATES.PREPARING_NEXT, { language: 'en' })
    expect(s.subLabel).toMatch(/Preparing/i)
  })

  it('FINISHED', () => {
    const s = buttonStateForPhase(PHASE_STATES.FINISHED, { language: 'en' })
    expect(s.subLabel).toMatch(/complete/i)
    expect(s.enabled).toBe(false)
  })

  it('namnet faller tillbaka på engelska när det saknas', () => {
    const s = buttonStateForPhase(PHASE_STATES.AI_SPEAKING, { language: 'en' })
    expect(s.subLabel).toContain('The interviewer')
  })
})

describe('buttonStateForPhase – språkoberoende garantier', () => {
  const languages = ['sv', 'en']

  languages.forEach((language) => {
    Object.values(PHASE_STATES).forEach((phase) => {
      it(`${language}/${phase}: subLabel är en icke-tom sträng`, () => {
        const s = buttonStateForPhase(phase, { language })
        expect(typeof s.subLabel).toBe('string')
        expect(s.subLabel.length).toBeGreaterThan(0)
      })
    })
  })

  it('okänt språk ger samma utfall som svenska', () => {
    Object.values(PHASE_STATES).forEach((phase) => {
      expect(buttonStateForPhase(phase, { language: 'de' }))
        .toEqual(buttonStateForPhase(phase, { language: 'sv' }))
    })
  })

  it('utan språk beter sig som svenska (bakåtkompatibilitet)', () => {
    Object.values(PHASE_STATES).forEach((phase) => {
      expect(buttonStateForPhase(phase)).toEqual(buttonStateForPhase(phase, { language: 'sv' }))
    })
  })

  it('okänt läge är säkert tomt på båda språken', () => {
    languages.forEach((language) => {
      const s = buttonStateForPhase('nonexistent-phase', { language })
      expect(s).toEqual({ label: '', subLabel: '', enabled: false, recording: false, showSpinner: false })
    })
  })
})

describe('buildRecordingLabel', () => {
  it('svensk etikett med timer', () => {
    expect(buildRecordingLabel(5, 'sv')).toBe('0:05 — tryck när du är klar')
  })

  it('engelsk etikett med timer', () => {
    expect(buildRecordingLabel(5, 'en')).toBe("0:05 — press when you're done")
  })

  it('svenska som default', () => {
    expect(buildRecordingLabel(65)).toBe('1:05 — tryck när du är klar')
  })

  it('okänt språk faller tillbaka på svenska', () => {
    expect(buildRecordingLabel(0, 'de')).toBe('0:00 — tryck när du är klar')
  })
})
