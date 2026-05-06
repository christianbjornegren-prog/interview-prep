import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

export default function FeedbackPage() {
  const { jobId, feedbackId } = useParams()
  const navigate = useNavigate()
  const [feedback, setFeedback] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadFeedback() {
      try {
        const uid = auth.currentUser.uid
        const feedbackSnap = await getDoc(
          doc(db, 'users', uid, 'jobs', jobId, 'feedback', feedbackId)
        )

        if (cancelled) return

        if (!feedbackSnap.exists()) {
          setError('Feedback hittades inte.')
        } else {
          setFeedback({ id: feedbackSnap.id, ...feedbackSnap.data() })
        }
      } catch (err) {
        console.error('Kunde inte hämta feedback:', err)
        if (!cancelled) setError(err.message ?? 'Kunde inte hämta feedback.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadFeedback()
    return () => {
      cancelled = true
    }
  }, [jobId, feedbackId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex items-center gap-3" style={{ color: '#6b7280' }}>
          <Spinner />
          <span className="text-sm">Laddar feedback...</span>
        </div>
      </div>
    )
  }

  if (error || !feedback) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate(jobId ? `/jobb/${jobId}` : '/')}
          className="text-sm transition-colors"
          style={{ color: '#6b7280' }}
          onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
          onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
        >
          ← Tillbaka till uppdraget
        </button>
        <p className="text-sm" style={{ color: '#f87171' }}>
          {error || 'Feedback hittades inte.'}
        </p>
      </div>
    )
  }

  const scoreColor =
    feedback.overallScore >= 4
      ? '#22c55e'
      : feedback.overallScore >= 3
      ? '#E9C46A'
      : '#ef4444'

  const formattedDate = feedback.createdAt
    ? new Date(feedback.createdAt.toDate()).toLocaleDateString('sv-SE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '—'

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <button
          onClick={() => navigate(`/jobb/${jobId}`)}
          className="text-sm transition-colors"
          style={{ color: '#6b7280' }}
          onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
          onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
        >
          ← Tillbaka till uppdraget
        </button>

        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Intervjufeedback – {feedback.jobTitle}
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#9ca3af' }}>
            {feedback.company && `${feedback.company} · `}
            {formattedDate}
          </p>
        </div>
      </div>

      {/* Overall Score */}
      <div className="flex flex-col items-center gap-4 py-8">
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: 120,
            height: 120,
            backgroundColor: scoreColor + '20',
            border: `4px solid ${scoreColor}`,
          }}
        >
          <span
            className="text-5xl font-bold"
            style={{ color: scoreColor }}
          >
            {feedback.overallScore}
          </span>
        </div>
        <p className="text-sm font-semibold" style={{ color: '#9ca3af' }}>
          Övergripande betyg
        </p>
      </div>

      {/* Summary */}
      {feedback.summary && (
        <div
          className="rounded-xl border p-6"
          style={{ backgroundColor: '#1d1d1d', borderColor: '#404040' }}
        >
          <h2
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: '#8064ad' }}
          >
            Sammanfattning
          </h2>
          <p className="text-sm leading-relaxed text-white">
            {feedback.summary}
          </p>
        </div>
      )}

      {/* Strengths and Improvements */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Strengths */}
        {feedback.strengths && feedback.strengths.length > 0 && (
          <div
            className="rounded-xl border p-6 space-y-3"
            style={{ backgroundColor: '#0d2b1a', borderColor: '#1a4d2e' }}
          >
            <h2
              className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2"
              style={{ color: '#22c55e' }}
            >
              <CheckIcon />
              Styrkor
            </h2>
            <ul className="space-y-2">
              {feedback.strengths.map((strength, i) => (
                <li
                  key={i}
                  className="text-sm leading-relaxed"
                  style={{ color: '#d1f4e0' }}
                >
                  • {strength}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Improvements */}
        {feedback.improvements && feedback.improvements.length > 0 && (
          <div
            className="rounded-xl border p-6 space-y-3"
            style={{ backgroundColor: '#2b1a0d', borderColor: '#4d2e1a' }}
          >
            <h2
              className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2"
              style={{ color: '#fb923c' }}
            >
              <LightbulbIcon />
              Förbättringsområden
            </h2>
            <ul className="space-y-2">
              {feedback.improvements.map((improvement, i) => (
                <li
                  key={i}
                  className="text-sm leading-relaxed"
                  style={{ color: '#f0a085' }}
                >
                  • {improvement}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Competency Gaps */}
      {feedback.competencyGaps && feedback.competencyGaps.length > 0 && (
        <div
          className="rounded-xl border p-6 space-y-3"
          style={{ backgroundColor: '#0d1a2b', borderColor: '#1a2e4d' }}
        >
          <h2
            className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2"
            style={{ color: '#60a5fa' }}
          >
            <LinkIcon />
            Koppling till din kompetensbank
          </h2>
          <ul className="space-y-2">
            {feedback.competencyGaps.map((gap, i) => (
              <li
                key={i}
                className="text-sm leading-relaxed"
                style={{ color: '#a5d8ff' }}
              >
                • {gap}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Question Feedback */}
      {feedback.questionFeedback && feedback.questionFeedback.length > 0 && (
        <div className="space-y-4">
          <h2
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: '#8064ad' }}
          >
            Feedback per fråga
          </h2>
          <div className="space-y-3">
            {feedback.questionFeedback.map((qf, i) => (
              <QuestionFeedbackCard key={i} feedback={qf} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function QuestionFeedbackCard({ feedback, index }) {
  const [expanded, setExpanded] = useState(false)

  const scoreColor =
    feedback.score >= 4
      ? '#22c55e'
      : feedback.score >= 3
      ? '#E9C46A'
      : '#ef4444'

  return (
    <div
      className="rounded-xl border transition-colors cursor-pointer"
      style={{ backgroundColor: '#1d1d1d', borderColor: '#404040' }}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-start justify-between gap-4 p-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold mb-1" style={{ color: '#9ca3af' }}>
            Fråga {index + 1}
          </p>
          <p className="text-sm text-white leading-relaxed">
            {feedback.question}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div
            className="flex items-center justify-center rounded-full"
            style={{
              width: 40,
              height: 40,
              backgroundColor: scoreColor + '20',
              border: `2px solid ${scoreColor}`,
            }}
          >
            <span className="text-sm font-bold" style={{ color: scoreColor }}>
              {feedback.score}
            </span>
          </div>
          <ChevronIcon expanded={expanded} />
        </div>
      </div>

      {expanded && feedback.comment && (
        <div
          className="px-4 pb-4 border-t pt-3"
          style={{ borderColor: '#404040' }}
        >
          <p className="text-sm leading-relaxed" style={{ color: '#d1d5db' }}>
            {feedback.comment}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function LightbulbIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

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
        color: '#6b7280',
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
