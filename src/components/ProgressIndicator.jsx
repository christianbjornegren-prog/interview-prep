/**
 * Slim progress indicator with coffee-cup, percent bar, and status message.
 * Used while Claude is analysing CVs or job postings.
 */
export default function ProgressIndicator({ percent, message }) {
  return (
    <div className="py-6 space-y-4">
      <div className="text-center text-4xl select-none">☕</div>
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div
            className="flex-1 h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: '#2a2d3a' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${percent}%`,
                backgroundColor: '#4A6FA5',
                transition: 'width 0.5s ease',
              }}
            />
          </div>
          <span
            className="text-xs font-medium tabular-nums"
            style={{ color: '#6b7280', minWidth: '2.5rem', textAlign: 'right' }}
          >
            {Math.round(percent)}%
          </span>
        </div>
        <p className="text-sm text-center" style={{ color: '#9ca3af' }}>
          {message}
        </p>
      </div>
    </div>
  )
}
