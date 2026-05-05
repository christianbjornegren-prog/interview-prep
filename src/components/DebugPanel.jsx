import { useEffect, useRef, useState } from 'react'
import { logger } from '../lib/logger'

export default function DebugPanel() {
  const [expanded, setExpanded] = useState(true) // Default to expanded
  const [copied, setCopied] = useState(false)
  const bottomRef = useRef(null)

  // Read from window.__appLogs if available
  const appLogs = typeof window !== 'undefined' ? window.__appLogs || [] : []

  useEffect(() => {
    if (expanded) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [appLogs.length, expanded])

  async function handleCopy() {
    try {
      const logText = appLogs
        .map((log) => {
          if (typeof log === 'string') return log
          // Format structured log
          const data = log.data ? ` ${JSON.stringify(log.data)}` : ''
          return `${log.timestamp} [${log.category}][${log.level}] ${log.message}${data}`
        })
        .join('\n')
      await navigator.clipboard.writeText(logText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  function handleClear() {
    logger.clearLogs()
    // Force re-render by updating state
    setExpanded(false)
    setTimeout(() => setExpanded(true), 0)
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        backgroundColor: 'rgba(10, 10, 15, 0.9)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderTop: '1px solid #4A6FA5',
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: '11px',
        color: '#d1d5db',
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 14px',
          background: 'transparent',
          border: 'none',
          color: '#d1d5db',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 'inherit',
        }}
      >
        <span style={{ color: '#9ca3af', letterSpacing: '0.08em' }}>Debug</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: '#6b7280' }}>
            {appLogs.length} {appLogs.length === 1 ? 'rad' : 'rader'}
          </span>
          <span style={{ color: '#9ca3af' }}>{expanded ? '▼' : '▲'}</span>
        </span>
      </button>

      <div
        style={{
          maxHeight: expanded ? '200px' : '0px',
          overflow: 'hidden',
          transition: 'max-height 220ms ease',
          borderTop: expanded ? '1px solid #1a1d27' : 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '6px',
            padding: '6px 14px 0',
          }}
        >
          <button
            onClick={handleCopy}
            style={{
              background: 'transparent',
              border: '1px solid #2a2d3a',
              color: copied ? '#22c55e' : '#9ca3af',
              padding: '2px 8px',
              borderRadius: '4px',
              fontFamily: 'inherit',
              fontSize: '10px',
              cursor: 'pointer',
            }}
          >
            {copied ? '✓ Kopierat!' : 'Kopiera'}
          </button>
          <button
            onClick={handleClear}
            style={{
              background: 'transparent',
              border: '1px solid #2a2d3a',
              color: '#9ca3af',
              padding: '2px 8px',
              borderRadius: '4px',
              fontFamily: 'inherit',
              fontSize: '10px',
              cursor: 'pointer',
            }}
          >
            Rensa
          </button>
        </div>

        <div
          style={{
            maxHeight: '168px',
            overflowY: 'auto',
            padding: '6px 14px 10px',
          }}
        >
          {appLogs.length === 0 ? (
            <p style={{ color: '#6b7280' }}>Inga loggar ännu.</p>
          ) : (
            <>
              {appLogs.map((log, i) => <LogRow key={i} log={log} />)}
              <div ref={bottomRef} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function LogRow({ log }) {
  // Handle both string logs (legacy) and structured logs
  if (typeof log === 'string') {
    const firstSpace = log.indexOf(' ')
    const timestamp = firstSpace > -1 ? log.slice(0, firstSpace) : ''
    const message = firstSpace > -1 ? log.slice(firstSpace + 1) : log

    const color =
      /FEL|Error/.test(message)
        ? '#ef4444'
        : /✓|mottagen/.test(message)
        ? '#22c55e'
        : '#6b7280'

    return (
      <div style={{ display: 'flex', gap: '10px', lineHeight: 1.55 }}>
        <span style={{ color: '#4b5563', flexShrink: 0 }}>{timestamp}</span>
        <span style={{ color, wordBreak: 'break-word' }}>{message}</span>
      </div>
    )
  }

  // Structured log
  const { timestamp, category, level, message, data } = log
  const time = new Date(timestamp).toLocaleTimeString('sv-SE')

  // Category colors
  const categoryColors = {
    AUTH: '#a78bfa',      // purple
    FIRESTORE: '#60a5fa', // blue
    CLAUDE: '#34d399',    // green
    OPENAI: '#fb923c',    // orange
    APP: '#9ca3af',       // gray
  }

  // Level colors
  const levelColor =
    level === 'ERROR'
      ? '#ef4444'
      : level === 'WARN'
      ? '#f59e0b'
      : level === 'INFO'
      ? '#22c55e'
      : '#6b7280'

  const categoryColor = categoryColors[category] || '#9ca3af'

  return (
    <div style={{ display: 'flex', gap: '8px', lineHeight: 1.55 }}>
      <span style={{ color: '#4b5563', flexShrink: 0 }}>{time}</span>
      <span style={{ color: categoryColor, flexShrink: 0 }}>[{category}]</span>
      <span style={{ color: levelColor, flexShrink: 0 }}>[{level}]</span>
      <span style={{ color: '#d1d5db', wordBreak: 'break-word' }}>
        {message}
        {data && (
          <span style={{ color: '#6b7280', marginLeft: '6px' }}>
            {JSON.stringify(data)}
          </span>
        )}
      </span>
    </div>
  )
}
