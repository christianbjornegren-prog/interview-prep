export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-instructions')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const sdp = Buffer.concat(chunks).toString()

    console.log('SDP mottagen, längd:', sdp.length)
    console.log('SDP börjar med:', sdp.slice(0, 50))

    const sessionConfig = {
      type: 'realtime',
      model: 'gpt-4o-realtime-preview-2024-12-17',
      voice: 'shimmer',
      modalities: ['audio', 'text'],
      turn_detection: { type: 'server_vad' },
    }

    const boundary = '----FormBoundary' + Date.now()

    const CRLF = '\r\n'
    const parts = []

    parts.push(`--${boundary}`)
    parts.push(`Content-Disposition: form-data; name="sdp"; filename="offer.sdp"`)
    parts.push(`Content-Type: application/sdp`)
    parts.push('')
    parts.push(sdp)

    parts.push(`--${boundary}`)
    parts.push(`Content-Disposition: form-data; name="session"`)
    parts.push(`Content-Type: application/json`)
    parts.push('')
    parts.push(JSON.stringify(sessionConfig))

    parts.push(`--${boundary}--`)
    parts.push('')

    const body = parts.join(CRLF)

    console.log('Boundary:', boundary)
    console.log('Body preview:', body.slice(0, 300))

    const r = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(body).toString(),
      },
      body,
    })

    const responseText = await r.text()
    console.log('OpenAI status:', r.status)
    console.log('OpenAI svar:', responseText.slice(0, 200))

    res.setHeader('Content-Type', 'application/sdp')
    res.status(r.status).send(responseText)
  } catch (error) {
    console.error('Fel:', error)
    res.status(500).json({ error: error.message })
  }
}
