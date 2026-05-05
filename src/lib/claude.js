// updated build - force redeploy
import { logger, CATEGORIES } from './logger'

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5'

// ── Shared helpers ────────────────────────────────────────────────────────

/**
 * Strip all ID fields from competency objects before sending to Claude.
 * Only name, description, and tags are semantically meaningful for prompts.
 */
export function sanitizeCompetencies(competencies) {
  return (competencies || []).map((c) => ({
    namn: c.title || c.namn || '',
    beskrivning: c.description || c.beskrivning || '',
    taggar: c.tags || c.taggar || [],
  }))
}

const NO_ID_INSTRUCTION =
  'Referera ALDRIG till kompetenser med ID, nummer eller tekniska koder som comp_014 eller komp_15. ' +
  'Använd ALLTID kompetensens faktiska namn.'

// ── Competency extraction ─────────────────────────────────────────────────

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

  const requestBody = {
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: messageContent }],
  }

  logger.debug(CATEGORIES.CLAUDE, 'Extract competencies request', {
    model: MODEL,
    promptLength: SYSTEM_PROMPT.length,
    fileType,
  })

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    logger.error(CATEGORIES.CLAUDE, 'Extract competencies failed', {
      status: response.status,
      message: errorBody,
    })
    throw new Error(`Claude API-fel (${response.status}): ${errorBody}`)
  }

  onProgress('Analyserar kompetenser...', 60)
  const data = await response.json()
  const rawText = data.content[0].text

  logger.info(CATEGORIES.CLAUDE, 'Extract competencies response OK', {
    responseLength: rawText.length,
  })

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
  '      "rationale": "string (varför denna fråga ställs i sammanhanget)"\n' +
  '    }\n' +
  '  ],\n' +
  '  "gapAnalysis": {\n' +
  '    "covered": [\n' +
  '      { "requirement": "string (krav från annonsen)", "competencyName": "string (matchande kompetensnamn)", "strength": "hög|medel|låg" }\n' +
  '    ],\n' +
  '    "gaps": [\n' +
  '      { "requirement": "string (ej täckt krav)", "suggestion": "string (hur kandidaten kan adressera gapet)" }\n' +
  '    ]\n' +
  '  }\n' +
  '}\n' +
  'Generera 8-12 intervjufrågor fördelade mellan kategorierna erfarenhet, kompetens, situation och motivation.\n' +
  NO_ID_INSTRUCTION

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

  const competencySummary = sanitizeCompetencies(competencies)

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

  const requestBody = {
    model: MODEL,
    max_tokens: 4000,
    system: JOB_ANALYSIS_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  }

  logger.debug(CATEGORIES.CLAUDE, 'Analyze job posting request', {
    model: MODEL,
    promptLength: JOB_ANALYSIS_SYSTEM_PROMPT.length,
    competencyCount: competencies?.length || 0,
  })

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    logger.error(CATEGORIES.CLAUDE, 'Analyze job posting failed', {
      status: response.status,
      message: errorBody,
    })
    throw new Error(`Claude API-fel (${response.status}): ${errorBody}`)
  }

  onProgress('Genererar intervjufrågor...', 65)
  const data = await response.json()
  const rawText = data.content[0].text

  logger.info(CATEGORIES.CLAUDE, 'Analyze job posting response OK', {
    responseLength: rawText.length,
  })

  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Ingen JSON hittades i svaret')

  onProgress('Skapar gap-analys...', 90)
  const parsed = JSON.parse(jsonMatch[0])
  return parsed
}

// ── Interview feedback analysis ───────────────────────────────────────────

const FEEDBACK_SYSTEM_PROMPT =
  'Du är en erfaren intervjucoach som analyserar intervjuer.\n' +
  'Returnera ENDAST giltig JSON utan markdown eller backticks.\n' +
  'Schema:\n' +
  '{\n' +
  '  "overallScore": number (1-5),\n' +
  '  "summary": "string (övergripande sammanfattning på svenska, 2-3 meningar)",\n' +
  '  "strengths": ["styrka 1", "styrka 2", "styrka 3"],\n' +
  '  "improvements": ["förbättring 1", "förbättring 2", "förbättring 3"],\n' +
  '  "competencyGaps": ["Baserat på din kompetens inom X borde du ha nämnt Y"],\n' +
  '  "questionFeedback": [\n' +
  '    {\n' +
  '      "question": "string (frågan)",\n' +
  '      "score": number (1-5),\n' +
  '      "comment": "string (specifik feedback på svenska)"\n' +
  '    }\n' +
  '  ]\n' +
  '}\n' +
  'Tala ALLTID på svenska. Var konstruktiv och konkret i din feedback.\n' +
  NO_ID_INSTRUCTION

/**
 * Analyze interview transcript and generate feedback.
 * @param {Array} transcript - array of {question: string, answer: string}
 * @param {string} jobTitle - the job title
 * @param {string} company - the company name
 * @param {Array} competencies - the user's competency bank
 * @param {Object} [interviewConfig] - { focus, difficulty }
 * @returns {Promise<Object>} parsed feedback object
 */
export async function analyzeInterviewFeedback(transcript, jobTitle, company, competencies = [], interviewConfig = {}) {
  const apiKey = import.meta.env.VITE_CLAUDE_API_KEY
  if (!apiKey) {
    throw new Error('Claude API-nyckel saknas. Kontrollera VITE_CLAUDE_API_KEY i .env.local.')
  }

  const configNote =
    `Anpassa feedback efter intervjukonfiguration: ` +
    `Fokus: ${interviewConfig.focus ?? 'Mix'}, ` +
    `Svårighetsgrad: ${interviewConfig.difficulty ?? 'Standard'}. ` +
    `Tala ALLTID på svenska.\n\n`

  const sanitized = sanitizeCompetencies(competencies)

  const userMessage =
    `Analysera denna intervju och ge feedback.\n\n` +
    configNote +
    `Kandidatens kompetensbank:\n${JSON.stringify(sanitized, null, 2)}\n\n` +
    `Jobbroll: ${jobTitle} på ${company}\n\n` +
    `Frågor och svar:\n${JSON.stringify(transcript, null, 2)}`

  logger.debug(CATEGORIES.CLAUDE, 'Analyze interview feedback request', {
    model: MODEL,
    transcriptLength: transcript.length,
    jobTitle,
  })

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
      max_tokens: 3000,
      system: FEEDBACK_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    logger.error(CATEGORIES.CLAUDE, 'Analyze interview feedback failed', {
      status: response.status,
      message: errorBody,
    })
    throw new Error(`Claude API-fel (${response.status}): ${errorBody}`)
  }

  const data = await response.json()
  const rawText = data.content[0].text

  logger.info(CATEGORIES.CLAUDE, 'Analyze interview feedback response OK', {
    responseLength: rawText.length,
  })

  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Ingen JSON hittades i svaret')

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
