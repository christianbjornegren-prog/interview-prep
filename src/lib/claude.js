// updated build - force redeploy

import { LANGUAGES, normalizeLanguage } from './language.js'

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

/**
 * Extract the first top-level JSON object from a Claude text response.
 * Throws a clear, actionable error if none is found or if it is malformed
 * (e.g. the response was truncated at max_tokens mid-JSON).
 */
export function extractJsonObject(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('Tomt svar från Claude – försök igen.')
  }
  const match = rawText.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Ingen JSON hittades i svaret')
  try {
    return JSON.parse(match[0])
  } catch {
    throw new Error(
      'Svaret från Claude var ofullständigt (kunde inte tolkas som JSON). ' +
      'Detta beror oftast på ett för långt svar – försök igen.'
    )
  }
}

/** Read the first text block from a Claude Messages response, guarded. */
function firstTextBlock(data) {
  const text = data?.content?.find?.((b) => b.type === 'text')?.text
  if (typeof text !== 'string') throw new Error('Inget textinnehåll i svaret')
  return text
}

// ── Competency extraction ─────────────────────────────────────────────────

export const CATEGORY_ENUM = [
  'Mjukvaruutveckling & programmering',
  'IT-arkitektur & design',
  'Molntjänster & Azure',
  'Systemintegration & API',
  'Testning & kvalitetssäkring',
  'Microsoft 365 & modern arbetsplats',
  'Informationsförvaltning & governance',
  'Data & analys',
  'IT-säkerhet & compliance',
  'Ledarskap & organisation',
  'Affärsutveckling & strategi',
  'AI & innovation',
  'Övrigt',
]

const COMPETENCY_TOOL = {
  name: 'save_competencies',
  description: 'Spara alla extraherade yrkeskompetenser från dokumentet.',
  input_schema: {
    type: 'object',
    properties: {
      competencies: {
        type: 'array',
        description: 'Alla relevanta yrkeskompetenser. Minimum 5, maximum 25.',
        items: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Kort beskrivande rubrik, max 8 ord',
            },
            description: {
              type: 'string',
              description: 'Vad personen gjorde och hur, inklusive konkret resultat – max 2 meningar',
            },
            category: {
              type: 'string',
              enum: CATEGORY_ENUM,
            },
            tags: {
              type: 'array',
              description: '3-6 specifika tekniker, ramverk eller metoder – kortare sökbara termer, aldrig meningar',
              items: { type: 'string' },
              minItems: 1,
            },
            strength: {
              type: 'string',
              enum: ['Hög', 'Medel', 'Låg'],
              description: 'Hur väl kompetensen är dokumenterad och demonstrerad',
            },
            context: {
              type: 'string',
              description: 'Organisation och tidsperiod, t.ex. "Bolagsnamn, 2021–2023". Om okänt: "Framgår ej av dokumentet"',
            },
          },
          required: ['title', 'description', 'category', 'tags', 'strength', 'context'],
        },
      },
    },
    required: ['competencies'],
  },
}

const SYSTEM_PROMPT =
  'Du är en karriärcoach som extraherar yrkeskompetenser från professionella dokument.\n' +
  'Extrahera ALLA relevanta kompetenser. Minimum 5, maximum 25. Kvalitet över kvantitet – ingen utfyllnad.\n' +
  'Boulder AB levererar främst utvecklingskonsulter. Var generös med "Mjukvaruutveckling & programmering" – ' +
  'React, TypeScript, Angular, C#, .NET, Node.js och liknande ska ALLTID mappas dit, aldrig till "Övrigt".\n' +
  'Tags: 3-6 kortare sökbara termer – inga meningar. Returnera ALDRIG en tom tags-array.\n' +
  'Context: om organisation/period saknas, skriv "Framgår ej av dokumentet".'

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
    tools: [COMPETENCY_TOOL],
    tool_choice: { type: 'tool', name: 'save_competencies' },
    messages: [{ role: 'user', content: messageContent }],
  }

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
    throw new Error(`Claude API-fel (${response.status}): ${errorBody}`)
  }

  onProgress('Analyserar kompetenser...', 60)
  const data = await response.json()
  const toolBlock = data?.content?.find?.((b) => b.type === 'tool_use')
  if (!toolBlock) throw new Error('Inget tool_use-block i svaret')
  const competencies = toolBlock.input?.competencies
  if (!Array.isArray(competencies) || competencies.length === 0) {
    throw new Error(
      'Kunde inte läsa ut kompetenser ur svaret (möjligen avklippt) – försök igen.'
    )
  }
  return competencies
}

// ── Competency recategorization ───────────────────────────────────────────

const RECATEGORIZE_SYSTEM_PROMPT =
  'Kategorisera om dessa befintliga kompetenser – tilldela rätt category och tags för varje.\n' +
  'Boulder AB levererar främst utvecklingskonsulter. Var generös med "Mjukvaruutveckling & programmering" – ' +
  'React, TypeScript, Angular, C#, .NET, Node.js och liknande ska ALLTID mappas dit, aldrig till "Övrigt".\n' +
  'Returnera exakt samma antal kompetenser som du fick in. Behåll title och description exakt som de är.\n' +
  'Tags: 3-6 kortare sökbara termer – inga meningar. Returnera ALDRIG en tom tags-array.'

/**
 * Re-categorize existing competencies by sending them to Claude.
 * Only category and tags are updated – all other fields are preserved.
 * @param {Array} competencies - existing competency objects from Firestore
 * @returns {Promise<Array>} array of { title, category, tags } objects
 */
export async function recategorizeCompetencies(competencies) {
  const apiKey = import.meta.env.VITE_CLAUDE_API_KEY
  if (!apiKey) throw new Error('Claude API-nyckel saknas. Kontrollera VITE_CLAUDE_API_KEY i .env.local.')

  const input = competencies.map((c) => ({
    title: c.title || c.namn || '',
    description: c.description || c.beskrivning || '',
  }))

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
      system: RECATEGORIZE_SYSTEM_PROMPT,
      tools: [COMPETENCY_TOOL],
      tool_choice: { type: 'tool', name: 'save_competencies' },
      messages: [{
        role: 'user',
        content: `Kategorisera dessa kompetenser och tilldela rätt category och tags:\n\n${JSON.stringify(input, null, 2)}`,
      }],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Claude API-fel (${response.status}): ${errorBody}`)
  }

  const data = await response.json()
  const toolBlock = data?.content?.find?.((b) => b.type === 'tool_use')
  if (!toolBlock) throw new Error('Inget tool_use-block i svaret')
  const recategorized = toolBlock.input?.competencies
  if (!Array.isArray(recategorized) || recategorized.length === 0) {
    throw new Error(
      'Kunde inte läsa ut omkategoriserade kompetenser ur svaret – försök igen.'
    )
  }
  return recategorized
}

// ── Job posting analysis ─────────────────────────────────────────────────

const JOB_ANALYSIS_SYSTEM_PROMPT =
  'Du är konsultens förberedelsepartner inför en intervju – INTE ett bedömningssystem.\n' +
  'Inta ALLTID konsultens perspektiv: "jag är på din sida och hjälper dig gå in i rummet förberedd".\n' +
  'Peka aldrig bara ut brister – ge strategi och förberedelse.\n' +
  'Analysera jobbannonsen och generera ett strukturerat underlag för intervjuförberedelse.\n' +
  'Returnera ENDAST giltig JSON utan markdown eller backticks.\n' +
  'Schema:\n' +
  '{\n' +
  '  "jobTitle": "string",\n' +
  '  "company": "string",\n' +
  '  "summary": "string (2-3 meningar som sammanfattar rollen, ur konsultens perspektiv)",\n' +
  '  "quickFacts": { "kund": "string", "roll": "string", "miljö": "string (teknik/metod/kontext)", "fokus": "string (rollens huvudfokus i några ord)" },\n' +
  '  "sections": [\n' +
  '    { "heading": "string (kort tematisk rubrik)", "points": ["string (kort punkt)", "..."] }\n' +
  '  ],\n' +
  '  "questions": [\n' +
  '    {\n' +
  '      "id": "string (kort unikt id, t.ex. q1, q2)",\n' +
  '      "question": "string (intervjufrågan på svenska)",\n' +
  '      "category": "erfarenhet|kompetens|situation|motivation",\n' +
  '      "rationale": "string (varför denna fråga ställs i sammanhanget)"\n' +
  '    }\n' +
  '  ],\n' +
  '  "requirements": [\n' +
  '    {\n' +
  '      "requirement": "string (ett konkret krav/kompetens från annonsen)",\n' +
  '      "importance": "hög|medel|låg (hur kritiskt kravet är enligt annonsen)",\n' +
  '      "match": "stark|delvis|svag (konsultens matchning mot kompetensbanken – bedöm ÄRLIGT)",\n' +
  '      "note": "string (kort: var/hur det syns i banken, eller varför det saknas)",\n' +
  '      "howToAddress": "string (sätts för svag/delvis: strategiskt råd; tom \\"\\" för stark)"\n' +
  '    }\n' +
  '  ]\n' +
  '}\n' +
  'Generera 8-12 intervjufrågor fördelade mellan kategorierna erfarenhet, kompetens, situation och motivation.\n' +
  'quickFacts: kondensera uppdraget till korta fakta. Lämna ett fält som "" om det inte framgår.\n' +
  'sections: strukturera annonsens innehåll i 2-5 tematiska avsnitt (t.ex. Ansvar, Krav, Meriterande, Om uppdraget) med rubrik + kort punktlista. Hitta inte på innehåll som saknas i annonsen.\n' +
  'requirements: lista annonsens FAKTISKA krav (ca 8-15 st). Ett objekt per krav.\n' +
  'KALIBRERING (viktigast av allt – inflatera INTE matchningen):\n' +
  '- match bedöms ärligt mot kompetensbanken. Sök mot BÅDE namn och taggar.\n' +
  '  "stark"  = direkt, påvisbar erfarenhet av exakt detta krav.\n' +
  '  "delvis" = angränsande eller partiell erfarenhet (närliggande teknik/roll).\n' +
  '  "svag"   = lite eller ingen erfarenhet i banken.\n' +
  '  Ett brett senior-CV gör INTE allt till "stark" – var diskriminerande och ärlig. ' +
  'Tveka du mellan två nivåer, välj den lägre.\n' +
  '- importance = hur kritiskt kravet är i annonsen (hög = uttalat skall-krav, låg = nice-to-have).\n' +
  '- howToAddress: fyll i för krav med "svag" ELLER "delvis" matchning – konkret, strategiskt råd skrivet ' +
  'som en erfaren kollega som hjälper konsulten att ärligt och professionellt hantera kravet i rummet. Lämna "" för "stark".\n' +
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
    max_tokens: 8000,
    system: JOB_ANALYSIS_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  }

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
    throw new Error(`Claude API-fel (${response.status}): ${errorBody}`)
  }

  onProgress('Genererar intervjufrågor...', 65)
  const data = await response.json()
  const rawText = firstTextBlock(data)

  onProgress('Skapar gap-analys...', 90)
  return extractJsonObject(rawText)
}

// ── Interview questions in a chosen language ──────────────────────────────

/**
 * Frågornas kategori är ett DATAKONTRAKT, inte text. Koden filtrerar på exakt
 * dessa svenska strängar (JobPage FOCUS_TO_CATEGORY, CAT_META, simulatorns
 * urval) – de får ALDRIG översättas, oavsett vilket språk frågorna skrivs på.
 */
const QUESTION_CATEGORIES = ['erfarenhet', 'kompetens', 'situation', 'motivation']

/**
 * Systemprompt för frågegenerering, språkstyrd.
 *
 * Prosan (`question`, `rationale`) följer språkvalet. `category` gör det INTE –
 * den instruktionen finns i BÅDA språklägena och är det som håller
 * datakontraktet intakt när intervjun körs på engelska.
 *
 * @param {unknown} [language]
 * @returns {string}
 */
export function buildQuestionsSystemPrompt(language) {
  const en = normalizeLanguage(language) === LANGUAGES.EN

  const proseRule = en
    ? 'Skriv "question" och "rationale" på ENGELSKA – intervjun kommer att hållas på engelska.\n'
    : 'Skriv "question" och "rationale" på SVENSKA.\n'

  return (
    'Du är konsultens förberedelsepartner inför en intervju – INTE ett bedömningssystem.\n' +
    'Generera intervjufrågor utifrån jobbannonsen och konsultens kompetensbank.\n' +
    'Returnera ENDAST giltig JSON utan markdown eller backticks.\n' +
    'Schema:\n' +
    '{\n' +
    '  "jobTitle": "string (rollens titel, på frågornas språk)",\n' +
    '  "questions": [\n' +
    '    {\n' +
    '      "id": "string (kort unikt id, t.ex. q1, q2)",\n' +
    '      "question": "string (intervjufrågan)",\n' +
    '      "category": "erfarenhet|kompetens|situation|motivation",\n' +
    '      "rationale": "string (varför denna fråga ställs i sammanhanget)"\n' +
    '    }\n' +
    '  ]\n' +
    '}\n' +
    (en
      ? 'jobTitle: översätt rollens titel till ENGELSKA (t.ex. "Interim IT-chef" → ' +
        '"Interim Head of IT"). Titeln läses upp av en engelsk röst, så en svensk ' +
        'titel mitt i en engelsk mening låter fel. Översätt ALDRIG företagsnamn.\n'
      : 'jobTitle: rollens titel som den står i annonsen.\n') +
    'Generera 8-12 frågor fördelade mellan kategorierna erfarenhet, kompetens, situation och motivation.\n' +
    proseRule +
    'KRITISKT – "category" är ett maskinläsbart fältvärde, inte text som visas för användaren.\n' +
    `Det MÅSTE vara exakt en av dessa svenska strängar: ${QUESTION_CATEGORIES.join(', ')}.\n` +
    'Översätt ALDRIG kategorivärdet, inte ens när frågorna skrivs på engelska.\n' +
    NO_ID_INSTRUCTION
  )
}

/**
 * Genererar intervjufrågor på valt språk.
 *
 * Används för att skapa den ENGELSKA frågeuppsättningen för ett uppdrag – de
 * svenska frågorna kommer från analyzeJobPosting vid uppdragsskapandet och
 * rörs aldrig av den här funktionen.
 *
 * @param {string} jobText
 * @param {string} companyInfo
 * @param {Array} competencies
 * @param {unknown} language
 * @returns {Promise<{ questions: Array, jobTitle: string }>}
 *   jobTitle är rollens titel på målspråket – används i den upplästa
 *   hälsningen så en engelsk röst slipper läsa en svensk titel.
 */
export async function generateInterviewQuestions(jobText, companyInfo, competencies, language) {
  const apiKey = import.meta.env.VITE_CLAUDE_API_KEY
  if (!apiKey) {
    throw new Error('Claude API-nyckel saknas. Kontrollera VITE_CLAUDE_API_KEY i .env.local.')
  }

  const parts = [
    'Generera intervjufrågor för följande uppdrag:',
    '',
    '## Jobbannons',
    (jobText ?? '').trim(),
  ]
  if (companyInfo && companyInfo.trim()) {
    parts.push('', '## Om företaget', companyInfo.trim())
  }
  parts.push('', '## Kandidatens kompetensbank', JSON.stringify(sanitizeCompetencies(competencies), null, 2))

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
      system: buildQuestionsSystemPrompt(language),
      messages: [{ role: 'user', content: parts.join('\n') }],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Claude API-fel (${response.status}): ${errorBody}`)
  }

  const data = await response.json()
  const parsed = extractJsonObject(firstTextBlock(data))
  const questions = parsed?.questions
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('Kunde inte läsa ut frågor ur svaret – försök igen.')
  }
  return {
    questions,
    jobTitle: typeof parsed?.jobTitle === 'string' ? parsed.jobTitle.trim() : '',
  }
}

// ── Interview feedback analysis ───────────────────────────────────────────

/**
 * Systemprompt för feedback, språkstyrd.
 *
 * OBS: kalibreringsrubriken (POÄNGSKALA 1–10) är MEDVETET kvar på svenska i
 * båda språklägena. Den är en instruktion till modellen, inte text användaren
 * ser, och betygsskalan är finkalibrerad mot den formuleringen. Att översätta
 * den skulle riskera att betygsättningen glider – språkvalet ska styra prosan,
 * inte hur strängt det bedöms.
 *
 * @param {unknown} [language]
 * @returns {string}
 */
export function buildFeedbackSystemPrompt(language) {
  const en = normalizeLanguage(language) === LANGUAGES.EN

  const summaryField = en
    ? '  "summary": "string (overall summary in English, 2-3 sentences, positive tone)",\n'
    : '  "summary": "string (övergripande sammanfattning på svenska, 2-3 meningar, positiv ton)",\n'

  const commentField = en
    ? '      "comment": "string (specific feedback in English, start with what worked well)"\n'
    : '      "comment": "string (specifik feedback på svenska, börja med vad som var bra)"\n'

  const languageRule = en
    ? 'Intervjun hölls på ENGELSKA. Skriv ALLA fritextfält – summary, strengths, ' +
      'improvements, competencyGaps och comment – på ENGELSKA. Poängskalan och ' +
      'JSON-strukturen är oförändrade.\n'
    : 'Tala ALLTID på svenska.\n'

  return (
    'Du är en uppmuntrande intervjucoach som hjälper konsulter att utvecklas.\n' +
    'Detta är ett träningsverktyg – inte en verklig anställningsintervju. Kalibrera poängen därefter.\n' +
    '\n' +
    'POÄNGSKALA 1–10 (följ denna kalibrering strikt):\n' +
    '  9–10 Exceptionellt svar – strukturerat, konkret, övertygande med tydliga resultat\n' +
    '   7–8 Bra svar – relevant, tydligt och visar erfarenhet (NORMALLÄGE för en välförberedd konsult)\n' +
    '   5–6 Godkänt svar – relevant men ytligt, saknar konkreta exempel eller struktur\n' +
    '   3–4 Svagt svar – vagt, delvis irrelevant eller mycket kortfattat\n' +
    '   1–2 Reserveras för svar som är helt irrelevanta, obegripliga eller uteblivna\n' +
    '\n' +
    'En konsult som svarar relevant och strukturerat SKA lämna sessionen med en känsla av att ha lyckats.\n' +
    'Var generös – lyft fram det som fungerade bra innan du nämner förbättringsområden.\n' +
    '\n' +
    'Returnera ENDAST giltig JSON utan markdown eller backticks.\n' +
    'Schema:\n' +
    '{\n' +
    '  "overallScore": number (1-10),\n' +
    summaryField +
    '  "strengths": ["styrka 1", "styrka 2", "styrka 3"],\n' +
    '  "improvements": ["konkret tips 1", "konkret tips 2", "konkret tips 3"],\n' +
    '  "competencyGaps": ["Baserat på din kompetens inom X kan du stärka svaret med Y"],\n' +
    '  "questionFeedback": [\n' +
    '    {\n' +
    '      "question": "string (frågan)",\n' +
    '      "score": number (1-10),\n' +
    commentField +
    '    }\n' +
    '  ]\n' +
    '}\n' +
    languageRule +
    NO_ID_INSTRUCTION
  )
}

/**
 * Konfigurationsnoten som läggs först i användarmeddelandet vid feedback.
 * Ren funktion så språkregeln går att testa utan API-anrop.
 *
 * @param {{ focus?: string, difficulty?: string, language?: unknown }} [config]
 * @returns {string}
 */
export function buildFeedbackConfigNote(config = {}) {
  const en = normalizeLanguage(config.language) === LANGUAGES.EN
  const languageRule = en
    ? 'Intervjun hölls på ENGELSKA – skriv all fritext på ENGELSKA.'
    : 'Tala ALLTID på svenska.'
  return (
    `Anpassa feedback efter intervjukonfiguration: ` +
    `Fokus: ${config.focus ?? 'Mix'}, ` +
    `Svårighetsgrad: ${config.difficulty ?? 'Standard'}. ` +
    `${languageRule}\n\n`
  )
}

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

  const configNote = buildFeedbackConfigNote(interviewConfig)

  const sanitized = sanitizeCompetencies(competencies)

  const userMessage =
    `Analysera denna intervju och ge feedback.\n\n` +
    configNote +
    `Kandidatens kompetensbank:\n${JSON.stringify(sanitized, null, 2)}\n\n` +
    `Jobbroll: ${jobTitle} på ${company}\n\n` +
    `Frågor och svar:\n${JSON.stringify(transcript, null, 2)}`

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
      system: buildFeedbackSystemPrompt(interviewConfig.language),
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Claude API-fel (${response.status}): ${errorBody}`)
  }

  const data = await response.json()
  const rawText = firstTextBlock(data)
  return normalizeInterviewFeedback(extractJsonObject(rawText))
}

/**
 * Coerce a parsed feedback object into a shape that is always safe to write to
 * Firestore. Firestore rejects `undefined` field values, so every field must
 * be present with a sensible default even if Claude omits it or truncates.
 */
export function normalizeInterviewFeedback(parsed) {
  const obj = parsed && typeof parsed === 'object' ? parsed : {}
  const toArray = (v) => (Array.isArray(v) ? v : [])
  // Only treat actual numbers / non-empty numeric strings as a score.
  // Number(null) === 0 and Number('') === 0, which would fake a real score.
  const toScore = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    return null
  }

  const questionFeedback = toArray(obj.questionFeedback).map((q) => ({
    question: typeof q?.question === 'string' ? q.question : '',
    score: toScore(q?.score),
    comment: typeof q?.comment === 'string' ? q.comment : '',
  }))

  return {
    overallScore: toScore(obj.overallScore),
    summary: typeof obj.summary === 'string' ? obj.summary : '',
    strengths: toArray(obj.strengths),
    improvements: toArray(obj.improvements),
    competencyGaps: toArray(obj.competencyGaps),
    questionFeedback,
  }
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
