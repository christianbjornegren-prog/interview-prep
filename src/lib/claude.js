// updated build - force redeploy
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5'

const SYSTEM_PROMPT =
  'Du är en karriärcoach som extraherar kompetenser från professionella dokument.\n' +
  'Returnera ENDAST giltig JSON utan markdown eller backticks.\n' +
  'Schema: { competencies: [{ id, title, description, tags, impact, context }] }\n' +
  '- title: kort beskrivande rubrik (max 8 ord)\n' +
  '- description: vad personen gjorde och hur (2-3 meningar)\n' +
  '- tags: 3-6 relevanta kompetenstaggar på svenska (t.ex. ledarskap, azure, förändringsledning)\n' +
  '- impact: konkret resultat eller värde som skapades\n' +
  '- context: organisation och tidsperiod'

/**
 * Extract competencies from a File object.
 * @param {File} file - the uploaded File
 * @param {'pdf'|'docx'} fileType
 * @returns {Promise<Array>} array of competency objects
 */
export async function extractCompetencies(file, fileType) {
  const apiKey = import.meta.env.VITE_CLAUDE_API_KEY
  if (!apiKey) {
    throw new Error('Claude API-nyckel saknas. Kontrollera VITE_CLAUDE_API_KEY i .env.local.')
  }

  let messageContent

  if (fileType === 'docx') {
    const mammoth = (await import('mammoth')).default
    const arrayBuffer = await file.arrayBuffer()
    const { value: text } = await mammoth.extractRawText({ arrayBuffer })
    if (!text.trim()) {
      throw new Error('Kunde inte läsa text från DOCX-filen. Kontrollera att filen inte är skadad.')
    }
    messageContent = [
      {
        type: 'text',
        text: 'Analysera följande dokument och extrahera alla yrkeskompetenser:\n\n' + text,
      },
    ]
  } else {
    // PDF – send as base64 document block
    const base64 = await fileToBase64(file)
    messageContent = [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: base64,
        },
      },
      {
        type: 'text',
        text: 'Analysera detta dokument och extrahera alla yrkeskompetenser.',
      },
    ]
  }

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: messageContent }],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Claude API-fel (${response.status}): ${errorBody}`)
  }

  const data = await response.json()
  const rawText = data.content[0].text
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Ingen JSON hittades i svaret')
  const parsed = JSON.parse(jsonMatch[0])
  return parsed.competencies
}

// ── Internal helpers ──────────────────────────────────────────────────────

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
