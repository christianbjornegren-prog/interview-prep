import { useEffect, useState } from 'react'
import { collection, collectionGroup, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '../lib/firebase'

export default function DriftPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const usersSnap = await getDocs(collection(db, 'users'))
        const nameMap = {}
        usersSnap.forEach((d) => {
          const data = d.data()
          nameMap[d.id] = data.name || data.email || d.id
        })

        // collectionGroup requires a Firestore composite index on feedback(createdAt desc)
        const fbQuery = query(collectionGroup(db, 'feedback'), orderBy('createdAt', 'desc'))
        const fbSnap = await getDocs(fbQuery)

        const results = fbSnap.docs.map((d) => {
          const data = d.data()
          // path: users/{uid}/jobs/{jobId}/feedback/{feedbackId}
          const uid = d.ref.path.split('/')[1]
          return {
            id: d.id,
            createdAt: data.createdAt?.toDate?.() ?? null,
            konsult: nameMap[uid] ?? uid,
            jobTitle: data.jobTitle || '—',
            company: data.company || '',
            questionCount: Array.isArray(data.questionFeedback) ? data.questionFeedback.length : 0,
            overallScore: data.overallScore ?? null,
          }
        })

        setRows(results)
      } catch (err) {
        console.error('DriftPage:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Driftöversikt</h1>
        <p className="mt-1 text-sm" style={{ color: '#6b7280' }}>
          Alla genomförda intervjusessioner, senaste överst.
        </p>
      </div>

      {loading && (
        <p className="text-sm" style={{ color: '#6b7280' }}>
          Laddar sessioner…
        </p>
      )}

      {error && (
        <div
          className="rounded-xl border px-5 py-4 text-sm"
          style={{ backgroundColor: '#1d1d1d', borderColor: '#5b1a1a', color: '#f87171' }}
        >
          <p className="font-semibold mb-1">Kunde inte hämta data</p>
          <p style={{ color: '#9ca3af' }}>{error}</p>
          {error.includes('index') && (
            <p className="mt-2" style={{ color: '#6b7280' }}>
              Skapa ett Firestore-index för <code>feedback</code> på fältet <code>createdAt</code> (descending).
              Länken till indexet finns i konsolen ovan.
            </p>
          )}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="text-sm" style={{ color: '#6b7280' }}>
          Inga sessioner hittades.
        </p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div
          className="rounded-xl border overflow-hidden"
          style={{ borderColor: '#404040' }}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: '#323232', backgroundColor: '#141414' }}>
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8064ad' }}>
              Sessioner
            </span>
            <span className="text-xs" style={{ color: '#6b7280' }}>
              {rows.length} totalt
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#1a1a1a', borderBottom: '1px solid #323232' }}>
                  <Th>Datum & tid</Th>
                  <Th>Konsult</Th>
                  <Th>Uppdrag</Th>
                  <Th center>Frågor</Th>
                  <Th center>Poäng</Th>
                  <Th center>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.id}
                    style={{
                      backgroundColor: i % 2 === 0 ? '#1d1d1d' : '#191919',
                      borderBottom: '1px solid #2a2a2a',
                    }}
                  >
                    <Td>
                      {row.createdAt
                        ? row.createdAt.toLocaleString('sv-SE', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </Td>
                    <Td>{row.konsult}</Td>
                    <Td>
                      <span className="text-white">{row.jobTitle}</span>
                      {row.company && (
                        <span style={{ color: '#6b7280' }}> · {row.company}</span>
                      )}
                    </Td>
                    <Td center>{row.questionCount}</Td>
                    <Td center>
                      {row.overallScore != null ? (
                        <span
                          className="font-semibold"
                          style={{ color: scoreColor(row.overallScore) }}
                        >
                          {row.overallScore}/10
                        </span>
                      ) : (
                        <span style={{ color: '#404040' }}>—</span>
                      )}
                    </Td>
                    <Td center>
                      <span
                        className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                        style={{ backgroundColor: '#14401a', color: '#4ade80' }}
                      >
                        Slutförd
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Th({ children, center }) {
  return (
    <th
      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider${center ? ' text-center' : ' text-left'}`}
      style={{ color: '#6b7280' }}
    >
      {children}
    </th>
  )
}

function Td({ children, center }) {
  return (
    <td
      className={`px-4 py-3${center ? ' text-center' : ''}`}
      style={{ color: '#9ca3af' }}
    >
      {children}
    </td>
  )
}

function scoreColor(score) {
  if (score >= 8) return '#4ade80'
  if (score >= 5) return '#E9C46A'
  return '#f87171'
}
