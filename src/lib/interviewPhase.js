/**
 * Pure interview-phase helpers.
 * No React, no Firebase – fully unit-testable.
 *
 * Copy is language-aware. Svenska är default och de svenska formuleringarna är
 * oförändrade sedan innan språkstödet – befintliga anrop utan `language`
 * beter sig exakt som förut.
 */

import { LANGUAGES, normalizeLanguage } from './language.js'

export const PHASE_STATES = {
  CONNECTING:       'connecting',
  AI_SPEAKING:      'ai_speaking',
  WAITING_FOR_USER: 'waiting_for_user',
  RECORDING:        'recording',
  PROCESSING:       'processing',
  PREPARING_NEXT:   'preparing_next',
  FINISHED:         'finished',
}

const COPY = {
  [LANGUAGES.SV]: {
    fallbackName:   'Intervjuaren',
    connecting:     'Ansluter till intervjuaren...',
    speaking:       (name) => `${name} frågar...`,
    waitingLabel:   'Tryck för att svara',
    waitingSub:     'Din tur — tryck på knappen när du är redo',
    recordingLabel: 'Spelar in — tryck när du är klar',
    recordingSub:   'Spelar in...',
    recordingTimer: (time) => `${time} — tryck när du är klar`,
    processing:     'Analyserar ditt svar...',
    preparing:      'Förbereder nästa fråga...',
    finished:       'Intervjun är klar – analyserar dina svar...',
  },
  [LANGUAGES.EN]: {
    fallbackName:   'The interviewer',
    connecting:     'Connecting to the interviewer...',
    speaking:       (name) => `${name} is asking...`,
    waitingLabel:   'Press to answer',
    waitingSub:     "Your turn — press the button when you're ready",
    recordingLabel: "Recording — press when you're done",
    recordingSub:   'Recording...',
    recordingTimer: (time) => `${time} — press when you're done`,
    processing:     'Analysing your answer...',
    preparing:      'Preparing the next question...',
    finished:       'The interview is complete – analysing your answers...',
  },
}

/**
 * Maps the current interview phase to all button + status copy.
 *
 * @param {string} phase  – one of PHASE_STATES values
 * @param {{ interviewerName?: string, language?: unknown }} [opts]
 * @returns {{
 *   label:       string,   // text ON the action button; '' = no button
 *   subLabel:    string,   // status text shown beneath the ring
 *   enabled:     boolean,  // button is clickable
 *   recording:   boolean,  // true → red "stop" styling
 *   showSpinner: boolean,  // true → animated subLabel
 * }}
 */
export function buttonStateForPhase(phase, { interviewerName, language } = {}) {
  const t = COPY[normalizeLanguage(language)]
  const name = interviewerName || t.fallbackName

  switch (phase) {
    case PHASE_STATES.CONNECTING:
      return {
        label: '', subLabel: t.connecting,
        enabled: false, recording: false, showSpinner: true,
      }
    case PHASE_STATES.AI_SPEAKING:
      return {
        label: '', subLabel: t.speaking(name),
        enabled: false, recording: false, showSpinner: false,
      }
    case PHASE_STATES.WAITING_FOR_USER:
      return {
        label: t.waitingLabel,
        subLabel: t.waitingSub,
        enabled: true, recording: false, showSpinner: false,
      }
    case PHASE_STATES.RECORDING:
      return {
        label: t.recordingLabel,
        subLabel: t.recordingSub,
        enabled: true, recording: true, showSpinner: false,
      }
    case PHASE_STATES.PROCESSING:
      return {
        label: '', subLabel: t.processing,
        enabled: false, recording: false, showSpinner: true,
      }
    case PHASE_STATES.PREPARING_NEXT:
      return {
        label: '', subLabel: t.preparing,
        enabled: false, recording: false, showSpinner: true,
      }
    case PHASE_STATES.FINISHED:
      return {
        label: '', subLabel: t.finished,
        enabled: false, recording: false, showSpinner: false,
      }
    default:
      return { label: '', subLabel: '', enabled: false, recording: false, showSpinner: false }
  }
}

/**
 * Should the one-time intro hint be shown?
 * Returns true unless the user has explicitly dismissed it (flag === true).
 *
 * @param {unknown} hasSeenInterviewIntro  – value from users/{uid}.hasSeenInterviewIntro
 * @returns {boolean}
 */
export function shouldShowIntroHint(hasSeenInterviewIntro) {
  return hasSeenInterviewIntro !== true
}

/** Format elapsed recording seconds as "0:05" or "1:23". */
export function formatRecordingTime(totalSeconds) {
  const m   = Math.floor(totalSeconds / 60)
  const s   = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Inspelningsknappens etikett med löpande timer, t.ex. "0:05 — tryck när du är klar".
 * Ikonen läggs på i komponenten.
 *
 * @param {number} totalSeconds
 * @param {unknown} [language]
 * @returns {string}
 */
export function buildRecordingLabel(totalSeconds, language) {
  const t = COPY[normalizeLanguage(language)]
  return t.recordingTimer(formatRecordingTime(totalSeconds))
}
