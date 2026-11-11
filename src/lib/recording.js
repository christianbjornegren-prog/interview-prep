// ── Inspelningsformat och mikrofonfel ─────────────────────────────────────
//
// Rena hjälpare (ingen DOM) så de kan enhetstestas.
//
// Chrome, Edge och Firefox spelar in WebM. Safari – och därmed ALLA
// webbläsare på iPhone/iPad – spelar in MP4 och kastar NotSupportedError om
// man begär WebM. Formatet väljs därför efter vad webbläsaren säger sig klara,
// och följer sedan med hela vägen till transkriberingen (api/whisper.js).

/** Prioritetsordning. WebM först: det är dagens beteende i Chrome/Edge/Firefox. */
export const RECORDING_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
]

/**
 * Första formatet webbläsaren stöder, eller '' om inget i listan stöds – då
 * låter anroparen webbläsaren välja själv (new MediaRecorder(stream)).
 *
 * @param {(type: string) => boolean} [isTypeSupported] t.ex. MediaRecorder.isTypeSupported
 */
export function pickRecordingMimeType(isTypeSupported) {
  if (typeof isTypeSupported !== 'function') return ''
  for (const type of RECORDING_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(type)) return type
    } catch { /* en webbläsare som kastar här stöder inte formatet */ }
  }
  return ''
}

/** 'audio/webm;codecs=opus' → 'audio/webm'. Tomt/okänt → 'audio/webm' (som förut). */
export function baseMimeType(type) {
  const base = String(type ?? '').split(';')[0].trim().toLowerCase()
  return base || 'audio/webm'
}

/**
 * Vilken förklaring användaren ska få när mikrofonen inte går att starta.
 * Returnerar en nyckel i screenCopy (lib/interviewScript.js).
 *
 * @param {{ name?: string } | null | undefined} err
 * @returns {'micDenied' | 'micUnavailable' | 'micUnsupported'}
 */
export function micErrorCopyKey(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'micDenied'
    case 'NotFoundError':
    case 'NotReadableError':
    case 'OverconstrainedError':
    case 'AbortError':
      return 'micUnavailable'
    default:
      // NotSupportedError, TypeError (mediaDevices saknas i inbäddade
      // webbläsare och på osäkra sidor) och allt okänt.
      return 'micUnsupported'
  }
}
