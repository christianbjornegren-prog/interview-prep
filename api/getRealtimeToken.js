export const config = {
  api: {
    bodyParser: false,
  },
}

async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-instructions')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const sdp = await readRawBody(req)
    console.log('Received SDP length:', sdp?.length)

    const sessionConfig = JSON.stringify({
      type: 'realtime',
      model: 'gpt-4o-realtime-preview-2024-12-17',
      voice: 'shimmer',
      instructions: req.headers['x-instructions'] || 'You are a helpful assistant.',
      modalities: ['audio', 'text'],
      turn_detection: { type: 'server_vad' },
    })

    const fd = new FormData()
    fd.set('sdp', new Blob([sdp], { type: 'application/sdp' }), 'offer.sdp')
    fd.set('session', new Blob([sessionConfig], { type: 'application/json' }))

    const r = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: fd,
    })
    console.log('OpenAI response status:', r.status)

    const answerSdp = await r.text()
    res.setHeader('Content-Type', 'application/sdp')
    res.status(r.status).send(answerSdp)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: error.message })
  }
}
