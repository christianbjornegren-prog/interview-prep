/**
 * Pure interview-phase helpers.
 * No React, no Firebase – fully unit-testable.
 */

export const PHASE_STATES = {
  CONNECTING:       'connecting',
  AI_SPEAKING:      'ai_speaking',
  WAITING_FOR_USER: 'waiting_for_user',
  RECORDING:        'recording',
  PROCESSING:       'processing',
  PREPARING_NEXT:   'preparing_next',
  FINISHED:         'finished',
}

/**
 * Maps the current interview phase to all button + status copy.
 *
 * @param {string} phase  – one of PHASE_STATES values
 * @param {{ interviewerName?: string }} [opts]
 * @returns {{
 *   label:       string,   // text ON the action button; '' = no button
 *   subLabel:    string,   // status text shown beneath the ring
 *   enabled:     boolean,  // button is clickable
 *   recording:   boolean,  // true → red "stop" styling
 *   showSpinner: boolean,  // true → animated subLabel
 * }}
 */
export function buttonStateForPhase(phase, { interviewerName = 'Intervjuaren' } = {}) {
  switch (phase) {
    case PHASE_STATES.CONNECTING:
      return {
        label: '', subLabel: 'Ansluter till intervjuaren...',
        enabled: false, recording: false, showSpinner: true,
      }
    case PHASE_STATES.AI_SPEAKING:
      return {
        label: '', subLabel: `${interviewerName} frågar...`,
        enabled: false, recording: false, showSpinner: false,
      }
    case PHASE_STATES.WAITING_FOR_USER:
      return {
        label: 'Tryck för att svara',
        subLabel: 'Din tur — tryck på knappen när du är redo',
        enabled: true, recording: false, showSpinner: false,
      }
    case PHASE_STATES.RECORDING:
      return {
        label: 'Spelar in — tryck när du är klar',
        subLabel: 'Spelar in...',
        enabled: true, recording: true, showSpinner: false,
      }
    case PHASE_STATES.PROCESSING:
      return {
        label: '', subLabel: 'Analyserar ditt svar...',
        enabled: false, recording: false, showSpinner: true,
      }
    case PHASE_STATES.PREPARING_NEXT:
      return {
        label: '', subLabel: 'Förbereder nästa fråga...',
        enabled: false, recording: false, showSpinner: true,
      }
    case PHASE_STATES.FINISHED:
      return {
        label: '', subLabel: 'Intervjun är klar – analyserar dina svar...',
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
