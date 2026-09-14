import { describe, it, expect } from 'vitest'
import { feedbackCopy } from '../../src/lib/feedbackCopy.js'

describe('feedbackCopy – språkval', () => {
  it('svenska som default när fältet saknas', () => {
    expect(feedbackCopy(undefined).summary).toBe('Sammanfattning')
  })

  it('äldre feedback utan language behandlas som svensk', () => {
    expect(feedbackCopy(null).overallScore).toBe('Övergripande betyg')
  })

  it('engelska när sessionen hölls på engelska', () => {
    expect(feedbackCopy('en').summary).toBe('Summary')
    expect(feedbackCopy('en').overallScore).toBe('Overall score')
  })

  it('okänt språk faller tillbaka på svenska', () => {
    expect(feedbackCopy('de')).toBe(feedbackCopy('sv'))
  })
})

describe('feedbackCopy – rubriker', () => {
  it('svenska rubriker', () => {
    const t = feedbackCopy('sv')
    expect(t.strengths).toBe('Styrkor')
    expect(t.improvements).toBe('Förbättringsområden')
    expect(t.perQuestion).toBe('Feedback per fråga')
  })

  it('engelska rubriker', () => {
    const t = feedbackCopy('en')
    expect(t.strengths).toBe('Strengths')
    expect(t.improvements).toBe('Areas to improve')
    expect(t.perQuestion).toBe('Feedback per question')
  })

  it('titeln bakar in rollen', () => {
    expect(feedbackCopy('sv').title('Interim IT-chef')).toBe('Intervjufeedback – Interim IT-chef')
    expect(feedbackCopy('en').title('Interim Head of IT')).toBe('Interview feedback – Interim Head of IT')
  })

  it('frågeräknaren följer språket', () => {
    expect(feedbackCopy('sv').question(3)).toBe('Fråga 3')
    expect(feedbackCopy('en').question(3)).toBe('Question 3')
  })
})

describe('feedbackCopy – strukturella garantier', () => {
  it('båda språken har exakt samma nycklar', () => {
    expect(Object.keys(feedbackCopy('en')).sort()).toEqual(Object.keys(feedbackCopy('sv')).sort())
  })

  it('inget fält är tomt', () => {
    ;['sv', 'en'].forEach((lang) => {
      Object.entries(feedbackCopy(lang)).forEach(([key, value]) => {
        if (typeof value === 'function') {
          expect(String(value('X')).length, key).toBeGreaterThan(0)
        } else {
          expect(String(value).length, key).toBeGreaterThan(0)
        }
      })
    })
  })

  it('datumformatet följer språket', () => {
    expect(feedbackCopy('sv').locale).toBe('sv-SE')
    expect(feedbackCopy('en').locale).toBe('en-GB')
  })

  it('den engelska uppsättningen innehåller ingen svensk text', () => {
    const t = feedbackCopy('en')
    const text = [t.summary, t.strengths, t.improvements, t.perQuestion,
                  t.overallScore, t.privacyNote, t.shareToggle].join(' ')
    expect(text).not.toMatch(/[åäöÅÄÖ]/)
  })
})
