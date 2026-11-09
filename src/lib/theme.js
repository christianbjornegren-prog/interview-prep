/**
 * Delade presentationstokens för JS-inline-stilar.
 *
 * Ligger här i stället för att dupliceras per sida, så att den primära
 * åtgärdens uttryck inte glider isär mellan Startsidan och Uppdragsvyn.
 * Färgerna pekar på Boulder-designsystemets tokens (src/styles/tokens.css),
 * så temat styr dem.
 */

/** Primär åtgärdsfärg (fylld knapp) och dess hover. */
export const BRAND_PURPLE = 'var(--color-action-primary-background)'
export const BRAND_PURPLE_HOVER = 'var(--color-action-primary-background-hover)'

/**
 * Tidigare glöd under den PRIMÄRA åtgärden. Boulder-designsystemet har ingen
 * glöd – hierarkin bärs av att det är den ENDA fyllda knappen i vyn, därför
 * 'none'. Konstanterna behålls så anropsställena är oförändrade.
 */
export const PRIMARY_GLOW = 'none'
export const PRIMARY_GLOW_HOVER = 'none'
