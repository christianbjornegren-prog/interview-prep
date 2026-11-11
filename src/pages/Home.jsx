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
import { coverageFromJob } from '../lib/gapAnalysis'
import { createUserCvStore } from '../lib/cvStore'
import { resolveJobCv } from '../lib/cvs'
import StartInterviewButton from '../components/StartInterviewButton'

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
    <div className="pt-16 px-4 max-w-2xl mx-auto space-y-10 max-sm:pt-6 max-sm:px-0 max-sm:space-y-8">
      <div className="space-y-4">
        <div
          className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border"
          style={{ borderColor: 'var(--color-accent-purple)', color: 'var(--color-accent-purple)', backgroundColor: 'var(--color-action-secondary-background-hover)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          AI-driven intervjuträning
        </div>
        <h1 className="text-4xl font-medium text-text-primary leading-tight tracking-tight max-sm:text-3xl">
          Träna inför rätt uppdrag,{' '}
          <span style={{ color: 'var(--color-accent-purple)' }}>med dina egna kompetenser</span>
        </h1>
        <p className="text-text-secondary text-lg leading-relaxed max-sm:text-base">
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
            style={{ backgroundColor: 'var(--color-background-primary)', borderColor: 'var(--color-border-default)' }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-tag-text"
              style={{ backgroundColor: 'var(--color-tag-purple-1)' }}
            >
              {i + 1}
            </div>
            <h3 className="text-text-primary font-medium text-sm">{step.title}</h3>
            <p className="text-text-secondary text-xs leading-relaxed">{step.desc}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={handleSignIn}
          disabled={loading}
          className="flex items-center gap-3 px-6 py-3 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-60 max-sm:w-full max-sm:justify-center"
          style={{ backgroundColor: 'var(--color-background-primary)', color: 'var(--color-text-primary)', borderColor: 'var(--color-border-strong)' }}
          onMouseOver={(e) => !loading && (e.currentTarget.style.backgroundColor = 'var(--color-action-ghost-background-hover)')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-background-primary)')}
        >
          <GoogleIcon />
          {loading ? 'Loggar in...' : 'Logga in med Google'}
        </button>
        {error && (
          <p className="text-xs" style={{ color: 'var(--color-feedback-error)' }}>
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
  // null = laddar. Listningen flyttar också eventuell äldre samlad
  // kompetensbank till CV:n första gången konsulten loggar in efter bytet.
  const [cvs, setCvs] = useState(null)
  const [jobFeedbacks, setJobFeedbacks] = useState({})
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [showJobPicker, setShowJobPicker] = useState(false)

  const firstName = user.displayName?.split(' ')[0] ?? 'där'

  useEffect(() => {
    const uid = auth.currentUser.uid
    const q = query(collection(db, 'users', uid, 'jobs'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setJobs(snap.docs.map((d) => ({ docId: d.id, ...d.data() })))
        setLoadingJobs(false)
      },
      (err) => {
        console.error('Kunde inte lyssna på uppdrag:', err)
        setLoadingJobs(false)
      }
    )
    return unsub
  }, [])

  useEffect(() => {
    const uid = auth.currentUser.uid
    createUserCvStore(uid)
      .list()
      .then(setCvs)
      .catch((err) => {
        console.error('Kunde inte hämta CV:n:', err)
        setCvs(null)
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
  // Checklist: har konsulten NÅGONSIN tränat (alla jobb, inkl. arkiverade)?
  const feedbackCount = Object.keys(jobFeedbacks).length
  // Tomtillstånd: gäller AKTIVA jobb – arkiverade jobbs feedback ska inte
  // dölja "redo att träna"-kortet för ett nytt otränat aktivt uppdrag.
  const activeFeedbackCount = activeJobs.filter((j) => jobFeedbacks[j.docId]).length
  const checklist = computeChecklist({ profileActivated, jobCount: jobs.length, feedbackCount })
  const showChecklist = profileActivated && !checklist.allDone

  const primaryCta = resolvePrimaryCta(sortedActive)
  const emptyStateRaw = resolveEmptyState({ jobCount: activeJobs.length, feedbackCount: activeFeedbackCount })
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
      {cvs !== null && cvs.length === 0 && (
        <div
          className="rounded-xl border px-5 py-4 flex items-center justify-between gap-4"
          style={{ backgroundColor: 'var(--color-feedback-warning-background)', borderColor: 'color-mix(in srgb, var(--color-feedback-warning) 30%, transparent)' }}
        >
          <p className="text-sm" style={{ color: 'var(--color-feedback-warning)' }}>
            Du har inga CV:n än – ladda upp ett CV och koppla det till dina uppdrag
          </p>
          <Link
            to="/kompetensbank"
            className="text-sm font-semibold shrink-0 transition-colors tap-target"
            style={{ color: 'var(--color-feedback-warning)' }}
            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'var(--color-feedback-warning)')}
          >
            Ladda upp →
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between max-sm:flex-wrap max-sm:gap-3">
        <h1 className="text-2xl font-medium text-text-primary tracking-tight">
          Hej {firstName} 👋
        </h1>
        <button
          onClick={() => navigate('/jobb/ny')}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors border max-sm:min-h-11"
          // Nedtonad till kontur. Den delade tidigare lila yta med den primära
          // åtgärden, och två lika starka knappar bredvid varandra betyder att
          // ingen av dem framhävs.
          style={{ backgroundColor: 'transparent', borderColor: 'var(--color-border-strong)', color: 'var(--color-text-secondary)' }}
          onMouseOver={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-action-secondary-border)'
            e.currentTarget.style.color = 'var(--color-action-secondary-text)'
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border-strong)'
            e.currentTarget.style.color = 'var(--color-text-secondary)'
          }}
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
        <p className="text-sm py-8" style={{ color: 'var(--color-text-secondary)' }}>
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
                cvs={cvs}
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
              cvs={cvs}
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
            className="flex items-center gap-2 text-sm font-medium transition-colors max-sm:min-h-11"
            style={{ color: 'var(--color-text-secondary)' }}
            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
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
                  cvs={cvs}
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
      style={{ backgroundColor: 'var(--color-feedback-success-background)', borderColor: 'color-mix(in srgb, var(--color-feedback-success) 35%, transparent)' }}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-semibold" style={{ color: 'var(--color-feedback-success)' }}>
          🎉 Din profil är redo – tre steg till din första träning
        </p>
        <button
          onClick={onDismiss}
          className="text-xs shrink-0 transition-colors tap-target max-sm:-my-3 max-sm:px-2"
          style={{ color: 'var(--color-feedback-success)' }}
          onMouseOver={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
          onMouseOut={(e) => (e.currentTarget.style.color = 'var(--color-feedback-success)')}
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
                color: item.done ? 'var(--color-feedback-success)' : 'var(--color-text-secondary)',
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
        style={{ width: 20, height: 20, backgroundColor: 'var(--color-feedback-success)' }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-white)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    )
  }
  return (
    <span
      className="rounded-md shrink-0"
      style={{ width: 20, height: 20, border: '2px solid var(--color-feedback-success)' }}
    />
  )
}

// ── Primary CTA + empty-state guiding cards ───────────────────────────────

function StartTrainingButton({ onClick }) {
  return <StartInterviewButton onClick={onClick} />
}

function NoJobsCard({ onAdd }) {
  return (
    <div
      className="rounded-xl border-2 border-dashed p-12 text-center space-y-4 max-sm:p-6"
      style={{ borderColor: 'var(--color-border-strong)' }}
    >
      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        Lägg till ditt första uppdrag för att komma igång
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 px-5 py-3 rounded-lg text-action-primary-text text-sm font-semibold transition-colors max-sm:w-full max-sm:justify-center"
        style={{ backgroundColor: 'var(--color-action-primary-background)' }}
        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-action-primary-background-hover)')}
        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-action-primary-background)')}
      >
        Lägg till uppdrag
      </button>
    </div>
  )
}

function ReadyToTrainCard({ onStart }) {
  return (
    <div
      className="rounded-xl border p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-sm:p-5"
      style={{ backgroundColor: 'var(--color-action-secondary-background-hover)', borderColor: 'var(--color-accent-purple)' }}
    >
      <div>
        <h2 className="text-text-primary font-medium text-base">Du är redo – starta din första träning</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          Dina uppdrag är på plats. Kör en AI-intervju för att se hur du står dig.
        </p>
      </div>
      <StartInterviewButton onClick={onStart} />
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
        className="w-full max-w-md rounded-2xl border p-6 space-y-4 max-sm:p-5 max-sm:max-h-[calc(100dvh-2rem)] max-sm:overflow-y-auto"
        style={{ backgroundColor: 'var(--color-background-primary)', borderColor: 'var(--color-border-default)' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-text-primary font-medium text-lg">Välj uppdrag att träna på</h2>
          <button
            onClick={onClose}
            className="text-sm transition-colors tap-target max-sm:-my-3 max-sm:px-2 max-sm:-mx-2"
            style={{ color: 'var(--color-text-secondary)' }}
            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
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
                style={{ backgroundColor: 'var(--color-background-tertiary)', borderColor: 'var(--color-border-default)' }}
                onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--color-link-text)')}
                onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
              >
                <p className="text-sm text-text-primary font-medium">
                  {job.jobTitle || 'Namnlös jobbannons'}
                </p>
                {job.company && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{job.company}</p>
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

function JobCard({ job, feedback, cvs, onClick, dimmed }) {
  // cvs === null medan CV:n laddas – visa då varken matchning eller CV-status.
  const cvStatus = cvs ? resolveJobCv(job, cvs).status : null
  const { covered, total } = coverageFromJob(job)
  // Matchningen gäller ett specifikt CV; utan kopplat CV finns ingen.
  const scoreRatio = cvStatus === 'linked' && total > 0 ? covered / total : null
  const matchColor =
    scoreRatio === null
      ? 'var(--color-text-secondary)'
      : scoreRatio >= 0.7
      ? 'var(--color-feedback-success)'
      : scoreRatio >= 0.4
      ? 'var(--color-feedback-warning)'
      : 'var(--color-feedback-error)'

  // feedback.date can be undefined while a serverTimestamp is still resolving
  // → guard against "Invalid Date" / "Betyg undefined/10".
  const trainingDate =
    feedback?.date instanceof Date && !isNaN(feedback.date) ? feedback.date : null
  const lastTraining = feedback
    ? 'Senaste träning' +
      (trainingDate
        ? `: ${trainingDate.toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' })}`
        : ' genomförd') +
      (feedback.score != null ? ` · Betyg ${feedback.score}/10` : '')
    : null

  return (
    <li>
      <button
        onClick={onClick}
        className="w-full text-left rounded-xl border p-4 space-y-2 transition-colors"
        style={{
          backgroundColor: 'var(--color-background-primary)',
          borderColor: 'var(--color-border-default)',
          opacity: dimmed ? 0.6 : 1,
        }}
        onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--color-link-text)')}
        onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
      >
        {/* Row 1: title + company */}
        <div>
          <h3 className="text-text-primary font-medium text-base leading-snug line-clamp-2">
            {job.jobTitle || 'Namnlös jobbannons'}
          </h3>
          {job.company && (
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
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
                backgroundColor: `color-mix(in srgb, ${matchColor} 10%, transparent)`,
                color: matchColor,
                border: `1px solid color-mix(in srgb, ${matchColor} 30%, transparent)`,
              }}
            >
              Matchning: {covered} av {total} krav
            </span>
          </div>
        )}

        {cvStatus && cvStatus !== 'linked' && (
          <div>
            <span
              className="text-xs font-medium px-2 py-1 rounded-full"
              style={{ backgroundColor: 'var(--color-action-secondary-background-hover)', color: 'var(--color-accent-purple)', border: '1px solid var(--color-action-secondary-background-pressed)' }}
            >
              {cvStatus === 'missing' ? 'Välj ett nytt CV' : 'Koppla CV för att träna'}
            </span>
          </div>
        )}

        {/* Row 3: last training */}
        <p className="text-xs" style={{ color: lastTraining ? 'var(--color-text-secondary)' : 'var(--color-text-secondary)' }}>
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
