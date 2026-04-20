export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const { text, voice = 'shimmer' } = JSON.parse(
      Buffer.concat(chunks).toString()
    )

    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voice,
        response_format: 'mp3',
      }),
    })

    const audioBuffer = await r.arrayBuffer()
    res.setHeader('Content-Type', 'audio/mpeg')
    res.status(200).send(Buffer.from(audioBuffer))
  } catch (error) {
    console.error('TTS error:', error)
    res.status(500).json({ error: error.message })
  }
}
