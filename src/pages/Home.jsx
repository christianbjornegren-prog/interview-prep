import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore'
import { useAuth, useUser, signInWithGoogle } from '../components/AuthGate'
import { db, auth } from '../lib/firebase'
import { computeChecklist, resolvePrimaryCta, resolveEmptyState } from '../lib/onboarding'

export default function Home() {
  const user = useAuth()
  if (!user) return <Onboarding />
  return <Dashboard user={user} />
}

// ── Onboarding (not logged in) ────────────────────────────────────────────

const STEPS = [
  {
    title: 'Ladda upp ditt CV',
    desc: 'AI:n extraherar dina kompetenser automatiskt från PDF eller DOCX.',
  },
  {
    title: 'Lägg till en jobbannons',
    desc: 'Klistra in en jobbannons och få matchningsanalys mot din profil.',
  },
  {
    title: 'Träna med AI-intervjuare',
    desc: 'Genomför AI-drivna intervjuer skräddarsydda efter uppdraget.',
  },
]

function Onboarding() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSignIn() {
    setLoading(true)
    setError('')
    try {
      await signInWithGoogle()
    } catch (err) {
      if (err.message === 'ACCESS_DENIED') {
        setError('Åtkomst nekad. Endast Boulder-konton (@boulder.se) är tillåtna att logga in.')
      } else {
        setError('Inloggning misslyckades. Försök igen.')
      }
      setLoading(false)
    }
  }

  return (
    <div className="pt-16 px-4 max-w-2xl mx-auto space-y-10">
      <div className="space-y-4">
        <div
          className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border"
          style={{ borderColor: '#8064ad', color: '#b19ae0', backgroundColor: '#1a1229' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          AI-driven intervjuträning
        </div>
        <h1 className="text-4xl font-bold text-white leading-tight tracking-tight">
          Träna inför rätt uppdrag,{' '}
          <span style={{ color: '#8064ad' }}>med dina egna kompetenser</span>
        </h1>
        <p className="text-gray-400 text-lg leading-relaxed">
          Ladda upp ditt CV, lägg till jobbannonser och träna med en AI-intervjuare
          anpassad efter just din profil.
        </p>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
        {STEPS.map((step, i) => (
          <div
            key={i}
            className="rounded-xl border p-5 text-left space-y-3"
            style={{ backgroundColor: '#1d1d1d', borderColor: '#404040' }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: '#8064ad' }}
            >
              {i + 1}
            </div>
            <h3 className="text-white font-semibold text-sm">{step.title}</h3>
            <p className="text-gray-500 text-xs leading-relaxed">{step.desc}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={handleSignIn}
          disabled={loading}
          className="flex items-center gap-3 px-6 py-3 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-60"
          style={{ backgroundColor: '#fff', color: '#111', borderColor: '#e5e7eb' }}
          onMouseOver={(e) => !loading && (e.currentTarget.style.backgroundColor = '#f3f4f6')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#fff')}
        >
          <GoogleIcon />
          {loading ? 'Loggar in...' : 'Logga in med Google'}
        </button>
        {error && (
          <p className="text-xs" style={{ color: '#f87171' }}>
            {error}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Dashboard (logged in) ─────────────────────────────────────────────────

function Dashboard({ user }) {
  const navigate = useNavigate()
  const { profileActivated, clearProfileActivated } = useUser()
  const [jobs, setJobs] = useState([])
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [competencyCount, setCompetencyCount] = useState(null)
  const [jobFeedbacks, setJobFeedbacks] = useState({})
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [showJobPicker, setShowJobPicker] = useState(false)

  const firstName = user.displayName?.split(' ')[0] ?? 'där'

  useEffect(() => {
    const uid = auth.currentUser.uid
    const q = query(collection(db, 'users', uid, 'jobs'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setJobs(snap.docs.map((d) => ({ docId: d.id, ...d.data() })))
      setLoadingJobs(false)
    })
    return unsub
  }, [])

  useEffect(() => {
    const uid = auth.currentUser.uid
    getDocs(collection(db, 'users', uid, 'competencies')).then((snap) => {
      setCompetencyCount(snap.docs.length)
    })
  }, [])

  useEffect(() => {
    if (jobs.length === 0) {
      setJobFeedbacks({})
      setLoadingFeedbacks(false)
      return
    }
    const uid = auth.currentUser.uid
    async function fetchFeedbacks() {
      const results = {}
      await Promise.all(
        jobs.map(async (job) => {
          try {
            const snap = await getDocs(
              query(
                collection(db, 'users', uid, 'jobs', job.docId, 'feedback'),
                orderBy('createdAt', 'desc'),
                limit(1)
              )
            )
            if (!snap.empty) {
              const fb = snap.docs[0].data()
              results[job.docId] = {
                date: fb.createdAt?.toDate?.(),
                score: fb.overallScore,
              }
            }
          } catch {}
        })
      )
      setJobFeedbacks(results)
      setLoadingFeedbacks(false)
    }
    fetchFeedbacks()
  }, [jobs])

  const activeJobs = jobs.filter((j) => !j.archived)
  const archivedJobs = jobs.filter((j) => j.archived)

  const sortedActive = [...activeJobs].sort((a, b) => {
    const aDate =
      jobFeedbacks[a.docId]?.date ??
      (a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0))
    const bDate =
      jobFeedbacks[b.docId]?.date ??
      (b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0))
    return bDate - aDate
  })

  // ── Onboarding-härledningar ─────────────────────────────────────────────
  const feedbackCount = Object.keys(jobFeedbacks).length
  const checklist = computeChecklist({ profileActivated, jobCount: jobs.length, feedbackCount })
  const showChecklist = profileActivated && !checklist.allDone

  const primaryCta = resolvePrimaryCta(sortedActive)
  const emptyStateRaw = resolveEmptyState({ jobCount: activeJobs.length, feedbackCount })
  // Undvik att 'no-training'-kortet blinkar förbi innan feedback hunnit laddas.
  const emptyState =
    emptyStateRaw === 'no-training' && loadingFeedbacks ? 'normal' : emptyStateRaw

  function handleStartTraining() {
    if (primaryCta.mode === 'single') navigate(`/jobb/${primaryCta.jobId}`)
    else if (primaryCta.mode === 'multi') setShowJobPicker(true)
  }

  return (
    <div className="space-y-6">
      {/* Onboarding-checklista (visas efter att profilen aktiverats) */}
      {showChecklist && (
        <OnboardingChecklist checklist={checklist} onDismiss={clearProfileActivated} />
      )}

      {/* Competency warning banner */}
      {competencyCount === 0 && (
        <div
          className="rounded-xl border px-5 py-4 flex items-center justify-between gap-4"
          style={{ backgroundColor: '#2b2414', borderColor: '#4d3e1a' }}
        >
          <p className="text-sm" style={{ color: '#f0d48a' }}>
            Din kompetensbank är tom – ladda upp ett CV för bättre matchning
          </p>
          <Link
            to="/kompetensbank"
            className="text-sm font-semibold shrink-0 transition-colors"
            style={{ color: '#E9C46A' }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#E9C46A')}
          >
            Ladda upp →
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Hej {firstName} 👋
        </h1>
        <button
          onClick={() => navigate('/jobb/ny')}
          className="px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors"
          style={{ backgroundColor: '#8064ad' }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#9781be')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#8064ad')}
        >
          + Lägg till nytt uppdrag
        </button>
      </div>

      {/* Primär CTA – Starta intervjuträning (normalläge: uppdrag + tidigare träning) */}
      {!loadingJobs && emptyState === 'normal' && primaryCta.mode !== 'hidden' && (
        <StartTrainingButton onClick={handleStartTraining} />
      )}

      {/* Uppdrag + vägledande tomma states */}
      {loadingJobs ? (
        <p className="text-sm py-8" style={{ color: '#6b7280' }}>
          Laddar dina uppdrag...
        </p>
      ) : emptyState === 'no-jobs' ? (
        <NoJobsCard onAdd={() => navigate('/jobb/ny')} />
      ) : emptyState === 'no-training' ? (
        <div className="space-y-6">
          <ReadyToTrainCard onStart={handleStartTraining} />
          <ul className="grid gap-3 sm:grid-cols-2">
            {sortedActive.map((job) => (
              <JobCard
                key={job.docId}
                job={job}
                feedback={jobFeedbacks[job.docId]}
                onClick={() => navigate(`/jobb/${job.docId}`)}
              />
            ))}
          </ul>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {sortedActive.map((job) => (
            <JobCard
              key={job.docId}
              job={job}
              feedback={jobFeedbacks[job.docId]}
              onClick={() => navigate(`/jobb/${job.docId}`)}
            />
          ))}
        </ul>
      )}

      {/* Archived jobs */}
      {archivedJobs.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium transition-colors"
            style={{ color: '#6b7280' }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#9ca3af')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
          >
            <ChevronIcon expanded={showArchived} />
            Arkiverade uppdrag ({archivedJobs.length})
          </button>
          {showArchived && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {archivedJobs.map((job) => (
                <JobCard
                  key={job.docId}
                  job={job}
                  feedback={jobFeedbacks[job.docId]}
                  onClick={() => navigate(`/jobb/${job.docId}`)}
                  dimmed
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Uppdragsväljare (flera uppdrag → välj vilket att träna på) */}
      {showJobPicker && (
        <JobPickerModal
          jobs={sortedActive}
          onPick={(jobId) => {
            setShowJobPicker(false)
            navigate(`/jobb/${jobId}`)
          }}
          onClose={() => setShowJobPicker(false)}
        />
      )}
    </div>
  )
}

// ── Onboarding checklist ──────────────────────────────────────────────────

function OnboardingChecklist({ checklist, onDismiss }) {
  const items = [
    { done: checklist.cvUploaded, label: 'CV uppladdat' },
    { done: checklist.jobAdded, label: 'Uppdrag tillagt' },
    { done: checklist.firstTraining, label: 'Första träning' },
  ]
  return (
    <div
      className="rounded-xl border px-5 py-4"
      style={{ backgroundColor: '#052e16', borderColor: '#166534' }}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-semibold" style={{ color: '#86efac' }}>
          🎉 Din profil är redo – tre steg till din första träning
        </p>
        <button
          onClick={onDismiss}
          className="text-xs shrink-0 transition-colors"
          style={{ color: '#4ade80' }}
          onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
          onMouseOut={(e) => (e.currentTarget.style.color = '#4ade80')}
          aria-label="Stäng checklista"
        >
          ✕
        </button>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-3">
            <ChecklistBox done={item.done} />
            <span
              className="text-sm"
              style={{
                color: item.done ? '#86efac' : '#9ca3af',
                textDecoration: item.done ? 'line-through' : 'none',
              }}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ChecklistBox({ done }) {
  if (done) {
    return (
      <span
        className="flex items-center justify-center rounded-md shrink-0"
        style={{ width: 20, height: 20, backgroundColor: '#16a34a' }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    )
  }
  return (
    <span
      className="rounded-md shrink-0"
      style={{ width: 20, height: 20, border: '2px solid #4d7c5a' }}
    />
  )
}

// ── Primary CTA + empty-state guiding cards ───────────────────────────────

function StartTrainingButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-5 py-3 rounded-lg text-white text-sm font-semibold transition-colors"
      style={{ backgroundColor: '#8064ad' }}
      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#9781be')}
      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#8064ad')}
    >
      🎙 Starta intervjuträning
    </button>
  )
}

function NoJobsCard({ onAdd }) {
  return (
    <div
      className="rounded-xl border-2 border-dashed p-12 text-center space-y-4"
      style={{ borderColor: '#404040' }}
    >
      <p className="text-sm" style={{ color: '#9ca3af' }}>
        Lägg till ditt första uppdrag för att komma igång
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 px-5 py-3 rounded-lg text-white text-sm font-semibold transition-colors"
        style={{ backgroundColor: '#8064ad' }}
        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#9781be')}
        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#8064ad')}
      >
        Lägg till uppdrag →
      </button>
    </div>
  )
}

function ReadyToTrainCard({ onStart }) {
  return (
    <div
      className="rounded-xl border p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      style={{ backgroundColor: '#1a1229', borderColor: '#8064ad' }}
    >
      <div>
        <h2 className="text-white font-semibold text-base">Du är redo – starta din första träning</h2>
        <p className="text-sm mt-1" style={{ color: '#9ca3af' }}>
          Dina uppdrag är på plats. Kör en AI-intervju för att se hur du står dig.
        </p>
      </div>
      <button
        onClick={onStart}
        className="shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-lg text-white text-sm font-semibold transition-colors"
        style={{ backgroundColor: '#8064ad' }}
        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#9781be')}
        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#8064ad')}
      >
        Starta intervjuträning →
      </button>
    </div>
  )
}

// ── Job picker modal (flera uppdrag) ──────────────────────────────────────

function JobPickerModal({ jobs, onPick, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6 space-y-4"
        style={{ backgroundColor: '#1d1d1d', borderColor: '#404040' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">Välj uppdrag att träna på</h2>
          <button
            onClick={onClose}
            className="text-sm transition-colors"
            style={{ color: '#6b7280' }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
            aria-label="Stäng"
          >
            ✕
          </button>
        </div>
        <ul className="space-y-2 max-h-80 overflow-y-auto">
          {jobs.map((job) => (
            <li key={job.docId}>
              <button
                onClick={() => onPick(job.docId)}
                className="w-full text-left rounded-xl border p-4 transition-colors"
                style={{ backgroundColor: '#141414', borderColor: '#404040' }}
                onMouseOver={(e) => (e.currentTarget.style.borderColor = '#8064ad')}
                onMouseOut={(e) => (e.currentTarget.style.borderColor = '#404040')}
              >
                <p className="text-sm text-white font-medium">
                  {job.jobTitle || 'Namnlös jobbannons'}
                </p>
                {job.company && (
                  <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>{job.company}</p>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ── Job card ──────────────────────────────────────────────────────────────

function JobCard({ job, feedback, onClick, dimmed }) {
  const covered = job.gapAnalysis?.covered ?? []
  const gaps = job.gapAnalysis?.gaps ?? []
  const total = covered.length + gaps.length
  const scoreRatio = total > 0 ? covered.length / total : null
  const matchColor =
    scoreRatio === null
      ? '#6b7280'
      : scoreRatio >= 0.7
      ? '#22c55e'
      : scoreRatio >= 0.4
      ? '#E9C46A'
      : '#ef4444'

  const lastTraining = feedback
    ? `Senaste träning: ${new Date(feedback.date).toLocaleDateString('sv-SE', {
        month: 'short',
        day: 'numeric',
      })} · Betyg ${feedback.score}/10`
    : null

  return (
    <li>
      <button
        onClick={onClick}
        className="w-full text-left rounded-xl border p-4 space-y-2 transition-colors"
        style={{
          backgroundColor: '#1d1d1d',
          borderColor: '#404040',
          opacity: dimmed ? 0.6 : 1,
        }}
        onMouseOver={(e) => (e.currentTarget.style.borderColor = '#8064ad')}
        onMouseOut={(e) => (e.currentTarget.style.borderColor = '#404040')}
      >
        {/* Row 1: title + company */}
        <div>
          <h3 className="text-white font-semibold text-base leading-snug line-clamp-2">
            {job.jobTitle || 'Namnlös jobbannons'}
          </h3>
          {job.company && (
            <p className="text-sm mt-0.5" style={{ color: '#9ca3af' }}>
              {job.company}
            </p>
          )}
        </div>

        {/* Row 2: match badge */}
        {scoreRatio !== null && (
          <div>
            <span
              className="text-xs font-semibold px-2 py-1 rounded-full"
              style={{
                backgroundColor: matchColor + '20',
                color: matchColor,
                border: `1px solid ${matchColor}40`,
              }}
            >
              Matchning: {covered.length} av {total} krav
            </span>
          </div>
        )}

        {/* Row 3: last training */}
        <p className="text-xs" style={{ color: lastTraining ? '#9ca3af' : '#6b7280' }}>
          {lastTraining ?? 'Ingen träning ännu'}
        </p>
      </button>
    </li>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────

function ChevronIcon({ expanded }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transition: 'transform 0.2s',
        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  )
}
