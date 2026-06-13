import { describe, it, expect } from 'vitest'
import { toDate, describeShareStatus, buildShareUpdate } from '../../src/lib/sharing.js'

describe('toDate', () => {
  it('returns null for falsy input', () => {
    expect(toDate(null)).toBe(null)
    expect(toDate(undefined)).toBe(null)
  })

  it('passes through a Date', () => {
    const d = new Date('2026-01-02T00:00:00Z')
    expect(toDate(d)).toBe(d)
  })

  it('calls toDate() on a Firestore Timestamp-like value', () => {
    const d = new Date('2026-03-04T00:00:00Z')
    expect(toDate({ toDate: () => d })).toBe(d)
  })
})

describe('describeShareStatus', () => {
  it('treats a missing field as not shared (default false)', () => {
    const s = describeShareStatus({})
    expect(s.shared).toBe(false)
    expect(s.label).toBe('Privat – syns bara för dig')
  })

  it('treats sharedWithSeller=false as private', () => {
    const s = describeShareStatus({ sharedWithSeller: false })
    expect(s.shared).toBe(false)
  })

  it('reports shared with a date when sharedAt is present', () => {
    const sharedAt = { toDate: () => new Date('2026-06-13T10:00:00Z') }
    const s = describeShareStatus({ sharedWithSeller: true, sharedAt })
    expect(s.shared).toBe(true)
    expect(s.label).toMatch(/^Delad med din säljare sedan /)
    expect(s.date).toBeTruthy()
  })

  it('reports shared without date when sharedAt is missing', () => {
    const s = describeShareStatus({ sharedWithSeller: true })
    expect(s.shared).toBe(true)
    expect(s.label).toBe('Delad med din säljare')
    expect(s.date).toBe(null)
  })
})

describe('buildShareUpdate', () => {
  it('turning ON sets sharedWithSeller=true and leaves sharedAt to caller', () => {
    const u = buildShareUpdate(true)
    expect(u).toEqual({ sharedWithSeller: true })
    expect('sharedAt' in u).toBe(false)
  })

  it('turning OFF clears both fields', () => {
    expect(buildShareUpdate(false)).toEqual({ sharedWithSeller: false, sharedAt: null })
  })
})
