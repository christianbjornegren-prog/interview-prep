import { describe, it, expect } from 'vitest'
import {
  CONTEXT_FIELDS,
  WHERE,
  buildErrorReport,
  createSessionTrail,
  describeContext,
  diagnoseEvent,
  groupByDiagnosis,
  isAbortError,
  parseUserAgent,
  shouldLogClientError,
  summarizeFunnel,
} from '../../src/lib/diagnostics.js'

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  iphoneLinkedIn:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30.1',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  winEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  androidSamsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
}

describe('parseUserAgent', () => {
  it('recognises Safari on iPhone', () => {
    const p = parseUserAgent(UA.iphoneSafari)
    expect(p).toMatchObject({ os: 'iOS', osVersion: '18.5', device: 'iPhone', browser: 'Safari', mobile: true, webkit: true, inApp: false })
    expect(p.label).toBe('iPhone · Safari 18 · iOS 18.5')
  })

  it('knows that Chrome on iPhone is WebKit underneath – same autoplay rules as Safari', () => {
    const p = parseUserAgent(UA.iphoneChrome)
    expect(p).toMatchObject({ device: 'iPhone', browser: 'Chrome', webkit: true, mobile: true, inApp: false })
  })

  it('flags an embedded in-app browser (link opened inside LinkedIn)', () => {
    const p = parseUserAgent(UA.iphoneLinkedIn)
    expect(p.inApp).toBe(true)
    expect(p.label).toContain('Inbäddad webbläsare')
  })

  it('tells Safari on Mac (WebKit) from Chrome on Mac (not WebKit)', () => {
    expect(parseUserAgent(UA.macSafari)).toMatchObject({ device: 'Mac', browser: 'Safari', webkit: true, mobile: false })
    expect(parseUserAgent(UA.macChrome)).toMatchObject({ device: 'Mac', browser: 'Chrome', webkit: false, mobile: false })
  })

  it('unmasks an iPad that claims to be a Mac', () => {
    const p = parseUserAgent(UA.macSafari, { maxTouchPoints: 5 })
    expect(p).toMatchObject({ os: 'iPadOS', device: 'iPad', mobile: true, webkit: true })
  })

  it('prefers the specific browser marker over the generic Chrome/Safari ones', () => {
    expect(parseUserAgent(UA.winEdge)).toMatchObject({ os: 'Windows', browser: 'Edge', webkit: false })
    expect(parseUserAgent(UA.androidSamsung).browser).toBe('Samsung Internet')
  })

  it('recognises Android phones', () => {
    expect(parseUserAgent(UA.androidChrome)).toMatchObject({
      os: 'Android', osVersion: '14', device: 'Android-telefon', browser: 'Chrome', mobile: true, webkit: false,
    })
  })

  it('survives empty and missing input', () => {
    for (const input of ['', null, undefined]) {
      const p = parseUserAgent(input)
      expect(p.os).toBe('Okänt')
      expect(p.inApp).toBe(false)
      expect(typeof p.label).toBe('string')
    }
  })
})

describe('createSessionTrail', () => {
  const clock = () => {
    let t = 1_000_000
    return { now: () => t, tick: (ms) => { t += ms } }
  }

  it('timestamps every mark relative to the start', () => {
    const c = clock()
    const trail = createSessionTrail({ now: c.now, random: () => 0.5 })
    trail.mark('start')
    c.tick(3200)
    trail.mark('tts:hämtar')
    expect(trail.entries()).toEqual(['+0.0s start', '+3.2s tts:hämtar'])
    expect(trail.elapsedMs()).toBe(3200)
  })

  it('gives every session its own id', () => {
    const a = createSessionTrail({ now: () => 1, random: () => 0.1 })
    const b = createSessionTrail({ now: () => 1, random: () => 0.9 })
    expect(a.id).toMatch(/^s_/)
    expect(a.id).not.toBe(b.id)
  })

  it('keeps the first entry and the LATEST ones when it overflows', () => {
    const c = clock()
    const trail = createSessionTrail({ now: c.now, max: 5 })
    for (let i = 0; i < 20; i++) trail.mark(`steg ${i}`)
    const entries = trail.entries()
    expect(entries).toHaveLength(5)
    expect(entries[0]).toContain('steg 0')
    expect(entries.at(-1)).toContain('steg 19')
  })

  it('clips long labels and hands out copies', () => {
    const trail = createSessionTrail({ now: () => 0 })
    trail.mark('x'.repeat(500))
    expect(trail.entries()[0].length).toBeLessThanOrEqual(80)
    trail.entries().push('manipulerad')
    expect(trail.entries()).toHaveLength(1)
  })
})

describe('isAbortError', () => {
  it('recognises an aborted fetch and nothing else', () => {
    expect(isAbortError({ name: 'AbortError' })).toBe(true)
    expect(isAbortError(new Error('x'))).toBe(false)
    expect(isAbortError(null)).toBe(false)
  })
})

describe('shouldLogClientError', () => {
  it('logs a real error once', () => {
    const seen = new Set()
    expect(shouldLogClientError({ message: 'x is not a function' }, seen)).toBe(true)
    seen.add('x is not a function')
    expect(shouldLogClientError({ message: 'x is not a function' }, seen)).toBe(false)
  })

  it('ignores noise: empty, aborted, ResizeObserver, cross-origin and extensions', () => {
    const seen = new Set()
    expect(shouldLogClientError({ message: '' }, seen)).toBe(false)
    expect(shouldLogClientError({ message: 'avbruten', name: 'AbortError' }, seen)).toBe(false)
    expect(shouldLogClientError({ message: 'ResizeObserver loop limit exceeded' }, seen)).toBe(false)
    expect(shouldLogClientError({ message: 'Script error.' }, seen)).toBe(false)
    expect(shouldLogClientError({ message: 'boom', stack: 'at chrome-extension://abc/x.js:1' }, seen)).toBe(false)
  })

  it('stops after the cap so a loop can never flood the log', () => {
    const seen = new Set(['a', 'b', 'c', 'd', 'e'])
    expect(shouldLogClientError({ message: 'f' }, seen)).toBe(false)
  })
})

// De åtta fel som faktiskt låg i Driftöversikten 2026-11-11 – ordagrant.
describe('diagnoseEvent – the real errors from production', () => {
  const tts = (message) => ({ type: 'pipeline_error', severity: 'error', step: 'tts', message })

  it('explains the most common one: the browser blocked the voice (4 of 8)', () => {
    const d = diagnoseEvent(tts(
      'The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.'
    ))
    expect(d.key).toBe('autoplay-blocked')
    expect(d.where).toBe(WHERE.BROWSER)
    expect(d.benign).toBe(false)
  })

  it('recognises the two aborts as harmless – the user simply left', () => {
    for (const message of ['signal is aborted without reason', 'The user aborted a request.']) {
      const d = diagnoseEvent(tts(message))
      expect(d.key).toBe('user-left')
      expect(d.benign).toBe(true)
    }
  })

  it('points the two handover errors at the database rule', () => {
    const d = diagnoseEvent({
      type: 'pipeline_error', severity: 'error', step: 'pending_migration',
      message: 'Missing or insufficient permissions.',
    })
    expect(d.key).toBe('permissions')
    expect(d.where).toBe(WHERE.APP)
  })
})

describe('diagnoseEvent – errors the new logging can produce', () => {
  const ev = (step, message, context) => ({ type: 'pipeline_error', severity: 'error', step, message, context })

  it('separates a denied microphone from a blocked voice (same error name, different step)', () => {
    expect(diagnoseEvent(ev('mic', 'Permission denied', { errorName: 'NotAllowedError' })).key).toBe('mic-denied')
    expect(diagnoseEvent(ev('tts', 'play() failed', { errorName: 'NotAllowedError' })).key).toBe('autoplay-blocked')
  })

  it('classifies the other microphone failures', () => {
    expect(diagnoseEvent(ev('mic', 'x', { errorName: 'NotFoundError' })).key).toBe('mic-unavailable')
    expect(diagnoseEvent(ev('mic', 'x', { errorName: 'NotSupportedError' })).key).toBe('mic-unsupported')
    expect(diagnoseEvent(ev('recorder', 'Inspelningen avslutades aldrig')).key).toBe('recorder-stalled')
  })

  it('reads the HTTP status from context or from the message', () => {
    expect(diagnoseEvent(ev('tts', 'TTS HTTP 500')).key).toBe('service-down')
    expect(diagnoseEvent(ev('tts', 'x', { httpStatus: 401 })).key).toBe('service-auth')
    expect(diagnoseEvent(ev('whisper', 'x', { httpStatus: 429 })).key).toBe('service-quota')
    expect(diagnoseEvent(ev('whisper', 'x', { httpStatus: 400 })).key).toBe('audio-format')
  })

  it('uses the service response (detail) – that is where OpenAI says what was wrong', () => {
    const d = diagnoseEvent(ev('whisper', 'Whisper HTTP 500', {
      detail: 'Invalid file format. Supported formats: flac, m4a, mp3, mp4, webm',
    }))
    expect(d.key).toBe('audio-format')
  })

  it('warns loudly when OpenAI has retired the voice model', () => {
    const d = diagnoseEvent(ev('tts', 'TTS HTTP 404', { detail: 'The model `tts-1-hd` does not exist' }))
    expect(d.key).toBe('voice-model-retired')
    expect(d.where).toBe(WHERE.SERVICE)
  })

  it('classifies network trouble and timeouts', () => {
    expect(diagnoseEvent(ev('tts', 'Failed to fetch')).key).toBe('network')
    expect(diagnoseEvent(ev('whisper', 'Load failed')).key).toBe('network')
    expect(diagnoseEvent(ev('whisper', 'x', { errorName: 'TimeoutError' })).key).toBe('timeout')
  })

  it('classifies an empty transcription, a failed analysis and an app crash', () => {
    expect(diagnoseEvent(ev('whisper', 'Inget tal detekterat')).key).toBe('no-speech')
    expect(diagnoseEvent(ev('claude', 'Unexpected token')).key).toBe('analysis-failed')
    expect(diagnoseEvent({ type: 'client_error', severity: 'error', step: 'app', message: 'x is undefined' }).key)
      .toBe('app-crash')
  })

  it('admits when it does not know – and always returns a complete diagnosis', () => {
    for (const event of [ev('firestore', 'något helt nytt'), {}, undefined]) {
      const d = diagnoseEvent(event)
      for (const field of ['key', 'title', 'cause', 'action', 'where']) expect(d[field]).toBeTruthy()
      expect(typeof d.benign).toBe('boolean')
    }
    expect(diagnoseEvent(ev('firestore', 'något helt nytt')).key).toBe('unknown')
  })
})

describe('groupByDiagnosis', () => {
  const blocked = 'The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.'
  const events = [
    { step: 'tts', message: blocked, uid: 'a', createdAtMs: 100 },
    { step: 'tts', message: blocked, uid: 'a', createdAtMs: 300 },
    { step: 'tts', message: blocked, uid: 'b', createdAtMs: 200 },
    { step: 'tts', message: 'The user aborted a request.', uid: 'c', createdAtMs: 400 },
  ]

  it('groups by cause, most common first', () => {
    const groups = groupByDiagnosis(events)
    expect(groups.map((g) => g.key)).toEqual(['autoplay-blocked', 'user-left'])
    expect(groups[0]).toMatchObject({ count: 3, users: 2, lastMs: 300, benign: false })
    expect(groups[1]).toMatchObject({ count: 1, users: 1, benign: true })
  })

  it('handles an empty log', () => {
    expect(groupByDiagnosis([])).toEqual([])
    expect(groupByDiagnosis()).toEqual([])
  })
})

describe('summarizeFunnel', () => {
  const e = (type, sessionId, severity = 'info') => ({ type, severity, context: { sessionId } })

  it('follows each started session to its outcome', () => {
    const f = summarizeFunnel([
      e('session_started', 's1'), e('session_completed', 's1'),
      e('session_started', 's2'), e('session_aborted', 's2'),
      e('session_started', 's3'), e('pipeline_error', 's3', 'error'),
      e('session_started', 's4'),
    ])
    expect(f).toEqual({ started: 4, completed: 1, aborted: 1, failed: 1, completionRate: 0.25 })
  })

  it('does not count a session as failed if it recovered and completed', () => {
    const f = summarizeFunnel([
      e('session_started', 's1'), e('pipeline_error', 's1', 'error'), e('session_completed', 's1'),
    ])
    expect(f).toMatchObject({ started: 1, completed: 1, failed: 0 })
  })

  it('counts an error followed by giving up as failed, not as a voluntary abort', () => {
    const f = summarizeFunnel([
      e('session_started', 's1'), e('pipeline_error', 's1', 'error'), e('session_aborted', 's1'),
    ])
    expect(f).toMatchObject({ failed: 1, aborted: 0 })
  })

  it('ignores events without a session id (everything logged before 2026-11)', () => {
    const f = summarizeFunnel([
      { type: 'session_completed', severity: 'info' },
      { type: 'pipeline_error', severity: 'error', context: null },
    ])
    expect(f).toEqual({ started: 0, completed: 0, aborted: 0, failed: 0, completionRate: 0 })
  })
})

describe('describeContext', () => {
  it('labels known fields in reading order and translates booleans', () => {
    expect(describeContext({ mobile: true, device: 'iPhone', online: false })).toEqual([
      ['Enhet', 'iPhone'], ['Online', 'nej'], ['Mobil enhet', 'ja'],
    ])
  })

  it('skips empty values and unknown fields, and survives missing context', () => {
    expect(describeContext({ device: '', route: null, overallScore: 9 })).toEqual([])
    expect(describeContext(null)).toEqual([])
    expect(describeContext(undefined)).toEqual([])
  })

  it('keeps questionIndex 0 – the first question is not "empty"', () => {
    expect(describeContext({ questionIndex: 0 })).toEqual([['Fråga (0 = första)', '0']])
  })
})

describe('CONTEXT_FIELDS – the whitelist', () => {
  it('contains only technical fields, never betyg or interview content', () => {
    for (const forbidden of ['overallScore', 'score', 'transcript', 'answer', 'feedback', 'question', 'name', 'email']) {
      expect(CONTEXT_FIELDS.has(forbidden), forbidden).toBe(false)
    }
    expect(CONTEXT_FIELDS.has('trail')).toBe(true)
    expect(CONTEXT_FIELDS.has('device')).toBe(true)
  })
})

describe('buildErrorReport', () => {
  const event = {
    type: 'pipeline_error', severity: 'error', step: 'tts', uid: 'uid123',
    message: 'TTS HTTP 500', createdAtMs: Date.parse('2026-11-11T10:00:00Z'),
    context: { device: 'iPhone · Safari 18 · iOS 18.5', phase: 'PREPARING_NEXT', sessionId: 's1', trail: ['+0.0s start', '+4.1s tts:hämtar'] },
  }

  it('contains the diagnosis, the details and the trail', () => {
    const report = buildErrorReport(event)
    expect(report).toContain('2026-11-11T10:00:00.000Z')
    expect(report).toContain('[service-down]')
    expect(report).toContain('Enhet: iPhone · Safari 18 · iOS 18.5')
    expect(report).toContain('+4.1s tts:hämtar')
    expect(report).toContain('uid123')
  })

  it('lists the other events of the session in time order', () => {
    const report = buildErrorReport(event, [
      { type: 'pipeline_error', step: 'tts', message: 'TTS HTTP 500', createdAtMs: 2000 },
      { type: 'session_started', step: 'start', message: '5 frågor', createdAtMs: 1000 },
    ])
    expect(report.indexOf('session_started')).toBeLessThan(report.lastIndexOf('pipeline_error'))
    expect(report.indexOf('session_started')).toBeGreaterThan(-1)
  })

  it('works for an old event with no context at all', () => {
    const report = buildErrorReport({
      type: 'pipeline_error', severity: 'error', step: 'tts', uid: 'u', context: null,
      message: 'The user aborted a request.', createdAtMs: null,
    })
    expect(report).toContain('[user-left]')
    expect(report).toContain('okänd tid')
  })
})
