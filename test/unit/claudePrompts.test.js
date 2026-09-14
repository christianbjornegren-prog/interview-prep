import { describe, it, expect } from 'vitest'
import {
  buildFeedbackSystemPrompt,
  buildFeedbackConfigNote,
  buildQuestionsSystemPrompt,
} from '../../src/lib/claude.js'

// Rena promptbyggare – inga nätverksanrop. Det är HELA poängen med att bryta
// ut dem: språkregeln går att bevisa utan att ringa Claude.

describe('buildFeedbackSystemPrompt – svenska', () => {
  const p = buildFeedbackSystemPrompt('sv')

  it('låser språket till svenska', () => expect(p).toContain('Tala ALLTID på svenska.'))
  it('schemat begär svensk sammanfattning', () => expect(p).toContain('övergripande sammanfattning på svenska'))
  it('schemat begär svensk kommentar', () => expect(p).toContain('specifik feedback på svenska'))
  it('nämner inte engelska', () => expect(p).not.toContain('in English'))
})

describe('buildFeedbackSystemPrompt – engelska', () => {
  const p = buildFeedbackSystemPrompt('en')

  it('instruerar om engelsk fritext', () => expect(p).toMatch(/ENGELSKA/))
  it('schemat begär engelsk sammanfattning', () => expect(p).toContain('overall summary in English'))
  it('schemat begär engelsk kommentar', () => expect(p).toContain('specific feedback in English'))
  it('låser INTE språket till svenska', () => expect(p).not.toContain('Tala ALLTID på svenska.'))
})

describe('buildFeedbackSystemPrompt – gemensamt för båda språken', () => {
  const sv = buildFeedbackSystemPrompt('sv')
  const en = buildFeedbackSystemPrompt('en')

  // Betygsskalan är finkalibrerad. Den ska vara IDENTISK i båda lägena –
  // språkvalet får styra prosan, aldrig hur strängt det bedöms.
  const calibration = [
    'POÄNGSKALA 1–10',
    '9–10 Exceptionellt svar',
    '7–8 Bra svar',
    '5–6 Godkänt svar',
    '3–4 Svagt svar',
    '1–2 Reserveras',
  ]

  calibration.forEach((line) => {
    it(`kalibreringen finns i båda: "${line}"`, () => {
      expect(sv).toContain(line)
      expect(en).toContain(line)
    })
  })

  it('samma JSON-schema i båda', () => {
    ;['"overallScore"', '"strengths"', '"improvements"', '"competencyGaps"', '"questionFeedback"']
      .forEach((key) => {
        expect(sv).toContain(key)
        expect(en).toContain(key)
      })
  })

  it('okänt språk ger den svenska prompten', () => {
    expect(buildFeedbackSystemPrompt('de')).toBe(sv)
    expect(buildFeedbackSystemPrompt(undefined)).toBe(sv)
  })
})

describe('buildFeedbackConfigNote', () => {
  it('svenska som default', () => {
    expect(buildFeedbackConfigNote()).toContain('Tala ALLTID på svenska.')
  })

  it('bär med fokus och svårighetsgrad', () => {
    const note = buildFeedbackConfigNote({ focus: 'Situation', difficulty: 'Hård' })
    expect(note).toContain('Fokus: Situation')
    expect(note).toContain('Svårighetsgrad: Hård')
  })

  it('faller tillbaka på Mix/Standard', () => {
    const note = buildFeedbackConfigNote({})
    expect(note).toContain('Fokus: Mix')
    expect(note).toContain('Svårighetsgrad: Standard')
  })

  it('engelsk intervju ger engelsk språkregel', () => {
    const note = buildFeedbackConfigNote({ language: 'en' })
    expect(note).toMatch(/ENGELSKA/)
    expect(note).not.toContain('Tala ALLTID på svenska.')
  })
})

// ── Datakontraktet ────────────────────────────────────────────────────────
// Det här är testet som skyddar kärnprincipen: frågornas category är en NYCKEL
// koden filtrerar på, inte text. Den måste förbli svensk även när frågorna
// skrivs på engelska.

describe('buildQuestionsSystemPrompt – kategorivärdena förblir svenska', () => {
  const CATEGORIES = ['erfarenhet', 'kompetens', 'situation', 'motivation']

  ;['sv', 'en'].forEach((lang) => {
    describe(`språk: ${lang}`, () => {
      const p = buildQuestionsSystemPrompt(lang)

      CATEGORIES.forEach((cat) => {
        it(`nämner kategorin "${cat}"`, () => expect(p).toContain(cat))
      })

      it('förbjuder uttryckligen översättning av kategorin', () => {
        expect(p).toContain('Översätt ALDRIG kategorivärdet')
      })

      it('markerar category som maskinläsbart fältvärde', () => {
        expect(p).toContain('maskinläsbart fältvärde')
      })

      it('innehåller inga engelska kategorivärden', () => {
        ;['experience', 'competence', 'situational', 'motivational'].forEach((bad) => {
          expect(p).not.toContain(bad)
        })
      })
    })
  })
})

describe('buildQuestionsSystemPrompt – prosans språk', () => {
  it('svenska ber om svenska frågor', () => {
    expect(buildQuestionsSystemPrompt('sv')).toContain('på SVENSKA')
  })

  it('engelska ber om engelska frågor', () => {
    expect(buildQuestionsSystemPrompt('en')).toContain('på ENGELSKA')
  })

  it('okänt språk ger den svenska varianten', () => {
    expect(buildQuestionsSystemPrompt('klingon')).toBe(buildQuestionsSystemPrompt('sv'))
  })

  it('båda begär 8-12 frågor', () => {
    expect(buildQuestionsSystemPrompt('sv')).toContain('8-12 frågor')
    expect(buildQuestionsSystemPrompt('en')).toContain('8-12 frågor')
  })
})
