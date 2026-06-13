import { describe, it, expect } from 'vitest'
import { computeChecklist, resolvePrimaryCta, resolveEmptyState } from '../../src/lib/onboarding.js'

describe('computeChecklist', () => {
  it('all steps unchecked when nothing is done', () => {
    const c = computeChecklist({ profileActivated: false, jobCount: 0, feedbackCount: 0 })
    expect(c).toEqual({ cvUploaded: false, jobAdded: false, firstTraining: false, allDone: false })
  })

  it('CV step ticked when profileActivated is true', () => {
    const c = computeChecklist({ profileActivated: true, jobCount: 0, feedbackCount: 0 })
    expect(c.cvUploaded).toBe(true)
    expect(c.jobAdded).toBe(false)
    expect(c.firstTraining).toBe(false)
    expect(c.allDone).toBe(false)
  })

  it('job step ticked when at least one job exists', () => {
    expect(computeChecklist({ profileActivated: true, jobCount: 2, feedbackCount: 0 }).jobAdded).toBe(true)
  })

  it('training step ticked when at least one feedback exists', () => {
    expect(computeChecklist({ profileActivated: true, jobCount: 1, feedbackCount: 1 }).firstTraining).toBe(true)
  })

  it('allDone only when all three are satisfied', () => {
    expect(computeChecklist({ profileActivated: true, jobCount: 1, feedbackCount: 1 }).allDone).toBe(true)
    expect(computeChecklist({ profileActivated: true, jobCount: 1, feedbackCount: 0 }).allDone).toBe(false)
    expect(computeChecklist({ profileActivated: false, jobCount: 1, feedbackCount: 1 }).allDone).toBe(false)
  })

  it('treats missing input as zero/false', () => {
    const c = computeChecklist()
    expect(c).toEqual({ cvUploaded: false, jobAdded: false, firstTraining: false, allDone: false })
  })
})

describe('resolvePrimaryCta', () => {
  it('hidden when there are no jobs', () => {
    expect(resolvePrimaryCta([])).toEqual({ mode: 'hidden' })
    expect(resolvePrimaryCta()).toEqual({ mode: 'hidden' })
  })

  it('navigates directly when exactly one job', () => {
    expect(resolvePrimaryCta([{ docId: 'job123' }])).toEqual({ mode: 'single', jobId: 'job123' })
  })

  it('shows a picker when multiple jobs', () => {
    expect(resolvePrimaryCta([{ docId: 'a' }, { docId: 'b' }])).toEqual({ mode: 'multi' })
  })
})

describe('resolveEmptyState', () => {
  it('no-jobs when there are zero jobs', () => {
    expect(resolveEmptyState({ jobCount: 0, feedbackCount: 0 })).toBe('no-jobs')
  })

  it('no-training when jobs exist but no feedback', () => {
    expect(resolveEmptyState({ jobCount: 3, feedbackCount: 0 })).toBe('no-training')
  })

  it('normal when jobs and at least one feedback exist', () => {
    expect(resolveEmptyState({ jobCount: 3, feedbackCount: 1 })).toBe('normal')
  })

  it('defaults to no-jobs on missing input', () => {
    expect(resolveEmptyState()).toBe('no-jobs')
  })
})
