export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const audioBuffer = Buffer.concat(chunks)

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
    console.log('Whisper status:', r.status, 'text:', data.text)
    res.status(200).json({ text: data.text || '' })
  } catch (error) {
    console.error('Whisper error:', error)
    res.status(500).json({ error: error.message })
  }
}
