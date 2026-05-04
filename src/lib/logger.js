// ── Logger Configuration ──────────────────────────────────────────────────

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
}

const CATEGORIES = {
  AUTH: 'AUTH',
  FIRESTORE: 'FIRESTORE',
  CLAUDE: 'CLAUDE',
  OPENAI: 'OPENAI',
  APP: 'APP',
}

const MAX_LOGS = 50
const logs = []

// Make logs accessible via window for debugging
if (typeof window !== 'undefined') {
  window.__appLogs = logs
}

// ── Core Logger ───────────────────────────────────────────────────────────

function log(category, level, message, data = null) {
  const timestamp = new Date().toISOString()
  const logEntry = {
    timestamp,
    category,
    level,
    message,
    data,
  }

  // Add to in-memory list (keep max 50)
  logs.push(logEntry)
  if (logs.length > MAX_LOGS) {
    logs.shift()
  }

  // In dev mode, log to console
  if (import.meta.env.DEV) {
    const prefix = `[${category}][${level}]`
    const consoleMethod =
      level === 'ERROR'
        ? console.error
        : level === 'WARN'
        ? console.warn
        : console.log

    if (data) {
      consoleMethod(prefix, message, data)
    } else {
      consoleMethod(prefix, message)
    }
  }

  // Always store errors
  if (level === 'ERROR') {
    // Errors are already in the logs array
  }
}

// ── Public API ────────────────────────────────────────────────────────────

const logger = {
  debug: (category, message, data) => log(category, 'DEBUG', message, data),
  info: (category, message, data) => log(category, 'INFO', message, data),
  warn: (category, message, data) => log(category, 'WARN', message, data),
  error: (category, message, data) => log(category, 'ERROR', message, data),
  
  // Get all logs
  getLogs: () => [...logs],
  
  // Clear logs
  clearLogs: () => {
    logs.length = 0
  },
}

export { logger, CATEGORIES }
export default logger
