/**
 * Feedbacksidans text, språkstyrd.
 * Ren modul: ingen React, ingen Firebase – fullt enhetstestbar.
 *
 * SCOPE: en session som hölls på engelska presenteras på engelska, hela vägen.
 * Samma regel som intervjuskärmen. Svenska rubriker över engelsk AI-text ser
 * bara ofärdigt ut, och halvöversatt är inte bättre än oöversatt.
 *
 * Sidor som listar sessioner på BÅDA språken (uppdragets Historik, säljarens
 * delade feedback) förblir svenska och märker engelska sessioner med "EN".
 */

import { LANGUAGES, normalizeLanguage } from './language.js'

const COPY = {
  [LANGUAGES.SV]: {
    locale:           'sv-SE',
    loading:          'Laddar feedback...',
    notFound:         'Feedback hittades inte.',
    loadFailed:       'Kunde inte hämta feedback.',
    backToJob:        '← Tillbaka till uppdraget',
    backToConsultant: '← Tillbaka till konsultprofil',
    title:            (jobTitle) => `Intervjufeedback – ${jobTitle}`,
    unknownDate:      '—',
    overallScore:     'Övergripande betyg',
    summary:          'Sammanfattning',
    strengths:        'Styrkor',
    improvements:     'Förbättringsområden',
    competencyLink:   'Koppling till ditt CV',
    perQuestion:      'Feedback per fråga',
    question:         (n) => `Fråga ${n}`,
    privacyNote:      'Din träning är privat. Den delas med din säljare endast om du själv ' +
                      'väljer det – och du kan ta tillbaka det när som helst.',
    shareToggle:      'Dela denna feedback med din säljare',
    shareFailed:      'Kunde inte uppdatera delningen. Försök igen.',
  },
  [LANGUAGES.EN]: {
    locale:           'en-GB',
    loading:          'Loading feedback...',
    notFound:         'Feedback not found.',
    loadFailed:       'Could not load feedback.',
    backToJob:        '← Back to the assignment',
    backToConsultant: '← Back to consultant profile',
    title:            (jobTitle) => `Interview feedback – ${jobTitle}`,
    unknownDate:      '—',
    overallScore:     'Overall score',
    summary:          'Summary',
    strengths:        'Strengths',
    improvements:     'Areas to improve',
    competencyLink:   'Link to your CV',
    perQuestion:      'Feedback per question',
    question:         (n) => `Question ${n}`,
    privacyNote:      'Your practice is private. It is shared with your salesperson only if ' +
                      'you choose to – and you can withdraw it at any time.',
    shareToggle:      'Share this feedback with your salesperson',
    shareFailed:      'Could not update sharing. Please try again.',
  },
}

/**
 * @param {unknown} [language] – feedback.language; saknat fält = svenska
 * @returns {typeof COPY['sv']}
 */
export function feedbackCopy(language) {
  return COPY[normalizeLanguage(language)]
}
