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
  '- context: organisation och tidsperiod\n' +
  'Var koncis i description-fältet – max 2 meningar. Prioritera kvalitet över kvantitet – extrahera max 15 kompetenser även om dokumentet innehåller fler.'

/**
 * Extract competencies from a File object.
 * @param {File} file - the uploaded File
 * @param {'pdf'|'docx'} fileType
 * @param {(message: string, percent: number) => void} [onProgress]
 * @returns {Promise<Array>} array of competency objects
 */
export async function extractCompetencies(file, fileType, onProgress = () => {}) {
  const apiKey = import.meta.env.VITE_CLAUDE_API_KEY
  if (!apiKey) {
    throw new Error('Claude API-nyckel saknas. Kontrollera VITE_CLAUDE_API_KEY i .env.local.')
  }

  let messageContent

  onProgress('Läser dokumentet...', 10)

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

  onProgress('Skickar till Claude...', 30)
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
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: messageContent }],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Claude API-fel (${response.status}): ${errorBody}`)
  }

  onProgress('Analyserar kompetenser...', 60)
  const data = await response.json()
  const rawText = data.content[0].text
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Ingen JSON hittades i svaret')
  const parsed = JSON.parse(jsonMatch[0])
  return parsed.competencies
}

// ── Job posting analysis ─────────────────────────────────────────────────

const JOB_ANALYSIS_SYSTEM_PROMPT =
  'Du är en senior karriärcoach och intervjuspecialist.\n' +
  'Analysera jobbannonsen och generera ett strukturerat underlag för intervjuförberedelse.\n' +
  'Returnera ENDAST giltig JSON utan markdown eller backticks.\n' +
  'Schema:\n' +
  '{\n' +
  '  "jobTitle": "string",\n' +
  '  "company": "string",\n' +
  '  "summary": "string (2-3 meningar om rollen)",\n' +
  '  "questions": [\n' +
  '    {\n' +
  '      "id": "string (kort unikt id, t.ex. q1, q2)",\n' +
  '      "question": "string (intervjufrågan på svenska)",\n' +
  '      "category": "erfarenhet|kompetens|situation|motivation",\n' +
  '      "rationale": "string (varför denna fråga ställs i sammanhanget)",\n' +
  '      "relevantCompetencies": ["competency_id från kandidatens bank"]\n' +
  '    }\n' +
  '  ],\n' +
  '  "gapAnalysis": {\n' +
  '    "covered": [\n' +
  '      { "requirement": "string (krav från annonsen)", "competencyId": "string (matchande id)", "strength": "hög|medel|låg" }\n' +
  '    ],\n' +
  '    "gaps": [\n' +
  '      { "requirement": "string (ej täckt krav)", "suggestion": "string (hur kandidaten kan adressera gapet)" }\n' +
  '    ]\n' +
  '  }\n' +
  '}\n' +
  'Generera 8-12 intervjufrågor fördelade mellan kategorierna erfarenhet, kompetens, situation och motivation.\n' +
  'Vid matchning mot kompetensbanken: använd id-värdet från inputen exakt som det är skrivet.'

/**
 * Analyze a job posting and generate interview preparation material.
 * @param {string} jobText - the raw job posting text
 * @param {string} companyInfo - optional free-text info about the company
 * @param {Array} competencies - the user's competency bank
 * @param {(message: string, percent: number) => void} [onProgress]
 * @returns {Promise<Object>} parsed analysis object
 */
export async function analyzeJobPosting(jobText, companyInfo, competencies, onProgress = () => {}) {
  const apiKey = import.meta.env.VITE_CLAUDE_API_KEY
  if (!apiKey) {
    throw new Error('Claude API-nyckel saknas. Kontrollera VITE_CLAUDE_API_KEY i .env.local.')
  }

  onProgress('Läser jobbannonsen...', 10)

  const competencySummary = (competencies || []).map((c) => ({
    id: c.id,
    title: c.title,
    tags: c.tags ?? [],
  }))

  const parts = [
    'Analysera följande jobbannons och generera intervjuförberedelse:',
    '',
    '## Jobbannons',
    jobText.trim(),
  ]
  if (companyInfo && companyInfo.trim()) {
    parts.push('', '## Om företaget', companyInfo.trim())
  }
  parts.push('', '## Kandidatens kompetensbank', JSON.stringify(competencySummary, null, 2))
  const userMessage = parts.join('\n')

  onProgress('Matchar mot kompetensbanken...', 30)

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
      system: JOB_ANALYSIS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Claude API-fel (${response.status}): ${errorBody}`)
  }

  onProgress('Genererar intervjufrågor...', 65)
  const data = await response.json()
  const rawText = data.content[0].text
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Ingen JSON hittades i svaret')

  onProgress('Skapar gap-analys...', 90)
  const parsed = JSON.parse(jsonMatch[0])
  return parsed
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
