import { describe, it, expect } from 'vitest'
import {
  RECORDING_MIME_CANDIDATES,
  pickRecordingMimeType,
  baseMimeType,
  micErrorCopyKey,
} from '../../src/lib/recording.js'
import { buildSilentWav } from '../../src/lib/audioUnlock.js'
import { screenCopy } from '../../src/lib/interviewScript.js'
import { resolveAudioFormat } from '../../api/whisper.js'

describe('pickRecordingMimeType', () => {
  it('keeps WebM/Opus where it is supported (Chrome, Edge, Firefox – as before)', () => {
    expect(pickRecordingMimeType(() => true)).toBe('audio/webm;codecs=opus')
  })

  it('falls back to MP4 on Safari/iPhone, which cannot record WebM', () => {
    expect(pickRecordingMimeType((t) => t === 'audio/mp4')).toBe('audio/mp4')
  })

  it('returns "" when nothing is supported, so the browser picks its own format', () => {
    expect(pickRecordingMimeType(() => false)).toBe('')
  })

  it('survives a missing or throwing isTypeSupported', () => {
    expect(pickRecordingMimeType(undefined)).toBe('')
    expect(pickRecordingMimeType(() => { throw new Error('nope') })).toBe('')
  })

  it('tries WebM before MP4', () => {
    expect(RECORDING_MIME_CANDIDATES.at(-1)).toBe('audio/mp4')
  })
})

describe('baseMimeType', () => {
  it('strips codec parameters', () => {
    expect(baseMimeType('audio/webm;codecs=opus')).toBe('audio/webm')
    expect(baseMimeType('audio/mp4; codecs=mp4a.40.2')).toBe('audio/mp4')
  })

  it('defaults to WebM for empty or missing types (previous behaviour)', () => {
    expect(baseMimeType('')).toBe('audio/webm')
    expect(baseMimeType(null)).toBe('audio/webm')
    expect(baseMimeType(undefined)).toBe('audio/webm')
  })
})

describe('micErrorCopyKey', () => {
  it('maps a denied microphone', () => {
    expect(micErrorCopyKey({ name: 'NotAllowedError' })).toBe('micDenied')
    expect(micErrorCopyKey({ name: 'SecurityError' })).toBe('micDenied')
  })

  it('maps a missing or busy microphone', () => {
    for (const name of ['NotFoundError', 'NotReadableError', 'OverconstrainedError', 'AbortError']) {
      expect(micErrorCopyKey({ name })).toBe('micUnavailable')
    }
  })

  it('treats everything else as an unsupported browser', () => {
    expect(micErrorCopyKey({ name: 'NotSupportedError' })).toBe('micUnsupported')
    expect(micErrorCopyKey(new TypeError('x'))).toBe('micUnsupported')
    expect(micErrorCopyKey(null)).toBe('micUnsupported')
  })

  it('always points at a text that exists in BOTH interview languages', () => {
    for (const name of ['NotAllowedError', 'NotFoundError', 'NotSupportedError']) {
      const key = micErrorCopyKey({ name })
      expect(screenCopy('sv')[key]).toBeTruthy()
      expect(screenCopy('en')[key]).toBeTruthy()
    }
  })
})

describe('screenCopy – texts for the audio fallbacks', () => {
  it('has tap-to-start and failure texts in both languages', () => {
    for (const lang of ['sv', 'en']) {
      const copy = screenCopy(lang)
      for (const key of ['tapToStart', 'tapToStartHint', 'startFailed', 'speechFailed', 'answerFailed', 'noSpeech']) {
        expect(copy[key], `${lang}.${key}`).toBeTruthy()
      }
    }
  })
})

describe('buildSilentWav', () => {
  const text = (bytes, from, to) => String.fromCharCode(...bytes.slice(from, to))

  it('builds a valid RIFF/WAVE header', () => {
    const wav = buildSilentWav(800)
    const view = new DataView(wav.buffer)
    expect(wav.length).toBe(44 + 800)
    expect(text(wav, 0, 4)).toBe('RIFF')
    expect(text(wav, 8, 12)).toBe('WAVE')
    expect(text(wav, 12, 16)).toBe('fmt ')
    expect(text(wav, 36, 40)).toBe('data')
    expect(view.getUint32(4, true)).toBe(36 + 800)   // filstorlek − 8
    expect(view.getUint16(20, true)).toBe(1)         // PCM
    expect(view.getUint16(22, true)).toBe(1)         // mono
    expect(view.getUint32(24, true)).toBe(8000)      // samplingsfrekvens
    expect(view.getUint32(40, true)).toBe(800)       // datalängd
  })

  it('contains only silence', () => {
    const wav = buildSilentWav(50)
    expect([...wav.slice(44)].every((b) => b === 128)).toBe(true)
  })
})

describe('resolveAudioFormat (api/whisper.js)', () => {
  it('names the file after the real format – OpenAI reads the extension', () => {
    expect(resolveAudioFormat('audio/webm')).toEqual({ type: 'audio/webm', extension: 'webm' })
    expect(resolveAudioFormat('audio/mp4')).toEqual({ type: 'audio/mp4', extension: 'mp4' })
    expect(resolveAudioFormat('audio/x-m4a')).toEqual({ type: 'audio/x-m4a', extension: 'm4a' })
  })

  it('ignores codec parameters and casing', () => {
    expect(resolveAudioFormat('Audio/MP4; codecs=mp4a.40.2').extension).toBe('mp4')
    expect(resolveAudioFormat('audio/webm;codecs=opus').extension).toBe('webm')
  })

  it('falls back to WebM for missing or unknown types – older clients are unchanged', () => {
    const webm = { type: 'audio/webm', extension: 'webm' }
    expect(resolveAudioFormat(undefined)).toEqual(webm)
    expect(resolveAudioFormat('')).toEqual(webm)
    expect(resolveAudioFormat('application/octet-stream')).toEqual(webm)
    expect(resolveAudioFormat('text/html')).toEqual(webm)
  })

  it('accepts what the client actually sends for every recording candidate', () => {
    for (const candidate of RECORDING_MIME_CANDIDATES) {
      const sent = baseMimeType(candidate)
      expect(resolveAudioFormat(sent).type).toBe(sent)
    }
  })
})
