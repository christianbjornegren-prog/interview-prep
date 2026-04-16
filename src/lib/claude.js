const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5'

const SYSTEM_PROMPT =
  'Du är en karriärcoach som extraherar och strukturerar kompetenser från CV:n och professionella dokument. ' +
  'Returnera ALLTID valid JSON, inget annat – ingen markdown, inga backticks.'

const USER_PROMPT_TEMPLATE = `Analysera följande text och extrahera alla yrkeskompetenser.
Returnera ett JSON-objekt med detta exakta schema (inga extra fält, inga kommentarer):
{
  "competencies": [
    {
      "id": "uuid-string",
      "title": "Kompetensens titel",
      "description": "Kort beskrivning av kompetensen",
      "tags": ["tagg1", "tagg2"],
      "impact": "Vilken påverkan/resultat kompetensen lett till",
      "context": "I vilket sammanhang kompetensen användes"
    }
  ]
}

Text att analysera:
`

/**
 * Sends plain text content to Claude and returns an array of extracted competencies.
 * @param {string} textContent – the raw text from the uploaded document
 * @returns {Promise<Array>} array of competency objects
 */
export async function extractCompetencies(textContent) {
  const apiKey = import.meta.env.VITE_CLAUDE_API_KEY
  if (!apiKey) {
    throw new Error('Claude API-nyckel saknas. Kontrollera VITE_CLAUDE_API_KEY i .env.local.')
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
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: USER_PROMPT_TEMPLATE + textContent,
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Claude API-fel (${response.status}): ${errorBody}`)
  }

  const data = await response.json()
  const rawText = data.content?.[0]?.text ?? ''

  let parsed
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new Error('Claude returnerade ogiltig JSON. Råsvar: ' + rawText.slice(0, 200))
  }

  if (!Array.isArray(parsed.competencies)) {
    throw new Error('Oväntat JSON-format från Claude – fältet "competencies" saknas.')
  }

  return parsed.competencies
}

/**
 * Sends a PDF file (as base64) to Claude using the document content type.
 * @param {string} base64Data – base64-encoded PDF bytes
 * @returns {Promise<Array>} array of competency objects
 */
export async function extractCompetenciesFromPDF(base64Data) {
  const apiKey = import.meta.env.VITE_CLAUDE_API_KEY
  if (!apiKey) {
    throw new Error('Claude API-nyckel saknas. Kontrollera VITE_CLAUDE_API_KEY i .env.local.')
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
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: USER_PROMPT_TEMPLATE,
            },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Claude API-fel (${response.status}): ${errorBody}`)
  }

  const data = await response.json()
  const rawText = data.content?.[0]?.text ?? ''

  let parsed
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new Error('Claude returnerade ogiltig JSON. Råsvar: ' + rawText.slice(0, 200))
  }

  if (!Array.isArray(parsed.competencies)) {
    throw new Error('Oväntat JSON-format från Claude – fältet "competencies" saknas.')
  }

  return parsed.competencies
}
