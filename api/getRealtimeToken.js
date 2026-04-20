import FormData from 'form-data'

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

    const form = new FormData()
    form.append('sdp', sdp, {
      filename: 'offer.sdp',
      contentType: 'application/sdp',
    })
    form.append('session', JSON.stringify(sessionConfig), {
      contentType: 'application/json',
    })

    console.log('Skickar till OpenAI...')

    const r = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        ...form.getHeaders(),
      },
      body: form.getBuffer(),
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
