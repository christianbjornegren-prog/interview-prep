/**
 * Vertical step-by-step progress indicator.
 * Props:
 *   steps       – array of { label, subtext }
 *   currentStep – 0-based index of the active step;
 *                 pass steps.length (or higher) to show all as completed
 */
export default function StepIndicator({ steps, currentStep }) {
  const allDone = currentStep >= steps.length

  return (
    <div
      className="rounded-xl p-6 mx-auto"
      style={{
        backgroundColor: '#1d1d1d',
        border: '1px solid #404040',
        maxWidth: '24rem',
      }}
    >
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1
        const state = allDone || i < currentStep
          ? 'completed'
          : i === currentStep
          ? 'active'
          : 'pending'

        return (
          <div key={i} className="flex gap-4">
            {/* Left column: circle + connector line */}
            <div className="flex flex-col items-center" style={{ width: 28 }}>
              <StepCircle number={i + 1} state={state} />
              {!isLast && (
                <div
                  style={{
                    width: 2,
                    flex: 1,
                    minHeight: 28,
                    marginTop: 4,
                    marginBottom: 4,
                    backgroundColor: state === 'completed' ? '#22c55e' : '#404040',
                    transition: 'background-color 0.4s ease',
                  }}
                />
              )}
            </div>

            {/* Right column: label + optional subtext */}
            <div style={{ paddingBottom: isLast ? 0 : 24, paddingTop: 5, minWidth: 0 }}>
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.4,
                  fontWeight: state === 'active' ? 600 : 400,
                  color:
                    state === 'active' ? '#fff'
                    : state === 'completed' ? '#6b7280'
                    : '#4b5563',
                  transition: 'color 0.3s',
                }}
              >
                {step.label}
              </p>
              {state === 'active' && step.subtext && (
                <p style={{ fontSize: 12, color: '#8064ad', marginTop: 3 }}>
                  {step.subtext}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Circle variants ───────────────────────────────────────────────────────

function StepCircle({ number, state }) {
  const SIZE = 28
  const R = SIZE / 2 - 2.5 // inner radius for the arc

  if (state === 'completed') {
    return (
      <div
        style={{
          width: SIZE,
          height: SIZE,
          borderRadius: '50%',
          backgroundColor: '#22c55e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'background-color 0.3s',
        }}
      >
        <svg
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    )
  }

  if (state === 'active') {
    // Spinning arc ring with number centred
    const cx = SIZE / 2
    const cy = SIZE / 2
    return (
      <div style={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="animate-spin"
          style={{ position: 'absolute', inset: 0 }}
        >
          {/* Track */}
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="#404040" strokeWidth="2.5" />
          {/* ~90° accent arc (top → right) */}
          <path
            d={`M ${cx} ${cy - R} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
            fill="none"
            stroke="#8064ad"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 600,
            color: '#8064ad',
          }}
        >
          {number}
        </span>
      </div>
    )
  }

  // pending
  return (
    <div
      style={{
        width: SIZE,
        height: SIZE,
        borderRadius: '50%',
        border: '2px solid #404040',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 500, color: '#4b5563' }}>
        {number}
      </span>
    </div>
  )
}

// ── Utility: map progress percent → step index ────────────────────────────

/**
 * Maps a progress percent to a step index (0-based).
 * 0-24  → 0, 25-49 → 1, 50-84 → 2, 85-99 → 3, 100 → Infinity (all done)
 */
export function percentToStep(pct) {
  if (pct >= 100) return Infinity
  if (pct >= 85) return 3
  if (pct >= 50) return 2
  if (pct >= 25) return 1
  return 0
}
