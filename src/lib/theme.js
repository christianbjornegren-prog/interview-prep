/**
 * Delade presentationstokens för JS-inline-stilar.
 *
 * Ligger här i stället för att dupliceras per sida, så att den primära
 * åtgärdens uttryck inte glider isär mellan Startsidan och Uppdragsvyn.
 * Färgvariablerna i övrigt bor i index.css / tailwind.config.js.
 */

/** Brand-purple, appens primäraccent. */
export const BRAND_PURPLE = '#8064ad'
export const BRAND_PURPLE_HOVER = '#9781be'

/**
 * Glöd under den PRIMÄRA åtgärden ("Starta intervjuträning").
 *
 * Poängen är hierarki: bara EN knapp per vy bär det här uttrycket. Ger man
 * det till flera konkurrerar de och ingen framhävs – därför är sekundära
 * åtgärder (t.ex. "Lägg till nytt uppdrag") nedtonade till kontur i stället.
 */
export const PRIMARY_GLOW = '0 4px 18px -6px rgba(128, 100, 173, 0.7)'
export const PRIMARY_GLOW_HOVER = '0 8px 26px -6px rgba(151, 129, 190, 0.9)'
