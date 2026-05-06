import { useEffect, useState } from 'react'

/**
 * Reusable loading state with coffee-cup hero, spinning progress ring,
 * and sequentially cycling messages that fade in/out.
 *
 * @param {string}   title    – headline (default: "Claude läser ditt CV...")
 * @param {string[]} messages – array of status strings shown every 4 s
 * @param {string}   subtitle – small grey note below the messages
 */
export default function LoadingState({
  title = 'Claude läser ditt CV...',
  messages = [],
  subtitle = 'Det här tar vanligtvis 1–2 minuter',
}) {
  const [msgIndex, setMsgIndex] = useState(0)
  const [textVisible, setTextVisible] = useState(true)

  useEffect(() => {
    if (messages.length <= 1) return

    const id = setInterval(() => {
      // Fade out
      setTextVisible(false)
      // After the fade-out transition (350 ms), advance the message and fade back in
      const swap = setTimeout(() => {
        setMsgIndex((i) => (i + 1) % messages.length)
        setTextVisible(true)
      }, 350)

      return () => clearTimeout(swap)
    }, 4000)

    return () => clearInterval(id)
  }, [messages.length])

  return (
    <div
      className="flex flex-col items-center justify-center gap-5 rounded-xl px-8 py-12 text-center"
      style={{ backgroundColor: '#1d1d1d', border: '1px solid #404040' }}
    >
      {/* Hero emoji */}
      <span style={{ fontSize: 64, lineHeight: 1 }} role="img" aria-label="Kaffe">
        ☕
      </span>

      {/* Headline */}
      <h2 className="text-white text-lg font-semibold tracking-tight">{title}</h2>

      {/* Spinning progress ring */}
      <ProgressRing />

      {/* Cycling status message */}
      {messages.length > 0 && (
        <p
          className="text-sm font-medium max-w-xs"
          style={{
            color: '#d1d5db',
            opacity: textVisible ? 1 : 0,
            transition: 'opacity 0.35s ease',
            minHeight: '1.25rem',
          }}
        >
          {messages[msgIndex]}
        </p>
      )}

      {/* Subtitle */}
      <p className="text-xs" style={{ color: '#6b7280' }}>
        {subtitle}
      </p>
    </div>
  )
}

// ── Progress ring ─────────────────────────────────────────────────────────
//
// An SVG circle that rotates indefinitely. The arc covers ~270° of the
// circumference so it looks like an indeterminate spinner rather than a
// plain circle.

const RADIUS = 28
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const ARC = CIRCUMFERENCE * 0.75 // 75 % of the circle is drawn

function ProgressRing() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      style={{ animation: 'spin 1.4s linear infinite' }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Track */}
      <circle
        cx="32"
        cy="32"
        r={RADIUS}
        fill="none"
        stroke="#404040"
        strokeWidth="4"
      />

      {/* Animated arc */}
      <circle
        cx="32"
        cy="32"
        r={RADIUS}
        fill="none"
        stroke="#8064ad"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${ARC} ${CIRCUMFERENCE - ARC}`}
        strokeDashoffset={0}
        transform="rotate(-90 32 32)"
      />
    </svg>
  )
}
