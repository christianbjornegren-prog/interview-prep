import { useEffect, useState, useCallback, useMemo } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { summarizeEvents } from '../lib/systemEvents'
import {
  buildErrorReport,
  describeContext,
  diagnoseEvent,
  groupByDiagnosis,
  summarizeFunnel,
} from '../lib/diagnostics'

// Teknisk driftöversikt: hälsovy byggd på systemEvents (driftloggen).
// Visar INGA betyg, INGEN feedbacktext och INGEN prestationsrankning per
// person – enbart icke-personliga aggregat + tekniska felhändelser så att
// kedjan Whisper → Claude → TTS → Firestore kan felsökas.
//
// Varje fel översätts till klarspråk (lib/diagnostics.js): vad hände, trolig
// orsak, var felet ligger och vad man gör åt det. Raden kan fällas ut för
// underlaget – enhet, läge i intervjun och spåret fram till felet – och hela
// rapporten kan kopieras för analys.

const STEP_LABEL = {
  whisper: 'Whisper (tal→text)',
  claude: 'Claude (analys)',
  tts: 'TTS (text→tal)',
  firestore: 'Firestore (sparning)',
  complete: 'Slutförande',
  mic: 'Mikrofon',
  recorder: 'Inspelning',
  app: 'Appen',
  start: 'Start',
  pending_migration: 'Överlämning av profil',
}

const TYPE_LABEL = {
  session_started: 'Intervjun startade',
  session_completed: 'Intervjun slutfördes',
  session_aborted: 'Användaren avbröt',
  audio_blocked: 'Ljudet krävde ett tryck',
  pipeline_error: 'Fel',
  client_error: 'Fel i appen',
}

const formatTime = (date) =>
  date
    ? date.toLocaleString('sv-SE', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      })
    : '—'

export default function DriftPage() {
  const [events, setEvents] = useState([])
  const [nameMap, setNameMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [openId, setOpenId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const usersSnap = await getDocs(collection(db, 'users'))
      const names = {}
      usersSnap.forEach((d) => {
        const data = d.data()
        names[d.id] = data.name || data.email || d.id
      })

      const evSnap = await getDocs(
        query(collection(db, 'systemEvents'), orderBy('createdAt', 'desc'))
      )
      const evs = evSnap.docs.map((d) => {
        const data = d.data()
        const ms = data.createdAt?.toMillis?.() ?? null
        return {
          id: d.id,
          type: data.type ?? 'unknown',
          severity: data.severity ?? 'info',
          step: data.step ?? '',
          message: data.message ?? '',
          uid: data.uid ?? null,
          // Felsökningsunderlaget. Saknas på händelser loggade före 2026-11.
          context: data.context ?? null,
          createdAtMs: ms,
          createdAt: ms ? new Date(ms) : null,
        }
      })

      setNameMap(names)
      setEvents(evs)
    } catch (err) {
      console.error('DriftPage:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Varje fel får sin diagnos EN gång. Avbrott som användaren själv gjorde
  // (benign) loggades förr som fel – de räknas inte in i felstatistiken.
  const diagnosed = useMemo(
    () => events
      .filter((e) => e.severity === 'error')
      .map((e) => ({ ...e, diagnosis: diagnoseEvent(e) })),
    [events]
  )
  const realErrors = useMemo(() => diagnosed.filter((e) => !e.diagnosis.benign), [diagnosed])
  const benignCount = diagnosed.length - realErrors.length

  const stats = useMemo(() => {
    const benignIds = new Set(diagnosed.filter((e) => e.diagnosis.benign).map((e) => e.id))
    return summarizeEvents(events.filter((e) => !benignIds.has(e.id)))
  }, [events, diagnosed])
  const funnel = useMemo(() => summarizeFunnel(events), [events])
  const causes = useMemo(() => groupByDiagnosis(diagnosed), [diagnosed])
  const audioBlocked = useMemo(
    () => events.filter((e) => e.type === 'audio_blocked').length,
    [events]
  )
  const sessions = useMemo(() => {
    const map = new Map()
    for (const e of events) {
      const id = e.context?.sessionId
      if (!id) continue
      if (!map.has(id)) map.set(id, [])
      map.get(id).push(e)
    }
    return map
  }, [events])

  const shownErrors = diagnosed.slice(0, 50)
  const unknownOutcome = Math.max(0, funnel.started - funnel.completed - funnel.aborted - funnel.failed)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-medium text-text-primary tracking-tight">Driftöversikt</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Teknisk hälsa för intervjukedjan. Inga betyg eller feedbackinnehåll – endast driftdata.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs font-medium transition-colors disabled:opacity-40 shrink-0 py-2"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseOver={(e) => !loading && (e.currentTarget.style.color = 'var(--color-text-primary)')}
          onMouseOut={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
        >
          Uppdatera
        </button>
      </div>

      {loading && (
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Laddar driftdata…</p>
      )}

      {error && (
        <div
          className="rounded-xl border px-5 py-4 text-sm"
          style={{ backgroundColor: 'var(--color-feedback-error-background)', borderColor: 'var(--color-feedback-error)', color: 'var(--color-feedback-error)' }}
        >
          <p className="font-semibold mb-1">Kunde inte hämta driftdata</p>
          <p style={{ color: 'var(--color-text-secondary)' }}>{error}</p>
          {error.includes('index') && (
            <p className="mt-2" style={{ color: 'var(--color-text-secondary)' }}>
              Skapa ett Firestore-index för <code>systemEvents</code> på fältet{' '}
              <code>createdAt</code> (descending). Länken finns i konsolen ovan.
            </p>
          )}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* KPI:er */}
          <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3">
            <Kpi label="Slutförda sessioner" value={stats.completedTotal} />
            <Kpi label="Senaste 7 dagarna" value={stats.completed7} />
            <Kpi label="Senaste 30 dagarna" value={stats.completed30} />
            <Kpi label="Aktiva konsulter" value={stats.activeConsultants} />
            <Kpi
              label="Tekniska fel"
              value={stats.errorTotal}
              sub={benignCount > 0 ? `${benignCount} ${benignCount === 1 ? 'ofarligt' : 'ofarliga'} avbrott räknas inte` : undefined}
              accent={stats.errorTotal > 0 ? 'var(--color-feedback-error)' : undefined}
            />
            <Kpi
              label="Felfrekvens"
              value={`${Math.round(stats.errorRate * 100)}%`}
              sub={`${stats.errorTotal} av ${stats.attempts} försök`}
              accent={stats.errorRate >= 0.2 ? 'var(--color-feedback-error)' : stats.errorRate > 0 ? 'var(--color-feedback-warning)' : 'var(--color-feedback-success)'}
            />
          </div>

          {/* Tratten – bygger på session_started, som loggas sedan 2026-11 */}
          {funnel.started > 0 && (
            <div>
              <SectionLabel>Hur går det för dem som startar?</SectionLabel>
              <div
                className="rounded-xl border p-4 sm:p-5"
                style={{ backgroundColor: 'var(--color-background-primary)', borderColor: 'var(--color-border-default)' }}
              >
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                  <Stat label="Påbörjade" value={funnel.started} />
                  <Stat
                    label="Slutförda"
                    value={funnel.completed}
                    sub={`${Math.round(funnel.completionRate * 100)} %`}
                    color="var(--color-feedback-success)"
                  />
                  <Stat label="Avbröt själv" value={funnel.aborted} />
                  <Stat
                    label="Stoppade av fel"
                    value={funnel.failed}
                    color={funnel.failed > 0 ? 'var(--color-feedback-error)' : undefined}
                  />
                  <Stat label="Stängde sidan" value={unknownOutcome} />
                  <Stat label="Ljud krävde tryck" value={audioBlocked} />
                </div>
                <p className="text-xs mt-4" style={{ color: 'var(--color-text-secondary)' }}>
                  Räknas från november 2026, då starten av en intervju började loggas. "Stängde sidan"
                  är sessioner utan loggat slut – fliken eller telefonen stängdes mitt i.
                  "Ljud krävde tryck" är inget fel: webbläsaren bad om ett extra tryck och fick det.
                </p>
              </div>
            </div>
          )}

          {/* Orsaker */}
          {causes.length > 0 && (
            <div>
              <SectionLabel>Vanligaste orsakerna</SectionLabel>
              <div className="grid gap-3 md:grid-cols-2">
                {causes.map((c) => (
                  <div
                    key={c.key}
                    className="rounded-xl border p-4 sm:p-5 space-y-2"
                    style={{ backgroundColor: 'var(--color-background-primary)', borderColor: 'var(--color-border-default)' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-text-primary">{c.title}</p>
                      <span
                        className="shrink-0 text-xs font-semibold rounded-full px-2.5 py-0.5"
                        style={c.benign
                          ? { backgroundColor: 'var(--color-background-tertiary)', color: 'var(--color-text-secondary)' }
                          : { backgroundColor: 'var(--color-feedback-error-background)', color: 'var(--color-feedback-error)' }}
                      >
                        {c.count} st
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      {c.benign ? 'Ofarligt' : c.where}
                      {' · '}{c.users} {c.users === 1 ? 'person' : 'personer'}
                      {c.lastMs ? ` · senast ${formatTime(new Date(c.lastMs))}` : ''}
                    </p>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                      {c.cause}
                    </p>
                    <p className="text-sm leading-relaxed text-text-primary">
                      <span className="font-semibold">Åtgärd: </span>{c.action}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Senaste fel */}
          <div>
            <SectionLabel>Senaste tekniska fel</SectionLabel>

            {shownErrors.length === 0 ? (
              <div
                className="rounded-xl border px-5 py-6 text-center"
                style={{ backgroundColor: 'var(--color-background-primary)', borderColor: 'var(--color-border-default)' }}
              >
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  Inga fel loggade. Kedjan Whisper → Claude → TTS → Firestore rapporterar rent.
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                  Tryck på en rad för orsak, åtgärd och felsökningsunderlag.
                </p>
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border-default)' }}>
                  {shownErrors.map((e, i) => (
                    <ErrorRow
                      key={e.id}
                      event={e}
                      striped={i % 2 === 1}
                      open={openId === e.id}
                      onToggle={() => setOpenId(openId === e.id ? null : e.id)}
                      userName={e.uid ? (nameMap[e.uid] ?? e.uid) : '—'}
                      sessionEvents={sessions.get(e.context?.sessionId) ?? []}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── En felrad: sammanfattning + utfällbart underlag ───────────────────────

function ErrorRow({ event, striped, open, onToggle, userName, sessionEvents }) {
  const d = event.diagnosis
  const [copied, setCopied] = useState(false)

  async function copyReport() {
    const report = buildErrorReport(event, sessionEvents)
    try {
      await navigator.clipboard.writeText(report)
    } catch {
      // Äldre webbläsare / nekad urklippsåtkomst: visa rapporten så den går
      // att markera och kopiera för hand.
      window.prompt('Kopiera felrapporten:', report)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const details = describeContext(event.context ?? {})
  const trail = event.context?.trail ?? []
  const timeline = [...sessionEvents].sort((a, b) => (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0))

  return (
    <div
      style={{
        backgroundColor: striped ? 'var(--color-background-secondary)' : 'var(--color-background-primary)',
        borderBottom: '1px solid var(--color-border-default)',
      }}
    >
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full text-left px-4 py-3 grid gap-x-4 gap-y-1 items-start sm:grid-cols-[9.5rem_minmax(0,1fr)_11rem_1rem]"
      >
        <span className="text-xs sm:text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {formatTime(event.createdAt)}
          <span className="sm:block"> · {STEP_LABEL[event.step] ?? event.step ?? '—'}</span>
        </span>
        <span className="min-w-0">
          <span
            className="block text-sm font-medium"
            style={{ color: d.benign ? 'var(--color-text-secondary)' : 'var(--color-text-primary)' }}
          >
            {d.title}
          </span>
          <span
            className="block text-xs mt-0.5 break-words"
            style={{ color: d.benign ? 'var(--color-text-secondary)' : 'var(--color-feedback-error)' }}
          >
            {event.message || '—'}
          </span>
        </span>
        <span className="text-xs sm:text-sm min-w-0 break-words" style={{ color: 'var(--color-text-secondary)' }}>
          {userName}
          <span className="block text-xs">{event.context?.device ?? 'Enhet okänd'}</span>
        </span>
        <svg
          className="hidden sm:block mt-1 transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'none', color: 'var(--color-text-secondary)' }}
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-5 pt-1 space-y-4">
          <dl className="grid gap-3 text-sm md:grid-cols-2">
            <Fact term="Vad hände">{d.title}</Fact>
            <Fact term="Var ligger felet">{d.benign ? 'Inget fel – användaren avbröt själv' : d.where}</Fact>
            <Fact term="Trolig orsak">{d.cause}</Fact>
            <Fact term="Åtgärd">{d.action}</Fact>
          </dl>

          {details.length > 0 ? (
            <Panel title="Felsökningsunderlag">
              <dl className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
                {details.map(([label, value]) => (
                  <div key={label} className="flex gap-2 min-w-0">
                    <dt className="shrink-0" style={{ color: 'var(--color-text-secondary)' }}>{label}:</dt>
                    <dd className="min-w-0 break-words text-text-primary">{value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          ) : (
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              Det här felet loggades innan felsökningsunderlaget infördes (november 2026). Enhet,
              webbläsare och förlopp finns därför inte sparade – diagnosen bygger på felmeddelandet.
            </p>
          )}

          {trail.length > 0 && (
            <Panel title="Förloppet fram till felet">
              <ol className="text-xs space-y-0.5 font-mono break-words text-text-primary">
                {trail.map((line, i) => <li key={i}>{line}</li>)}
              </ol>
            </Panel>
          )}

          {timeline.length > 1 && (
            <Panel title="Allt som loggades i samma session">
              <ol className="text-xs space-y-1">
                {timeline.map((s) => (
                  <li key={s.id} className="flex flex-wrap gap-x-2" style={{ color: 'var(--color-text-secondary)' }}>
                    <span>{s.createdAt ? s.createdAt.toLocaleTimeString('sv-SE') : '—'}</span>
                    <span
                      className="font-medium"
                      style={{ color: s.severity === 'error' ? 'var(--color-feedback-error)' : 'var(--color-text-primary)' }}
                    >
                      {TYPE_LABEL[s.type] ?? s.type}
                    </span>
                    <span className="min-w-0 break-words">{s.message}</span>
                  </li>
                ))}
              </ol>
            </Panel>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={copyReport}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              style={{
                backgroundColor: 'var(--color-action-secondary-background)',
                border: '1px solid var(--color-action-secondary-border)',
                color: 'var(--color-action-secondary-text)',
              }}
            >
              {copied ? 'Kopierad' : 'Kopiera felrapport'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--color-accent-purple)' }}>
      {children}
    </p>
  )
}

function Kpi({ label, value, sub, accent }) {
  return (
    <div className="rounded-xl border p-4 sm:p-5" style={{ backgroundColor: 'var(--color-background-primary)', borderColor: 'var(--color-border-default)' }}>
      <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{label}</p>
      <p className="text-3xl font-bold mt-2" style={{ color: accent ?? 'var(--color-text-primary)' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>{sub}</p>}
    </div>
  )
}

function Stat({ label, value, sub, color }) {
  return (
    <div>
      <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color: color ?? 'var(--color-text-primary)' }}>
        {value}
        {sub && <span className="text-xs font-medium ml-1.5" style={{ color: 'var(--color-text-secondary)' }}>{sub}</span>}
      </p>
    </div>
  )
}

function Fact({ term, children }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>{term}</dt>
      <dd className="mt-1 leading-relaxed text-text-primary">{children}</dd>
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <div
      className="rounded-lg border p-3 sm:p-4"
      style={{ backgroundColor: 'var(--color-background-tertiary)', borderColor: 'var(--color-border-default)' }}
    >
      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>{title}</p>
      {children}
    </div>
  )
}
