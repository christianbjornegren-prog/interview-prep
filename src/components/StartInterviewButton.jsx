import { PRIMARY_GLOW, PRIMARY_GLOW_HOVER, BRAND_PURPLE, BRAND_PURPLE_HOVER } from '../lib/theme'

/**
 * Appens PRIMÄRA åtgärd – starta intervjuträning.
 *
 * Samlad i EN komponent därför att den tidigare fanns i fyra varianter med
 * olika storlek, olika etikett och blandat emoji/pil ("🎙 Starta intervjuträning",
 * "Starta intervjuträning →", "🎙 Starta intervju"). Det gjorde att appens
 * viktigaste knapp såg olika ut beroende på var man stod.
 *
 * Uttrycket är medvetet återhållet: tydligheten kommer från att den är den
 * ENDA fyllda knappen i vyn, inte från att den är stor. Se lib/theme.js.
 */

/** Mikrofonikon i appens befintliga ikonspråk: streck, ärver currentColor. */
function MicIcon({ size = 16 }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="shrink-0" aria-hidden="true"
    >
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  )
}

function Spinner({ size = 16 }) {
  return (
    <span
      className="inline-block shrink-0 animate-spin rounded-full"
      style={{
        width: size,
        height: size,
        border: '2px solid currentColor',
        borderTopColor: 'transparent',
      }}
      aria-hidden="true"
    />
  )
}

export default function StartInterviewButton({
  onClick,
  label = 'Starta intervjuträning',
  disabled = false,
  loading = false,
  loadingLabel = '',
  fullWidth = false,
  className = '',
}) {
  const isDisabled = disabled || loading

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={
        'inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-lg ' +
        'text-action-primary-text text-sm font-semibold transition-all ' +
        'disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none ' +
        (fullWidth ? 'w-full ' : 'shrink-0 max-sm:w-full ') +
        className
      }
      style={{
        backgroundColor: BRAND_PURPLE,
        boxShadow: PRIMARY_GLOW,
        letterSpacing: '0.01em',
      }}
      onMouseOver={(e) => {
        if (isDisabled) return
        e.currentTarget.style.backgroundColor = BRAND_PURPLE_HOVER
        e.currentTarget.style.boxShadow = PRIMARY_GLOW_HOVER
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.backgroundColor = BRAND_PURPLE
        e.currentTarget.style.boxShadow = PRIMARY_GLOW
      }}
    >
      {loading ? <Spinner /> : <MicIcon />}
      {loading && loadingLabel ? loadingLabel : label}
    </button>
  )
}
