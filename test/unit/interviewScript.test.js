import { describe, it, expect } from 'vitest'
import {
  buildGreeting,
  buildBridge,
  buildClosing,
  pickVoiceAndName,
  capForSpeech,
  screenCopy,
  TTS_MAX_INPUT,
} from '../../src/lib/interviewScript.js'

const GREETING_ARGS = {
  interviewerName: 'Maria Lindström',
  jobTitle: 'Systemarkitekt',
  company: 'Boulder',
  total: 5,
  firstQuestion: 'Berätta om din bakgrund.',
}

// ── Regressionslås ────────────────────────────────────────────────────────
// De svenska replikerna flyttades hit från InterviewSimulatorTTS.jsx. De ska
// vara ORDAGRANT oförändrade – annars har språkstödet ändrat det svenska
// flödet, vilket är precis det vi bygger för att undvika.

describe('svenska replikerna är oförändrade (regressionslås)', () => {
  it('hälsningen ordagrant', () => {
    expect(buildGreeting({ ...GREETING_ARGS, language: 'sv' })).toBe(
      'Hej, jag heter Maria Lindström. Välkommen till intervjun ' +
      'för rollen Systemarkitekt hos Boulder. ' +
      'Vi har 5 frågor. ' +
      'Fråga 1 av 5: Berätta om din bakgrund.'
    )
  })

  it('övergången ordagrant', () => {
    expect(buildBridge({ number: 2, total: 5, question: 'Vad driver dig?', language: 'sv' }))
      .toBe('Tack. Fråga 2 av 5: Vad driver dig?')
  })

  it('avslutningen ordagrant', () => {
    expect(buildClosing({ language: 'sv' })).toBe(
      'Tack så mycket, det var alla mina frågor. ' +
      'Du har genomfört intervjun. Bra jobbat!'
    )
  })
})

describe('svenska är default när språk saknas eller är trasigt', () => {
  it('inget språk → svensk hälsning', () => {
    expect(buildGreeting(GREETING_ARGS)).toContain('Hej, jag heter')
  })
  it('okänt språk → svensk övergång', () => {
    expect(buildBridge({ number: 1, total: 3, question: 'X', language: 'de' }))
      .toBe('Tack. Fråga 1 av 3: X')
  })
  it('inga argument → svensk avslutning', () => {
    expect(buildClosing()).toContain('Tack så mycket')
  })
})

describe('engelska replikerna', () => {
  it('hälsningen är engelsk och innehåller rollen', () => {
    const out = buildGreeting({ ...GREETING_ARGS, language: 'en' })
    expect(out).toBe(
      'Hello, my name is Maria Lindström. Welcome to your interview ' +
      'for the role of Systemarkitekt at Boulder. ' +
      'We have 5 questions. ' +
      'Question 1 of 5: Berätta om din bakgrund.'
    )
  })

  it('hälsningen innehåller ingen svensk text', () => {
    const out = buildGreeting({ ...GREETING_ARGS, language: 'en' })
    expect(out).not.toContain('Hej, jag heter')
    expect(out).not.toContain('Fråga')
  })

  it('övergången är engelsk', () => {
    expect(buildBridge({ number: 3, total: 8, question: 'Tell me more.', language: 'en' }))
      .toBe('Thank you. Question 3 of 8: Tell me more.')
  })

  it('avslutningen är engelsk', () => {
    expect(buildClosing({ language: 'en' })).toBe(
      'Thank you very much, those were all my questions. ' +
      'You have completed the interview. Well done!'
    )
  })
})

// ── Röst och namn ─────────────────────────────────────────────────────────

describe('pickVoiceAndName', () => {
  const ALL_VOICES = ['shimmer', 'nova', 'alloy', 'onyx', 'echo', 'fable']

  it('svenskt namn för svensk intervju', () => {
    expect(pickVoiceAndName('sv', () => 0)).toEqual({ voice: 'shimmer', name: 'Maria Lindström' })
  })

  it('engelskt namn för engelsk intervju', () => {
    expect(pickVoiceAndName('en', () => 0)).toEqual({ voice: 'shimmer', name: 'Sarah Mitchell' })
  })

  it('manlig gren ger manligt namn (sv)', () => {
    expect(pickVoiceAndName('sv', () => 0.9)).toEqual({ voice: 'fable', name: 'Anders Nilsson' })
  })

  it('manlig gren ger manligt namn (en)', () => {
    expect(pickVoiceAndName('en', () => 0.9)).toEqual({ voice: 'fable', name: 'Daniel Fletcher' })
  })

  it('samma röstuppsättning oavsett språk – bara namnet byts', () => {
    const sv = pickVoiceAndName('sv', () => 0.2)
    const en = pickVoiceAndName('en', () => 0.2)
    expect(sv.voice).toBe(en.voice)
    expect(sv.name).not.toBe(en.name)
  })

  it('okänt språk faller tillbaka på svenska namn', () => {
    expect(pickVoiceAndName('de', () => 0).name).toBe('Maria Lindström')
  })

  it('ger alltid en giltig röst över hela slumpintervallet', () => {
    for (let i = 0; i <= 10; i++) {
      const { voice, name } = pickVoiceAndName('sv', () => i / 10)
      expect(ALL_VOICES).toContain(voice)
      expect(typeof name).toBe('string')
      expect(name.length).toBeGreaterThan(0)
    }
  })
})

// ── TTS-taket ─────────────────────────────────────────────────────────────

describe('capForSpeech – skyddar mot TTS-taket på 4096 tecken', () => {
  it('kort text lämnas orörd', () => {
    expect(capForSpeech('hej')).toBe('hej')
  })

  it('text exakt på gränsen lämnas orörd', () => {
    const text = 'a'.repeat(TTS_MAX_INPUT)
    expect(capForSpeech(text)).toHaveLength(TTS_MAX_INPUT)
  })

  it('för lång text kapas', () => {
    const text = 'a'.repeat(TTS_MAX_INPUT + 500)
    expect(capForSpeech(text).length).toBeLessThanOrEqual(TTS_MAX_INPUT)
  })

  it('kapar vid ordgräns när det går', () => {
    const text = `${'ord '.repeat(2000)}slut`
    const out = capForSpeech(text)
    expect(out.length).toBeLessThanOrEqual(TTS_MAX_INPUT)
    expect(out.endsWith(' ')).toBe(false)
  })

  it('icke-strängar ger tom sträng', () => {
    expect(capForSpeech(null)).toBe('')
    expect(capForSpeech(undefined)).toBe('')
  })

  it('hälsningen kapas om frågan är orimligt lång', () => {
    const out = buildGreeting({
      ...GREETING_ARGS,
      firstQuestion: 'x'.repeat(TTS_MAX_INPUT + 1000),
      language: 'sv',
    })
    expect(out.length).toBeLessThanOrEqual(TTS_MAX_INPUT)
  })
})

// ── Skärmtext ─────────────────────────────────────────────────────────────

describe('screenCopy', () => {
  it('svensk uppsättning som default', () => {
    expect(screenCopy(undefined).title('Maria')).toBe('Intervju med Maria')
  })

  it('engelsk uppsättning', () => {
    expect(screenCopy('en').title('Sarah')).toBe('Interview with Sarah')
  })

  it('frågeräknaren följer språket', () => {
    expect(screenCopy('sv').questionCounter(2, 5)).toBe('Fråga 2 av 5')
    expect(screenCopy('en').questionCounter(2, 5)).toBe('Question 2 of 5')
  })

  it('båda språken har samma nycklar', () => {
    const sv = Object.keys(screenCopy('sv')).sort()
    const en = Object.keys(screenCopy('en')).sort()
    expect(en).toEqual(sv)
  })

  it('båda språken har fyra avslutningssteg', () => {
    expect(screenCopy('sv').finishedSteps).toHaveLength(4)
    expect(screenCopy('en').finishedSteps).toHaveLength(4)
  })
})
