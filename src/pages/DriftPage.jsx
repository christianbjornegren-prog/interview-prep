import { useEffect, useState, useCallback, useMemo } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { summarizeEvents } from '../lib/systemEvents'

// Teknisk driftöversikt: hälsovy byggd på systemEvents (driftloggen).
// Visar INGA betyg, INGEN feedbacktext och INGEN prestationsrankning per
// person – enbart icke-personliga aggregat + tekniska felhändelser så att
// kedjan Whisper → Claude → TTS → Firestore kan felsökas.

const STEP_LABEL = {
  whisper: 'Whisper (tal→text)',
  claude: 'Claude (analys)',
  tts: 'TTS (text→tal)',
  firestore: 'Firestore (sparning)',
  complete: 'Slutförande',
}

export default function DriftPage() {
  const [events, setEvents] = useState([])
  const [nameMap, setNameMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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

  const stats = useMemo(() => summarizeEvents(events), [events])
  const errorEvents = useMemo(
    () => events.filter((e) => e.severity === 'error').slice(0, 50),
    [events]
  )

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Driftöversikt</h1>
          <p className="mt-1 text-sm" style={{ color: '#6b7280' }}>
            Teknisk hälsa för intervjukedjan. Inga betyg eller feedbackinnehåll – endast driftdata.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs font-medium transition-colors disabled:opacity-40 shrink-0 pt-1"
          style={{ color: '#6b7280' }}
          onMouseOver={(e) => !loading && (e.currentTarget.style.color = '#fff')}
          onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
        >
          🔄 Uppdatera
        </button>
      </div>

      {loading && (
        <p className="text-sm" style={{ color: '#6b7280' }}>Laddar driftdata…</p>
      )}

      {error && (
        <div
          className="rounded-xl border px-5 py-4 text-sm"
          style={{ backgroundColor: '#1d1d1d', borderColor: '#5b1a1a', color: '#f87171' }}
        >
          <p className="font-semibold mb-1">Kunde inte hämta driftdata</p>
          <p style={{ color: '#9ca3af' }}>{error}</p>
          {error.includes('index') && (
            <p className="mt-2" style={{ color: '#6b7280' }}>
              Skapa ett Firestore-index för <code>systemEvents</code> på fältet{' '}
              <code>createdAt</code> (descending). Länken finns i konsolen ovan.
            </p>
          )}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* KPI:er */}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
            <Kpi label="Slutförda sessioner" value={stats.completedTotal} />
            <Kpi label="Senaste 7 dagarna" value={stats.completed7} />
            <Kpi label="Senaste 30 dagarna" value={stats.completed30} />
            <Kpi label="Aktiva konsulter" value={stats.activeConsultants} />
            <Kpi label="Tekniska fel" value={stats.errorTotal} accent={stats.errorTotal > 0 ? '#f87171' : undefined} />
            <Kpi
              label="Felfrekvens"
              value={`${Math.round(stats.errorRate * 100)}%`}
              sub={`${stats.errorTotal} av ${stats.attempts} försök`}
              accent={stats.errorRate >= 0.2 ? '#f87171' : stats.errorRate > 0 ? '#E9C46A' : '#4ade80'}
            />
          </div>

          {/* Senaste fel */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#8064ad' }}>
              Senaste tekniska fel
            </p>

            {errorEvents.length === 0 ? (
              <div
                className="rounded-xl border px-5 py-6 text-center"
                style={{ backgroundColor: '#1d1d1d', borderColor: '#404040' }}
              >
                <p className="text-sm" style={{ color: '#6b7280' }}>
                  Inga fel loggade. Kedjan Whisper → Claude → TTS → Firestore rapporterar rent.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#404040' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: '#1a1a1a', borderBottom: '1px solid #323232' }}>
                        <Th>Tid</Th>
                        <Th>Steg</Th>
                        <Th>Meddelande</Th>
                        <Th>Konsult</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {errorEvents.map((e, i) => (
                        <tr
                          key={e.id}
                          style={{
                            backgroundColor: i % 2 === 0 ? '#1d1d1d' : '#191919',
                            borderBottom: '1px solid #2a2a2a',
                          }}
                        >
                          <Td>
                            {e.createdAt
                              ? e.createdAt.toLocaleString('sv-SE', {
                                  year: 'numeric', month: '2-digit', day: '2-digit',
                                  hour: '2-digit', minute: '2-digit',
                                })
                              : '—'}
                          </Td>
                          <Td>
                            <span className="text-white">{STEP_LABEL[e.step] ?? e.step ?? '—'}</span>
                          </Td>
                          <Td>
                            <span style={{ color: '#f0a085' }}>{e.message || '—'}</span>
                          </Td>
                          <Td>{e.uid ? (nameMap[e.uid] ?? e.uid) : '—'}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, sub, accent }) {
  return (
    <div className="rounded-xl border p-5" style={{ backgroundColor: '#1d1d1d', borderColor: '#404040' }}>
      <p className="text-xs font-medium" style={{ color: '#6b7280' }}>{label}</p>
      <p className="text-3xl font-bold mt-2" style={{ color: accent ?? '#fff' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: '#6b7280' }}>{sub}</p>}
    </div>
  )
}

function Th({ children }) {
  return (
    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-left" style={{ color: '#6b7280' }}>
      {children}
    </th>
  )
}

function Td({ children }) {
  return (
    <td className="px-4 py-3 align-top" style={{ color: '#9ca3af' }}>
      {children}
    </td>
  )
}
