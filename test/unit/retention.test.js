import { describe, it, expect } from 'vitest'
import { FEEDBACK_RETENTION_DAYS, feedbackExpiryDate } from '../../src/lib/retention.js'
import { feedbackCopy } from '../../src/lib/feedbackCopy.js'

describe('feedback retention', () => {
  it('keeps feedback for 30 days', () => {
    expect(FEEDBACK_RETENTION_DAYS).toBe(30)
  })

  it('expires exactly 30 days after the session', () => {
    const from = new Date('2026-11-18T10:00:00Z')
    expect(feedbackExpiryDate(from).toISOString()).toBe('2026-12-18T10:00:00.000Z')
  })

  it('stays within the 31-day limit the Firestore rule enforces', () => {
    const now = Date.now()
    const days = (feedbackExpiryDate().getTime() - now) / 86_400_000
    expect(days).toBeGreaterThan(29.99)
    expect(days).toBeLessThan(31)
  })

  it('states the deletion date in both interview languages', () => {
    expect(feedbackCopy('sv').retentionNote('18 december 2026'))
      .toBe('Ljudet och dina svar sparas inte. Den här feedbacken raderas automatiskt 18 december 2026.')
    expect(feedbackCopy('en').retentionNote('18 December 2026'))
      .toBe('The audio and your answers are not stored. This feedback is deleted automatically on 18 December 2026.')
  })
})
