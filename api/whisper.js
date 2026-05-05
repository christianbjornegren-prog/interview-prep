export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const startTime = Date.now()
  console.log('[OPENAI][DEBUG] Whisper request received')

  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const audioBuffer = Buffer.concat(chunks)

    console.log('[OPENAI][DEBUG] Audio buffer size:', audioBuffer.length)

    const formData = new FormData()
    formData.append(
      'file',
      new Blob([audioBuffer], { type: 'audio/webm' }),
      'audio.webm'
    )
    formData.append('model', 'whisper-1')
    formData.append('language', 'sv')

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
