/**
 * Intervjuarens repliker och röstval.
 * Ren modul: ingen React, ingen Firebase, inga nätverksanrop – fullt enhetstestbar.
 *
 * De svenska formuleringarna är ordagrant flyttade hit från
 * InterviewSimulatorTTS.jsx och ska INTE ändras – de är låsta av tester så att
 * det svenska flödet är oförändrat efter språkstödet.
 */

import { LANGUAGES, normalizeLanguage } from './language.js'

// ── Röster och namn ───────────────────────────────────────────────────────

const FEMALE_VOICES = ['shimmer', 'nova', 'alloy']
const MALE_VOICES = ['onyx', 'echo', 'fable']

const NAMES = {
  [LANGUAGES.SV]: {
    female: ['Maria Lindström', 'Anna Karlsson', 'Sara Bergström'],
    male: ['Erik Svensson', 'Johan Andersen', 'Anders Nilsson'],
  },
  [LANGUAGES.EN]: {
    female: ['Sarah Mitchell', 'Emma Clarke', 'Rachel Bennett'],
    male: ['James Harper', 'Michael Reed', 'Daniel Fletcher'],
  },
}

/**
 * Slumpar röst + intervjuarnamn för sessionen.
 * Rösterna är desamma i båda språken (OpenAI:s röster är flerspråkiga och
 * följer textens språk) – bara namnet byts.
 *
 * @param {unknown} language
 * @param {() => number} [rng] – injicerbar för deterministiska tester
 * @returns {{ voice: string, name: string }}
 */
export function pickVoiceAndName(language, rng = Math.random) {
  const lang = normalizeLanguage(language)
  const useFemale = rng() < 0.5
  const voices = useFemale ? FEMALE_VOICES : MALE_VOICES
  const names = useFemale ? NAMES[lang].female : NAMES[lang].male
  const idx = Math.floor(rng() * voices.length)
  const safeIdx = Math.min(Math.max(idx, 0), voices.length - 1)
  return { voice: voices[safeIdx], name: names[safeIdx] }
}

// ── Uppläst text ──────────────────────────────────────────────────────────

/**
 * OpenAI:s TTS-endpoint tar max 4096 tecken i `input`. Hälsningen bakar in
 * första frågan, så en ovanligt lång genererad fråga skulle kunna slå i taket
 * och få hela anropet att fela mitt i en session.
 */
export const TTS_MAX_INPUT = 4096

/**
 * Kapar text som inte får plats i ett TTS-anrop. Kapar vid ordgräns när det
 * går, så att uppläsningen inte bryts mitt i ett ord.
 *
 * @param {string} text
 * @param {number} [max]
 * @returns {string}
 */
export function capForSpeech(text, max = TTS_MAX_INPUT) {
  if (typeof text !== 'string') return ''
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return lastSpace > max * 0.8 ? cut.slice(0, lastSpace) : cut
}

/**
 * Hälsningen som läses upp när intervjun startar – inklusive första frågan.
 *
 * @param {{ interviewerName: string, jobTitle?: string, company?: string,
 *           total: number, firstQuestion: string, language?: unknown }} opts
 * @returns {string}
 */
export function buildGreeting({
  interviewerName,
  jobTitle = '',
  company = '',
  total,
  firstQuestion,
  language,
}) {
  const text =
    normalizeLanguage(language) === LANGUAGES.EN
      ? `Hello, my name is ${interviewerName}. Welcome to your interview ` +
        `for the role of ${jobTitle} at ${company}. ` +
        `We have ${total} questions. ` +
        `Question 1 of ${total}: ${firstQuestion}`
      : `Hej, jag heter ${interviewerName}. Välkommen till intervjun ` +
        `för rollen ${jobTitle} hos ${company}. ` +
        `Vi har ${total} frågor. ` +
        `Fråga 1 av ${total}: ${firstQuestion}`
  return capForSpeech(text)
}

/**
 * Övergången mellan två frågor: en kvittering plus nästa fråga.
 *
 * @param {{ number: number, total: number, question: string, language?: unknown }} opts
 * @returns {string} `number` är 1-baserat (frågan som nu ställs)
 */
export function buildBridge({ number, total, question, language }) {
  const text =
    normalizeLanguage(language) === LANGUAGES.EN
      ? `Thank you. Question ${number} of ${total}: ${question}`
      : `Tack. Fråga ${number} av ${total}: ${question}`
  return capForSpeech(text)
}

/**
 * Avslutningen som läses upp när sista svaret är givet.
 *
 * @param {{ language?: unknown }} [opts]
 * @returns {string}
 */
export function buildClosing({ language } = {}) {
  return normalizeLanguage(language) === LANGUAGES.EN
    ? 'Thank you very much, those were all my questions. ' +
      'You have completed the interview. Well done!'
    : 'Tack så mycket, det var alla mina frågor. ' +
      'Du har genomfört intervjun. Bra jobbat!'
}

// ── Intervjuskärmens text ─────────────────────────────────────────────────
//
// SCOPE: appen i övrigt är på svenska. Just intervjuskärmen följer
// intervjuspråket, eftersom en skärm som säger "Fråga 3 av 5" medan en engelsk
// röst ställer frågan är inkonsekvent. Dashboard, uppdragsvy och feedbacksida
// är fortsatt svenska – se docs/PLAN_INTERVJUSPRAK.md, "Utanför scope".

const SCREEN = {
  [LANGUAGES.SV]: {
    title:            (name) => `Intervju med ${name}`,
    endInterview:     '✕ Avsluta intervju',
    confirmAbort:     'Avsluta intervjun? Ditt svar sparas inte.',
    continueInterview:'Fortsätt intervjun',
    confirmEnd:       'Ja, avsluta',
    introLead:        'Så här fungerar det: ',
    introBody:        'lyssna på frågan, tryck sedan på knappen för att svara, och tryck igen när du är klar. Ta den tid du behöver.',
    closeHint:        'Stäng tips',
    questionCounter:  (n, total) => `Fråga ${n} av ${total}`,
    loadingJob:       'Laddar jobbannons...',
    back:             '← Tillbaka',
    backToJob:        'Tillbaka till uppdraget',
    notFound:         'Hittade ingen jobbannons.',
    saveFailed:       'Kunde inte spara din feedback',
    retry:            'Försök igen',
    dismiss:          'Stäng',
    creatingReport:   'Skapar din feedbackrapport...',
    transcriptionTimeout: 'Transkriberingen tog för lång tid. Försök svara igen.',
    processingStalled:    'Ditt svar kunde inte behandlas. Tryck på knappen och svara igen.',
    finishedSteps: [
      'Intervju genomförd',
      'Svar transkriberade',
      'Analyserar mot kompetensbank',
      'Genererar feedback...',
    ],
  },
  [LANGUAGES.EN]: {
    title:            (name) => `Interview with ${name}`,
    endInterview:     '✕ End interview',
    confirmAbort:     "End the interview? Your answer won't be saved.",
    continueInterview:'Continue interview',
    confirmEnd:       'Yes, end it',
    introLead:        'How this works: ',
    introBody:        "listen to the question, press the button to answer, and press again when you're done. Take all the time you need.",
    closeHint:        'Dismiss tip',
    questionCounter:  (n, total) => `Question ${n} of ${total}`,
    loadingJob:       'Loading job posting...',
    back:             '← Back',
    backToJob:        'Back to the assignment',
    notFound:         'No job posting found.',
    saveFailed:       'Could not save your feedback',
    retry:            'Try again',
    dismiss:          'Dismiss',
    creatingReport:   'Creating your feedback report...',
    transcriptionTimeout: 'Transcription took too long. Please try answering again.',
    processingStalled:    'Your answer could not be processed. Press the button and answer again.',
    finishedSteps: [
      'Interview completed',
      'Answers transcribed',
      'Matching against your competency bank',
      'Generating feedback...',
    ],
  },
}

/**
 * Hämtar intervjuskärmens textuppsättning för ett språk.
 *
 * @param {unknown} [language]
 * @returns {typeof SCREEN['sv']}
 */
export function screenCopy(language) {
  return SCREEN[normalizeLanguage(language)]
}
