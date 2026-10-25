// Google Cloud Text-to-Speech (Chirp 3 HD). Ersätter OpenAI tts-1-hd, som
// stängs av 2027-01-06 utan någon ren TTS-efterträdare hos OpenAI.
//
// Klientkontraktet är OFÖRÄNDRAT: frontend skickar fortfarande OpenAI:s
// röstnamn (shimmer, onyx, …) och får mp3 tillbaka. Översättningen till
// Googles röster sker enbart här, så interviewScript.js och dess tester rörs inte.
// Samma röstperson finns på båda språken – precis som OpenAI:s flerspråkiga röster.
// Matchat på röstkaraktär (OpenAI-beskrivning → Googles egen beskrivning).
const VOICE_MAP = {
  // Kvinnliga
  shimmer: 'Achernar', // mjuk, lugn → Soft
  nova: 'Zephyr', // ljus, energisk → Bright
  alloy: 'Erinome', // neutral, balanserad → Clear
  // Manliga
  onyx: 'Alnilam', // djup, auktoritativ → Firm
  echo: 'Achird', // varm → Friendly
  fable: 'Sadachbia', // uttrycksfull → Lively
}
const DEFAULT_VOICE = 'shimmer'

// Googles röster är knutna till en locale. Saknat eller okänt språk faller
// tillbaka på svenska – samma princip som i whisper.js.
const LOCALES = { sv: 'sv-SE', en: 'en-US' }
const DEFAULT_LANGUAGE = 'sv'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const startTime = Date.now()
  console.log('[TTS][DEBUG] TTS request received')

  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const { text, voice = DEFAULT_VOICE, language } = JSON.parse(
      Buffer.concat(chunks).toString()
    )

    const locale = LOCALES[language] || LOCALES[DEFAULT_LANGUAGE]
    const googleVoice = VOICE_MAP[voice] || VOICE_MAP[DEFAULT_VOICE]

    console.log('[TTS][DEBUG] TTS request', {
      textLength: text?.length || 0,
      voice,
      locale,
    })

    const r = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: {
        'X-Goog-Api-Key': process.env.GOOGLE_TTS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: locale, name: `${locale}-Chirp3-HD-${googleVoice}` },
        audioConfig: { audioEncoding: 'MP3' },
      }),
    })

    if (!r.ok) {
      const errorText = await r.text()
      console.error('[TTS][ERROR] TTS request failed', {
        status: r.status,
        message: errorText,
      })
      return res.status(r.status).json({ error: errorText || 'TTS API error' })
    }

    const { audioContent } = await r.json()
    const audioBuffer = Buffer.from(audioContent || '', 'base64')
    const duration = Date.now() - startTime

    console.log('[TTS][INFO] TTS response OK', {
      status: r.status,
      audioSize: audioBuffer.byteLength,
      duration: `${duration}ms`,
    })

    res.setHeader('Content-Type', 'audio/mpeg')
    res.status(200).send(audioBuffer)
  } catch (error) {
    console.error('[TTS][ERROR] TTS exception', {
      message: error.message,
      stack: error.stack,
    })
    res.status(500).json({ error: error.message })
  }
}
