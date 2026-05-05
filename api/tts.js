export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const startTime = Date.now()
  console.log('[OPENAI][DEBUG] TTS request received')

  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const { text, voice = 'shimmer' } = JSON.parse(
      Buffer.concat(chunks).toString()
    )

    console.log('[OPENAI][DEBUG] TTS request', {
      textLength: text?.length || 0,
      voice,
    })

    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        input: text,
        voice: voice,
        response_format: 'mp3',
      }),
    })

    if (!r.ok) {
      const errorText = await r.text()
      console.error('[OPENAI][ERROR] TTS request failed', {
        status: r.status,
        message: errorText,
      })
      return res.status(r.status).json({ error: errorText || 'TTS API error' })
    }

    const audioBuffer = await r.arrayBuffer()
    const duration = Date.now() - startTime
    
    console.log('[OPENAI][INFO] TTS response OK', {
      status: r.status,
      audioSize: audioBuffer.byteLength,
      duration: `${duration}ms`,
    })
    
    res.setHeader('Content-Type', 'audio/mpeg')
    res.status(200).send(Buffer.from(audioBuffer))
  } catch (error) {
    console.error('[OPENAI][ERROR] TTS exception', {
      message: error.message,
      stack: error.stack,
    })
    res.status(500).json({ error: error.message })
  }
}
