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
import { filterAwaitingLogin } from '../lib/pendingMigration'
import { countUserCvs } from '../lib/cvStore'
import { convertLegacyPendingCompetencies } from '../lib/cvs'

export default function SäljarePage() {
  const navigate = useNavigate()
  const [konsulter, setKonsulter] = useState([])
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showModal, setShowModal] = useState(false)

  async function load() {
    setLoadError('')
    try {
      const [usersSnap, pendingSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('role', '==', 'konsult'))),
        getDocs(collection(db, 'pendingProfiles')),
      ])

      const withCounts = await Promise.all(
        usersSnap.docs.map(async (d) => {
          const u = { uid: d.id, ...d.data() }
          // One consultant's counts failing must not sink the whole list –
          // and one COUNT failing must not hide the other (allSettled).
          const [cvRes, jobsRes] = await Promise.allSettled([
            countUserCvs(u.uid),
            getDocs(collection(db, 'users', u.uid, 'jobs')),
          ])
          if (cvRes.status === 'rejected') console.error('Kunde inte räkna CV:n:', cvRes.reason)
          return {
            ...u,
            cvCount: cvRes.status === 'fulfilled' ? cvRes.value : null,
            jobCount: jobsRes.status === 'fulfilled' ? jobsRes.value.size : null,
          }
        })
      )

      const allPending = pendingSnap.docs.map((d) => ({ email: d.id, ...d.data() }))

      setKonsulter(withCounts)
      // Någon som redan har konto "inväntar inte inloggning". Utan den här
      // filtreringen kan samma person synas som BÅDE aktiv konsult och
      // väntande profil – ett tillstånd som inte ska kunna uppstå.
      setPending(filterAwaitingLogin(allPending, withCounts))
    } catch (err) {
      console.error('Kunde inte ladda konsulter:', err)
      setLoadError(err.message ?? 'Kunde inte ladda konsulter.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium text-text-primary tracking-tight">Konsulter</h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-lg text-action-primary-text text-sm font-semibold transition-colors"
          style={{ backgroundColor: 'var(--color-action-primary-background)' }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-action-primary-background-hover)')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-action-primary-background)')}
        >
          + Förbered ny konsult
        </button>
      </div>

      {loading ? (
        <p className="text-sm py-8" style={{ color: 'var(--color-text-secondary)' }}>Laddar konsulter...</p>
      ) : loadError ? (
        <p className="text-sm py-8" style={{ color: 'var(--color-feedback-error)' }}>Kunde inte ladda konsulter: {loadError}</p>
      ) : (
        <>
          {/* Active consultants */}
          <section className="space-y-3">
            <h2 className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--color-accent-purple)' }}>
              Aktiva konsulter ({konsulter.length})
            </h2>
            {konsulter.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Inga aktiva konsulter än.</p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {konsulter.map((k) => (
                  <KonsultCard
                    key={k.uid}
                    name={k.name}
                    email={k.email}
                    cvCount={k.cvCount}
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
              <h2 className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>
                Förberedda profiler – inväntar inloggning ({pending.length})
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2">
                {pending.map((p) => (
                  <KonsultCard
                    key={p.email}
                    name={p.name}
                    email={p.email}
                    cvCount={convertLegacyPendingCompetencies(p).cvs.length}
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

function KonsultCard({ name, email, cvCount, jobCount, pending, onClick }) {
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
        style={{ backgroundColor: 'var(--color-background-primary)', borderColor: 'var(--color-border-default)' }}
        onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--color-link-text)')}
        onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-tag-text shrink-0"
            style={{ backgroundColor: pending ? 'var(--color-tag-orange-1)' : 'var(--color-tag-purple-1)' }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-text-primary font-semibold truncate">{name ?? '–'}</p>
              {pending && (
                <span className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: 'var(--color-feedback-warning-background)', color: 'var(--color-feedback-warning)' }}>
                  Väntande
                </span>
              )}
            </div>
            <p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>{email ?? '–'}</p>
          </div>
        </div>

        <div className="flex gap-6">
          <Stat label="CV" value={cvCount} />
          <Stat label="Uppdrag" value={jobCount} />
        </div>
      </button>
    </li>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-xl font-bold text-text-primary">{value == null ? '–' : value}</p>
      <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{label}</p>
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
        cvs: [],
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
        style={{ backgroundColor: 'var(--color-background-primary)', borderColor: 'var(--color-border-default)' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-text-primary font-medium text-lg">Förbered ny konsult</h2>
          <button onClick={onClose} className="text-sm transition-colors" style={{ color: 'var(--color-text-secondary)' }}
            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
          >✕</button>
        </div>

        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Profilen blir aktiv när konsulten loggar in första gången.
        </p>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-accent-purple)' }}>
              Namn *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="T.ex. Anna Svensson"
              className="w-full rounded-lg border px-3 py-2 text-sm text-input-text placeholder:text-input-placeholder focus:outline-none focus:border-focus-ring"
              style={{ backgroundColor: 'var(--color-input-background)', borderColor: 'var(--color-input-border)' }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-accent-purple)' }}>
              E-post (@boulder.se) *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="anna.svensson@boulder.se"
              className="w-full rounded-lg border px-3 py-2 text-sm text-input-text placeholder:text-input-placeholder focus:outline-none focus:border-focus-ring"
              style={{ backgroundColor: 'var(--color-input-background)', borderColor: 'var(--color-input-border)' }}
            />
          </div>
        </div>

        {error && <p className="text-xs" style={{ color: 'var(--color-feedback-error)' }}>{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{ backgroundColor: 'var(--color-background-tertiary)', color: 'var(--color-text-secondary)' }}
          >
            Avbryt
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-action-primary-text transition-colors disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-action-primary-background)' }}
            onMouseOver={(e) => !saving && (e.currentTarget.style.backgroundColor = 'var(--color-action-primary-background-hover)')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-action-primary-background)')}
          >
            {saving ? 'Skapar...' : 'Skapa profil'}
          </button>
        </div>
      </div>
    </div>
  )
}
