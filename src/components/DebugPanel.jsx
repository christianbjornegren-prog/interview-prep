import { useState } from 'react'

export default function DebugPanel({ logs = [], onClear }) {
  const [expanded, setExpanded] = useState(false)

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
            {logs.length} {logs.length === 1 ? 'rad' : 'rader'}
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
            padding: '6px 14px 0',
          }}
        >
          <button
            onClick={onClear}
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
          {logs.length === 0 ? (
            <p style={{ color: '#6b7280' }}>Inga loggar ännu.</p>
          ) : (
            logs.map((line, i) => <LogRow key={i} line={line} />)
          )}
        </div>
      </div>
    </div>
  )
}

function LogRow({ line }) {
  const firstSpace = line.indexOf(' ')
  const timestamp = firstSpace > -1 ? line.slice(0, firstSpace) : ''
  const message = firstSpace > -1 ? line.slice(firstSpace + 1) : line

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
