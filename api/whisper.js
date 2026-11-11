// Transkriberingsspråk som proxyn accepterar. Allt annat – saknat, okänt eller
// riggat – faller tillbaka på svenska, så en trasig förfrågan aldrig kan ge en
// tyst felaktig transkribering. Att ANGE språk (i stället för att låta modellen
// gissa) är dokumenterat bättre för både träffsäkerhet och svarstid.
const SUPPORTED_LANGUAGES = new Set(['sv', 'en'])
const DEFAULT_LANGUAGE = 'sv'

function resolveLanguage(req) {
  try {
    const url = new URL(req.url, `http://${req.headers?.host || 'localhost'}`)
    const requested = url.searchParams.get('language')
    return SUPPORTED_LANGUAGES.has(requested) ? requested : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

// Inspelningsformat per webbläsare: Chrome/Edge/Firefox skickar WebM, Safari
// och ALLA webbläsare på iPhone/iPad skickar MP4. OpenAI avgör formatet på
// FILNAMNETS ändelse, så en MP4 som kallas audio.webm avvisas. Okänd eller
// saknad Content-Type → webm, exakt som förut (äldre klienter är oförändrade).
const AUDIO_FORMATS = {
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/mp4': 'mp4',
  'video/mp4': 'mp4',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
}

export function resolveAudioFormat(contentType) {
  const type = String(contentType ?? '').split(';')[0].trim().toLowerCase()
  const extension = AUDIO_FORMATS[type]
  return extension
    ? { type, extension }
    : { type: 'audio/webm', extension: 'webm' }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const startTime = Date.now()
  const language = resolveLanguage(req)
  const format = resolveAudioFormat(req.headers?.['content-type'])
  console.log('[OPENAI][DEBUG] Whisper request received', { language, format: format.extension })

  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const audioBuffer = Buffer.concat(chunks)

    console.log('[OPENAI][DEBUG] Audio buffer size:', audioBuffer.length)

    const formData = new FormData()
    formData.append(
      'file',
      new Blob([audioBuffer], { type: format.type }),
      `audio.${format.extension}`
    )
    formData.append('model', 'whisper-1')
    formData.append('language', language)

    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: formData,
    })

    const data = await r.json()
    const duration = Date.now() - startTime
    
    if (r.ok) {
      console.log('[OPENAI][INFO] Whisper response OK', {
        status: r.status,
        textLength: data.text?.length || 0,
        duration: `${duration}ms`,
      })
      res.status(200).json({ text: data.text || '' })
    } else {
      console.error('[OPENAI][ERROR] Whisper request failed', {
        status: r.status,
        message: data.error?.message || 'Unknown error',
      })
      res.status(r.status).json({ error: data.error?.message || 'Whisper API error' })
    }
  } catch (error) {
    console.error('[OPENAI][ERROR] Whisper exception', {
      message: error.message,
      stack: error.stack,
    })
    res.status(500).json({ error: error.message })
  }
}
