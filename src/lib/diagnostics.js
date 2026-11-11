// ── Felanalys ─────────────────────────────────────────────────────────────
//
// Allt som behövs för att kunna svara på "VARFÖR gick det fel?" i stället för
// bara "det gick fel". Tre delar:
//
//   1. Miljö    – vilken enhet/webbläsare, vilken appversion, nät, synlighet.
//   2. Spår     – vad som hände i sessionen FÖRE felet (createSessionTrail).
//   3. Diagnos  – råa felmeddelanden översatta till klarspråk: vad hände,
//                 trolig orsak, var felet ligger och vad man gör åt det.
//
// Enbart TEKNISK data. Aldrig betyg, feedbacktext eller vad någon har sagt i
// en intervju – samma princip som resten av driftloggen (lib/systemEvents.js).
//
// Rent där det går (ingen Firebase, ingen React) så det kan enhetstestas.

/* global __APP_VERSION__ */
export const APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

// ── 1. Miljö ──────────────────────────────────────────────────────────────

const IN_APP_PATTERN =
  /FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|TeamsMobile|Teams\/|Slack|MicroMessenger|Line\/|GSA\/|; wv\)/i

/**
 * Tolkar en user agent-sträng till det som spelar roll vid felsökning.
 * `maxTouchPoints` behövs för att skilja iPad (som utger sig för att vara Mac)
 * från en riktig Mac.
 *
 * @returns {{ os, osVersion, device, browser, browserVersion, mobile, inApp, webkit, label }}
 */
export function parseUserAgent(userAgent = '', { maxTouchPoints = 0 } = {}) {
  const ua = String(userAgent ?? '')
  let os = 'Okänt'
  let osVersion = ''
  let device = 'Dator'
  let m

  if ((m = ua.match(/iPhone OS (\d+)[_.](\d+)/))) {
    os = 'iOS'; osVersion = `${m[1]}.${m[2]}`; device = 'iPhone'
  } else if (/iPad/.test(ua) && (m = ua.match(/CPU OS (\d+)[_.](\d+)/))) {
    os = 'iPadOS'; osVersion = `${m[1]}.${m[2]}`; device = 'iPad'
  } else if ((m = ua.match(/Android (\d+(?:\.\d+)?)/))) {
    os = 'Android'; osVersion = m[1]
    device = /Mobile/.test(ua) ? 'Android-telefon' : 'Android-platta'
  } else if (/Macintosh|Mac OS X/.test(ua)) {
    if (maxTouchPoints > 1) { os = 'iPadOS'; device = 'iPad' } else { os = 'macOS'; device = 'Mac' }
  } else if (/Windows/.test(ua)) {
    os = 'Windows'; device = 'Windows-dator'
  } else if (/CrOS/.test(ua)) {
    os = 'ChromeOS'; device = 'Chromebook'
  } else if (/Linux/.test(ua)) {
    os = 'Linux'; device = 'Linux-dator'
  }

  // Ordningen är viktig: nästan alla webbläsare säger sig vara både Chrome
  // och Safari, så de mest specifika markörerna måste prövas först.
  const BROWSERS = [
    ['Edge', /Edg(?:e|iOS|A)?\/(\d+)/],
    ['Opera', /OPR\/(\d+)/],
    ['Samsung Internet', /SamsungBrowser\/(\d+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
    ['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
    ['Safari', /Version\/(\d+)[^ ]* (?:Mobile\/\S+ )?Safari\//],
  ]
  let browser = 'Okänd webbläsare'
  let browserVersion = ''
  for (const [name, pattern] of BROWSERS) {
    const hit = ua.match(pattern)
    if (hit) { browser = name; browserVersion = hit[1]; break }
  }

  const apple = os === 'iOS' || os === 'iPadOS'
  // En app som visar webbsidan i sitt eget fönster (LinkedIn, Teams, Slack …).
  // På iPhone känns de igen på att "Safari/" saknas i strängen.
  const inApp = IN_APP_PATTERN.test(ua) || (apple && !!ua && !/Safari\//.test(ua))
  if (inApp && browser === 'Okänd webbläsare') browser = 'Inbäddad webbläsare'

  const mobile = apple || os === 'Android' || /Mobi/.test(ua)
  // På iPhone/iPad är ALLA webbläsare WebKit under skalet, oavsett namn.
  const webkit = apple || browser === 'Safari'

  const label = [
    device,
    `${browser}${browserVersion ? ` ${browserVersion}` : ''}${inApp && browser !== 'Inbäddad webbläsare' ? ' (inbäddad)' : ''}`,
    osVersion ? `${os} ${osVersion}` : '',
  ].filter(Boolean).join(' · ')

  return { os, osVersion, device, browser, browserVersion, mobile, inApp, webkit, label }
}

/**
 * Ögonblicksbild av miljön när något loggas. Läser webbläsaren – inte ren,
 * men tål att köras utan DOM (returnerar då bara appversionen).
 */
export function collectEnvironment() {
  const env = { appVersion: APP_VERSION }
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return env
  try {
    const parsed = parseUserAgent(navigator.userAgent, {
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
    })
    Object.assign(env, {
      device: parsed.label,
      mobile: parsed.mobile,
      inApp: parsed.inApp,
      webkit: parsed.webkit,
      userAgent: navigator.userAgent,
      screen: `${window.innerWidth}x${window.innerHeight}`,
      online: navigator.onLine,
      visibility: document.visibilityState,
      connection: navigator.connection?.effectiveType ?? '',
      route: window.location.hash,
    })
  } catch { /* miljödata är aldrig värd en krasch */ }
  return env
}

// ── 2. Spår ───────────────────────────────────────────────────────────────

/**
 * Sessionens färdskrivare: korta tidsstämplade noteringar om vad som hände,
 * i minnet. Skickas med när ett fel loggas, så man ser vägen fram till felet.
 *
 * @param {{ now?: () => number, max?: number, random?: () => number }} [opts]
 */
export function createSessionTrail({ now = Date.now, max = 40, random = Math.random } = {}) {
  const startedAt = now()
  const entries = []
  const id = `s_${startedAt.toString(36)}_${Math.floor(random() * 1e9).toString(36)}`
  return {
    id,
    mark(label) {
      const seconds = ((now() - startedAt) / 1000).toFixed(1)
      entries.push(`+${seconds}s ${String(label).slice(0, 70)}`)
      // Behåll starten och det SENASTE – det är slutet som förklarar felet.
      if (entries.length > max) entries.splice(1, entries.length - max)
    },
    entries: () => entries.slice(),
    elapsedMs: () => now() - startedAt,
  }
}

/** Avbruten hämtning (AbortController) – i sig aldrig ett fel. */
export function isAbortError(err) {
  return err?.name === 'AbortError'
}

// ── Fel utanför intervjun ─────────────────────────────────────────────────

const IGNORED_CLIENT_ERRORS = [
  /ResizeObserver loop/i,   // ofarligt webbläsarbrus
  /^Script error\.?$/i,     // fel från annan domän – innehåller ingen information
]
const EXTENSION_PATTERN = /(chrome|moz|safari-web)-extension:\/\//

/**
 * Ska ett okontrollerat fel loggas? Filtrerar brus, tillägg och upprepningar
 * och sätter ett tak per sidladdning så en loop aldrig kan fylla loggen.
 *
 * @param {{ message: string, name?: string, stack?: string }} error
 * @param {Set<string>} seen meddelanden som redan loggats
 */
export function shouldLogClientError({ message, name = '', stack = '' }, seen, max = 5) {
  if (!message) return false
  if (name === 'AbortError') return false
  if (seen.size >= max || seen.has(message)) return false
  if (IGNORED_CLIENT_ERRORS.some((p) => p.test(message))) return false
  if (EXTENSION_PATTERN.test(stack)) return false
  return true
}

/**
 * Fångar fel som ingen annan tog hand om (krasch i en vy, bortglömt
 * promise-fel) och loggar dem. `log` är logSystemEvent – skickas in så den här
 * modulen slipper känna till Firebase.
 */
export function installGlobalErrorLogging(log) {
  if (typeof window === 'undefined') return
  const seen = new Set()
  const report = (source, err, fallbackMessage) => {
    const error = {
      message: String(err?.message ?? fallbackMessage ?? err ?? ''),
      name: String(err?.name ?? ''),
      stack: String(err?.stack ?? ''),
    }
    if (!shouldLogClientError(error, seen)) return
    seen.add(error.message)
    log({
      type: 'client_error',
      severity: 'error',
      step: 'app',
      message: error.message,
      context: { source, errorName: error.name, stack: error.stack },
    })
  }
  window.addEventListener('error', (e) => report('window.onerror', e.error, e.message))
  window.addEventListener('unhandledrejection', (e) => report('unhandledrejection', e.reason))
}

// ── 3. Diagnos ────────────────────────────────────────────────────────────

/** Var felet ligger – avgör vem som kan göra något åt det. */
export const WHERE = {
  BROWSER: 'Användarens webbläsare/enhet',
  APP: 'Vår app',
  SERVICE: 'Extern tjänst',
  NETWORK: 'Nätverket',
  NONE: 'Inget fel',
  UNKNOWN: 'Okänt',
}

const NEEDS_ANALYSIS = 'Behöver undersökas.'

/**
 * Regler i prioritetsordning – första träffen gäller. Varje regel får
 * { step, message, name, status, event } och svarar true/false.
 */
const RULES = [
  {
    key: 'user-left',
    benign: true,
    where: WHERE.NONE,
    test: ({ name, message }) =>
      name === 'AbortError' ||
      /signal is aborted|user aborted a request|operation was aborted|Fetch is aborted/i.test(message),
    title: 'Användaren lämnade intervjun medan rösten hämtades',
    cause:
      'Sidan stängdes eller intervjun avslutades mitt i en hämtning. Hämtningen avbröts då med flit, ' +
      'men loggades tidigare som ett fel.',
    action: 'Inget att åtgärda. Sedan 2026-11 loggas detta som en avbruten session, inte som ett fel.',
  },
  {
    key: 'autoplay-blocked',
    where: WHERE.BROWSER,
    test: ({ step, name, message }) =>
      step === 'tts' &&
      (name === 'NotAllowedError' ||
        /not allowed by the user agent|didn't interact with the document|user denied permission/i.test(message)),
    title: 'Webbläsaren blockerade intervjuarens röst',
    cause:
      'Safari och alla webbläsare på iPhone/iPad spelar bara upp ljud som startats av ett tryck. ' +
      'Intervjun startade av sig själv, så rösten nekades och intervjun kom aldrig igång.',
    action:
      'Sedan 2026-11 låser appen upp ljudet i klicket på Starta och visar annars knappen ' +
      '"Tryck för att starta ljudet". Dyker felet upp EFTER det: behöver undersökas.',
  },
  {
    key: 'mic-denied',
    where: WHERE.BROWSER,
    test: ({ step, name }) => step === 'mic' && (name === 'NotAllowedError' || name === 'SecurityError'),
    title: 'Mikrofonen nekades',
    cause:
      'Användaren (eller webbläsarens/telefonens inställningar) tillät inte mikrofonen för sidan.',
    action:
      'Användaren behöver tillåta mikrofonen: i Safari på iPhone via "aA"/sidinställningar → Mikrofon → Tillåt, ' +
      'i Chrome via hänglåset i adressfältet. Appen visar en förklaring i stället för ett tekniskt fel.',
  },
  {
    key: 'mic-unavailable',
    where: WHERE.BROWSER,
    test: ({ step, name }) =>
      step === 'mic' && ['NotFoundError', 'NotReadableError', 'OverconstrainedError'].includes(name),
    title: 'Ingen användbar mikrofon hittades',
    cause:
      'Enheten saknar mikrofon, eller så används den av ett annat program (t.ex. ett pågående Teams-möte).',
    action: 'Användaren behöver ansluta/frigöra en mikrofon och försöka igen.',
  },
  {
    key: 'mic-unsupported',
    where: WHERE.BROWSER,
    test: ({ step }) => step === 'mic',
    title: 'Webbläsaren kan inte spela in ljud',
    cause:
      'Inspelning stöds inte här. Vanligast: sidan öppnades i en apps inbäddade webbläsare ' +
      '(länk från LinkedIn, Teams, Slack …) i stället för i Safari/Chrome. Se "Enhet" på raden.',
    action:
      'Be användaren öppna länken i Safari eller Chrome. Återkommer det i en riktig webbläsare: behöver undersökas.',
  },
  {
    key: 'recorder-stalled',
    where: WHERE.BROWSER,
    test: ({ step }) => step === 'recorder',
    title: 'Inspelningen levererade inget svar',
    cause:
      'Webbläsaren avslutade aldrig inspelningen ordentligt – typiskt när skärmen låstes, appen ' +
      'hamnade i bakgrunden eller ett samtal kom in under svaret. Spåret visar om sidan doldes.',
    action: 'Användaren fick svara om. Händer det ofta på samma enhet: behöver undersökas.',
  },
  {
    key: 'permissions',
    where: WHERE.APP,
    test: ({ message }) => /Missing or insufficient permissions|permission-denied/i.test(message),
    title: 'Databasen nekade åtkomst',
    cause:
      'En säkerhetsregel i Firestore saknas eller är inte utrullad. (Fel i steget pending_migration ' +
      'före 2026-09-14 är kända: regeln låg odeployad och rättades då.)',
    action:
      'Kontrollera att firestore.rules är deployad. Nya förekomster efter 2026-09-14 behöver undersökas.',
  },
  {
    key: 'voice-model-retired',
    where: WHERE.SERVICE,
    test: ({ message }) =>
      /model.{0,40}(not found|does not exist|deprecated|no longer|shut ?down)/i.test(message),
    title: 'Röstmodellen finns inte längre hos OpenAI',
    cause:
      'OpenAI har stängt modellen som proxyn anropar (tts-1-hd stängs 2027-01-06, whisper-1 2027-02-26).',
    action: 'Akut: genomför den planerade migreringen till OpenAI Realtime / gpt-transcribe (se CLAUDE.md).',
  },
  {
    key: 'service-auth',
    where: WHERE.SERVICE,
    test: ({ status, message }) =>
      status === 401 || status === 403 || /invalid.{0,10}api.?key|incorrect api key|authentication/i.test(message),
    title: 'API-nyckeln godkändes inte',
    cause: 'Nyckeln till den externa tjänsten är fel, utgången eller borttagen.',
    action: 'Kontrollera nyckeln (OPENAI_API_KEY i Vercel, VITE_CLAUDE_API_KEY i GitHub) och deploya om.',
  },
  {
    key: 'service-quota',
    where: WHERE.SERVICE,
    test: ({ status, message }) =>
      status === 429 || /quota|rate.?limit|billing|insufficient_quota|credit balance/i.test(message),
    title: 'Tjänsten sa nej: kvot eller saldo',
    cause: 'För många anrop på kort tid, eller så är kontots saldo/kvot slut.',
    action: 'Kontrollera saldo och gränser hos OpenAI respektive Anthropic.',
  },
  {
    key: 'audio-format',
    where: WHERE.APP,
    test: ({ step, status, message }) =>
      step === 'whisper' && (status === 400 || /invalid file format|could not be decoded|unsupported/i.test(message)),
    title: 'Inspelningen kunde inte tolkas',
    cause:
      'Transkriberingen accepterade inte ljudfilen. Troligen ett inspelningsformat från en ' +
      'webbläsare vi inte hanterar rätt – se "Enhet" och inspelningsformatet i detaljerna.',
    action: NEEDS_ANALYSIS,
  },
  {
    key: 'service-down',
    where: WHERE.SERVICE,
    test: ({ status, message }) =>
      (status >= 500 && status <= 599) || /overloaded|service unavailable|bad gateway|internal server error/i.test(message),
    title: 'Den externa tjänsten svarade med ett serverfel',
    cause: 'OpenAI, Anthropic eller Vercel hade ett tillfälligt problem.',
    action: 'Oftast övergående – användaren kan försöka igen. Återkommer det samma dag: kolla tjänstens statussida.',
  },
  {
    key: 'timeout',
    where: WHERE.NETWORK,
    test: ({ name, message }) =>
      name === 'TimeoutError' || /tog för lång tid|took too long|timed? ?out/i.test(message),
    title: 'Ett anrop tog för lång tid',
    cause: 'Svagt nät hos användaren eller en seg tjänst. Kontrollera "Nät" i detaljerna.',
    action: 'Användaren fick försöka igen. Återkommande: behöver undersökas.',
  },
  {
    key: 'network',
    where: WHERE.NETWORK,
    test: ({ message }) =>
      /Failed to fetch|NetworkError|Load failed|network request failed|client is offline|ERR_INTERNET/i.test(message),
    title: 'Anropet nådde aldrig servern',
    cause:
      'Uppkopplingen bröts – typiskt mobilnät, byte mellan wifi och mobildata, eller att telefonen ' +
      'låstes. Mer sällan: en brandvägg som blockerar tjänsten.',
    action: 'Oftast övergående. Samma användare gång på gång: fråga om nätet (företagsnät/VPN).',
  },
  {
    key: 'no-speech',
    where: WHERE.BROWSER,
    test: ({ message }) => /Inget tal detekterat/i.test(message),
    title: 'Inspelningen innehöll inget tal',
    cause:
      'Transkriberingen gav en tom text: tyst inspelning, fel mikrofon vald eller mycket kort svar.',
    action: 'Användaren fick svara om. Händer det ofta för samma person: fel mikrofon är trolig orsak.',
  },
  {
    key: 'playback-failed',
    where: WHERE.BROWSER,
    test: ({ message }) => /Ljudet kunde inte spelas upp/i.test(message),
    title: 'Rösten hämtades men gick inte att spela upp',
    cause: 'Webbläsaren kunde inte avkoda eller starta ljudet.',
    action: NEEDS_ANALYSIS,
  },
  {
    key: 'analysis-failed',
    where: WHERE.SERVICE,
    test: ({ step }) => step === 'claude',
    title: 'Feedbackanalysen misslyckades',
    cause: 'Claude svarade med ett fel eller ett svar som inte gick att tolka.',
    action: 'Användaren får knappen "Försök igen" och intervjun går inte förlorad. Återkommande: behöver undersökas.',
  },
  {
    key: 'app-crash',
    where: WHERE.APP,
    test: ({ event }) => event.type === 'client_error',
    title: 'Ett oväntat fel i appen',
    cause: 'Kod i appen kraschade. Detaljerna visar felets namn, var det uppstod och på vilken sida.',
    action: NEEDS_ANALYSIS,
  },
]

const UNKNOWN_DIAGNOSIS = {
  key: 'unknown',
  benign: false,
  where: WHERE.UNKNOWN,
  title: 'Okänt fel – inte klassificerat än',
  cause: 'Felet matchar ingen känd orsak.',
  action: NEEDS_ANALYSIS,
}

/**
 * Översätter en händelse i driftloggen till klarspråk.
 *
 * @param {{ type?, step?, message?, context? }} event
 * @returns {{ key, title, cause, action, where, benign }}
 */
export function diagnoseEvent(event = {}) {
  const message = String(event.message ?? '')
  const context = event.context ?? {}
  const httpMatch = message.match(/HTTP (\d{3})/)
  const input = {
    event,
    step: String(event.step ?? ''),
    message: `${message} ${context.detail ?? ''}`,
    name: String(context.errorName ?? ''),
    status: Number(context.httpStatus ?? (httpMatch ? httpMatch[1] : 0)) || 0,
  }
  const rule = RULES.find((r) => {
    try { return r.test(input) } catch { return false }
  })
  if (!rule) return UNKNOWN_DIAGNOSIS
  const { key, title, cause, action, where, benign = false } = rule
  return { key, title, cause, action, where, benign }
}

/**
 * Grupperar fel per orsak – "vilka problem har vi, och hur vanliga är de?"
 * Sorterat på antal, sedan senast inträffat.
 *
 * @param {Array<object>} events händelser med `createdAtMs`
 */
export function groupByDiagnosis(events = []) {
  const groups = new Map()
  for (const event of events) {
    const d = diagnoseEvent(event)
    const g = groups.get(d.key) ?? { ...d, count: 0, lastMs: 0, uids: new Set() }
    g.count++
    g.lastMs = Math.max(g.lastMs, event.createdAtMs ?? 0)
    if (event.uid) g.uids.add(event.uid)
    groups.set(d.key, g)
  }
  return [...groups.values()]
    .map(({ uids, ...g }) => ({ ...g, users: uids.size }))
    .sort((a, b) => b.count - a.count || b.lastMs - a.lastMs)
}

/**
 * Tratten: hur många påbörjade sessioner blev klara? Bygger på
 * session_started, som började loggas 2026-11 – äldre sessioner saknas.
 */
export function summarizeFunnel(events = []) {
  const started = new Set()
  const completed = new Set()
  const aborted = new Set()
  const failed = new Set()
  for (const e of events) {
    const id = e.context?.sessionId
    if (!id) continue
    if (e.type === 'session_started') started.add(id)
    else if (e.type === 'session_completed') completed.add(id)
    else if (e.type === 'session_aborted') aborted.add(id)
    else if (e.severity === 'error') failed.add(id)
  }
  const count = (set, exclude) =>
    [...set].filter((id) => started.has(id) && !exclude?.has(id)).length
  const startedTotal = started.size
  const completedTotal = count(completed)
  return {
    started: startedTotal,
    completed: completedTotal,
    // Avbruten av användaren utan att ett fel loggats under sessionen.
    aborted: [...aborted].filter((id) => started.has(id) && !completed.has(id) && !failed.has(id)).length,
    // Fel under sessionen OCH sessionen blev aldrig klar.
    failed: count(failed, completed),
    completionRate: startedTotal > 0 ? completedTotal / startedTotal : 0,
  }
}

const CONTEXT_LABELS = [
  ['device', 'Enhet'],
  ['appVersion', 'Appversion'],
  ['route', 'Sida'],
  ['phase', 'Läge i intervjun'],
  ['questionIndex', 'Fråga (0 = första)'],
  ['totalQuestions', 'Antal frågor'],
  ['elapsedMs', 'Tid in i sessionen (ms)'],
  ['errorName', 'Feltyp'],
  ['httpStatus', 'HTTP-status'],
  ['detail', 'Svar från tjänsten'],
  ['recorderMime', 'Inspelningsformat'],
  ['audioBytes', 'Ljudstorlek (byte)'],
  ['audioUnlocked', 'Ljud upplåst av tryck'],
  ['language', 'Intervjuspråk'],
  ['voice', 'Röst'],
  ['online', 'Online'],
  ['connection', 'Nät'],
  ['visibility', 'Sidan synlig'],
  ['screen', 'Fönsterstorlek'],
  ['mobile', 'Mobil enhet'],
  ['inApp', 'Inbäddad webbläsare'],
  ['webkit', 'WebKit (Safari-motorn)'],
  ['source', 'Källa'],
  ['sessionId', 'Sessions-id'],
  ['userAgent', 'User agent'],
  ['stack', 'Stack'],
]

/**
 * De ENDA fält som får följa med en händelse (plus spåret). En vitlista, så
 * att driftloggen aldrig av misstag kan börja bära betyg eller intervjuinnehåll.
 */
export const CONTEXT_FIELDS = new Set([...CONTEXT_LABELS.map(([key]) => key), 'trail'])

/** Kontextfälten som [etikett, värde]-par i läsvänlig ordning. */
export function describeContext(context) {
  if (!context || typeof context !== 'object') return []
  return CONTEXT_LABELS
    .filter(([key]) => context[key] !== undefined && context[key] !== '' && context[key] !== null)
    .map(([key, label]) => [label, typeof context[key] === 'boolean' ? (context[key] ? 'ja' : 'nej') : String(context[key])])
}

/**
 * En komplett felrapport som ren text. Innehåller uid men inga namn, och
 * aldrig intervjuinnehåll.
 *
 * @param {object} event händelsen (med createdAtMs)
 * @param {Array<object>} [sessionEvents] övriga händelser i samma session
 */
export function buildErrorReport(event, sessionEvents = []) {
  const d = diagnoseEvent(event)
  const time = (ms) => (ms ? new Date(ms).toISOString() : 'okänd tid')
  const lines = [
    'FELRAPPORT – Intervjucoach',
    `Tid: ${time(event.createdAtMs)}`,
    `Typ: ${event.type} · Steg: ${event.step || '—'} · Allvar: ${event.severity}`,
    `Meddelande: ${event.message || '—'}`,
    `Användare (uid): ${event.uid ?? '—'}`,
    '',
    `Diagnos: ${d.title} [${d.key}]`,
    `Var: ${d.where}`,
    `Trolig orsak: ${d.cause}`,
    '',
    'Detaljer:',
    ...describeContext(event.context).map(([label, value]) => `  ${label}: ${value}`),
  ]
  const trail = event.context?.trail ?? []
  if (trail.length) {
    lines.push('', 'Spår (vad som hände i sessionen före felet):', ...trail.map((t) => `  ${t}`))
  }
  if (sessionEvents.length) {
    lines.push('', 'Alla loggade händelser i samma session:')
    for (const e of [...sessionEvents].sort((a, b) => (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0))) {
      lines.push(`  ${time(e.createdAtMs)}  ${e.type}  ${e.step || '—'}  ${e.message || ''}`.trimEnd())
    }
  }
  return lines.join('\n')
}
