import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection,
  db,
  doc,
  getDocs,
  setDoc,
  serverTimestamp,
  query,
  where,
} from '../lib/firebase'

export default function SäljarePage() {
  const navigate = useNavigate()
  const [konsulter, setKonsulter] = useState([])
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  async function load() {
    const [usersSnap, pendingSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('role', '==', 'konsult'))),
      getDocs(collection(db, 'pendingProfiles')),
    ])

    const withCounts = await Promise.all(
      usersSnap.docs.map(async (d) => {
        const u = { uid: d.id, ...d.data() }
        const [compSnap, jobsSnap] = await Promise.all([
          getDocs(collection(db, 'users', u.uid, 'competencies')),
          getDocs(collection(db, 'users', u.uid, 'jobs')),
        ])
        return { ...u, competencyCount: compSnap.size, jobCount: jobsSnap.size }
      })
    )

    setKonsulter(withCounts)
    setPending(pendingSnap.docs.map((d) => ({ email: d.id, ...d.data() })))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white tracking-tight">Konsulter</h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors"
          style={{ backgroundColor: '#4A6FA5' }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#5a82bc')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#4A6FA5')}
        >
          + Förbered ny konsult
        </button>
      </div>

      {loading ? (
        <p className="text-sm py-8" style={{ color: '#6b7280' }}>Laddar konsulter...</p>
      ) : (
        <>
          {/* Active consultants */}
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#4A6FA5' }}>
              Aktiva konsulter ({konsulter.length})
            </h2>
            {konsulter.length === 0 ? (
              <p className="text-sm" style={{ color: '#6b7280' }}>Inga aktiva konsulter än.</p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {konsulter.map((k) => (
                  <KonsultCard
                    key={k.uid}
                    name={k.name}
                    email={k.email}
                    competencyCount={k.competencyCount}
                    jobCount={k.jobCount}
                    onClick={() => navigate(`/konsulter/${k.uid}`)}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* Pending profiles */}
          {pending.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6b7280' }}>
                Förberedda profiler – inväntar inloggning ({pending.length})
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2">
                {pending.map((p) => (
                  <KonsultCard
                    key={p.email}
                    name={p.name}
                    email={p.email}
                    competencyCount={(p.competencies ?? []).length}
                    jobCount={(p.jobs ?? []).length}
                    pending
                    onClick={() => navigate(`/konsulter/pending/${encodeURIComponent(p.email)}`)}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {showModal && (
        <NewKonsultModal
          onClose={() => setShowModal(false)}
          onCreated={(email) => {
            setShowModal(false)
            navigate(`/konsulter/pending/${encodeURIComponent(email)}`)
          }}
        />
      )}
    </div>
  )
}

// ── Cards ─────────────────────────────────────────────────────────────────

function KonsultCard({ name, email, competencyCount, jobCount, pending, onClick }) {
  const initials = (name ?? email ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <li>
      <button
        onClick={onClick}
        className="w-full text-left rounded-xl border p-5 space-y-4 transition-colors"
        style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
        onMouseOver={(e) => (e.currentTarget.style.borderColor = '#4A6FA5')}
        onMouseOut={(e) => (e.currentTarget.style.borderColor = '#2a2d3a')}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
            style={{ backgroundColor: pending ? '#4d3e1a' : '#4A6FA5' }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-white font-semibold truncate">{name ?? '–'}</p>
              {pending && (
                <span className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: '#4d3e1a', color: '#f0d48a' }}>
                  Väntande
                </span>
              )}
            </div>
            <p className="text-xs truncate" style={{ color: '#6b7280' }}>{email ?? '–'}</p>
          </div>
        </div>

        <div className="flex gap-6">
          <Stat label="Kompetenser" value={competencyCount} />
          <Stat label="Uppdrag" value={jobCount} />
        </div>
      </button>
    </li>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-xs" style={{ color: '#6b7280' }}>{label}</p>
    </div>
  )
}

// ── New konsult modal ─────────────────────────────────────────────────────

function NewKonsultModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    const trimmedName = name.trim()
    const trimmedEmail = email.trim().toLowerCase()

    if (!trimmedName) { setError('Namn krävs.'); return }
    if (!trimmedEmail.endsWith('@boulder.se')) {
      setError('E-postadressen måste vara ett @boulder.se-konto.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await setDoc(doc(db, 'pendingProfiles', trimmedEmail), {
        name: trimmedName,
        email: trimmedEmail,
        createdAt: serverTimestamp(),
        competencies: [],
        jobs: [],
      })
      onCreated(trimmedEmail)
    } catch (err) {
      console.error(err)
      setError('Kunde inte skapa profilen. Försök igen.')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-sm rounded-2xl border p-6 space-y-5"
        style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">Förbered ny konsult</h2>
          <button onClick={onClose} className="text-sm transition-colors" style={{ color: '#6b7280' }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
          >✕</button>
        </div>

        <p className="text-sm" style={{ color: '#9ca3af' }}>
          Profilen blir aktiv när konsulten loggar in första gången.
        </p>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#4A6FA5' }}>
              Namn *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="T.ex. Anna Svensson"
              className="w-full rounded-lg border px-3 py-2 text-sm text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#4A6FA5]"
              style={{ backgroundColor: '#13151f', borderColor: '#2a2d3a' }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#4A6FA5' }}>
              E-post (@boulder.se) *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="anna.svensson@boulder.se"
              className="w-full rounded-lg border px-3 py-2 text-sm text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#4A6FA5]"
              style={{ backgroundColor: '#13151f', borderColor: '#2a2d3a' }}
            />
          </div>
        </div>

        {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{ backgroundColor: '#2a2d3a', color: '#9ca3af' }}
          >
            Avbryt
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60"
            style={{ backgroundColor: '#4A6FA5' }}
            onMouseOver={(e) => !saving && (e.currentTarget.style.backgroundColor = '#5a82bc')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#4A6FA5')}
          >
            {saving ? 'Skapar...' : 'Skapa profil'}
          </button>
        </div>
      </div>
    </div>
  )
}
