import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { recategorizeCompetencies } from '../lib/claude'
import FileUpload from '../components/FileUpload'
import CompetencyList from '../components/CompetencyList'

export default function CompetencyBank() {
  const [summary, setSummary] = useState(null) // { count, lastUpload }
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [recategorizing, setRecategorizing] = useState(false)
  const [recategorizeMsg, setRecategorizeMsg] = useState('')

  async function handleRecategorize() {
    setRecategorizing(true)
    setRecategorizeMsg('')
    try {
      const uid = auth.currentUser.uid
      const snap = await getDocs(query(collection(db, 'users', uid, 'competencies')))
      const existing = snap.docs.map((d) => ({ docId: d.id, ...d.data() }))
      if (existing.length === 0) return

      const recategorized = await recategorizeCompetencies(existing)

      let updated = 0
      for (const item of existing) {
        const match = recategorized.find(
          (r) => r.title?.toLowerCase() === (item.title || '').toLowerCase()
        )
        if (match) {
          await updateDoc(doc(db, 'users', uid, 'competencies', item.docId), {
            category: match.category,
            tags: match.tags,
          })
          updated++
        }
      }
      setRecategorizeMsg(`✓ ${updated} kompetens${updated === 1 ? '' : 'er'} uppdaterade`)
    } catch (err) {
      console.error('Kategorisering misslyckades:', err)
      setRecategorizeMsg('Något gick fel. Försök igen.')
    } finally {
      setRecategorizing(false)
    }
  }

  async function handleClearAll() {
    setClearing(true)
    try {
      const uid = auth.currentUser.uid
      const snap = await getDocs(query(collection(db, 'users', uid, 'competencies')))
      for (const d of snap.docs) {
        await deleteDoc(doc(db, 'users', uid, 'competencies', d.id))
      }
      setSummary(null)
      setConfirmClear(false)
    } catch (err) {
      console.error('Kunde inte tömma kompetensbanken:', err)
    } finally {
      setClearing(false)
    }
  }

  useEffect(() => {
    const uid = auth.currentUser.uid
    getDocs(
      query(collection(db, 'users', uid, 'competencies'), orderBy('createdAt', 'desc'))
    ).then((snap) => {
      const count = snap.docs.length
      const lastDoc = snap.docs[0]?.data()
      const lastUpload = lastDoc?.createdAt?.toDate?.() ?? null
      setSummary({ count, lastUpload })
    })
  }, [])

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Kompetensbank
        </h1>
        <p className="mt-1 text-sm leading-relaxed" style={{ color: '#6b7280' }}>
          Din kompetensbank byggs upp av CV:n du laddar upp över tid. Ladda upp
          nya CV:n inför olika uppdrag för att berika din profil.
        </p>
      </div>

      {/* Summary row */}
      {summary && summary.count > 0 && (
        <div
          className="flex items-center gap-6 rounded-xl border px-5 py-3 text-sm"
          style={{ backgroundColor: '#1d1d1d', borderColor: '#404040' }}
        >
          <span style={{ color: '#9ca3af' }}>
            <span className="text-white font-semibold">{summary.count}</span>{' '}
            kompetens{summary.count === 1 ? '' : 'er'} totalt
          </span>
          {summary.lastUpload && (
            <span style={{ color: '#6b7280' }}>
              Senaste uppladdning:{' '}
              {summary.lastUpload.toLocaleDateString('sv-SE', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          )}
        </div>
      )}

      {/* Upload – always visible */}
      <section>
        <SectionLabel>Ladda upp nytt CV</SectionLabel>
        <FileUpload />
      </section>

      {/* Divider */}
      <div style={{ borderTop: '1px solid #404040' }} />

      {/* Competency list */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8064ad' }}>
            Dina kompetenser
          </p>
          {summary && summary.count > 0 && (
            confirmClear ? (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: '#9ca3af' }}>
                  Är du säker? Alla {summary.count} kompetenser raderas permanent.
                </span>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="px-2.5 py-1 rounded text-xs font-medium transition-colors"
                  style={{ backgroundColor: '#404040', color: '#9ca3af' }}
                >
                  Avbryt
                </button>
                <button
                  onClick={handleClearAll}
                  disabled={clearing}
                  className="px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-60"
                  style={{ backgroundColor: '#5b1a1a', color: '#f87171' }}
                >
                  {clearing ? 'Raderar...' : 'Ja, töm'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {recategorizeMsg && (
                  <span className="text-xs" style={{ color: recategorizeMsg.startsWith('✓') ? '#4ade80' : '#f87171' }}>
                    {recategorizeMsg}
                  </span>
                )}
                <button
                  onClick={handleRecategorize}
                  disabled={recategorizing}
                  className="text-xs font-medium transition-colors disabled:opacity-50"
                  style={{ color: '#6b7280' }}
                  onMouseOver={(e) => !recategorizing && (e.currentTarget.style.color = '#8064ad')}
                  onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
                >
                  {recategorizing ? <Spinner /> : '🔄 Kategorisera om'}
                </button>
                <button
                  onClick={() => { setConfirmClear(true); setRecategorizeMsg('') }}
                  className="text-xs font-medium transition-colors"
                  style={{ color: '#6b7280' }}
                  onMouseOver={(e) => (e.currentTarget.style.color = '#f87171')}
                  onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
                >
                  🗑 Töm kompetensbank
                </button>
              </div>
            )
          )}
        </div>
        <CompetencyList />
      </section>
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <p
      className="text-xs font-semibold uppercase tracking-widest mb-4"
      style={{ color: '#8064ad' }}
    >
      {children}
    </p>
  )
}

function Spinner() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
        <path d="M12 2a10 10 0 0 1 10 10" />
      </svg>
      Kategoriserar om...
    </span>
  )
}
