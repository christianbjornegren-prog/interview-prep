import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { auth, db, doc, getDoc, updateDoc, serverTimestamp } from '../lib/firebase'
import { describeShareStatus } from '../lib/sharing'
import { feedbackCopy } from '../lib/feedbackCopy'

export default function FeedbackPage() {
  const { jobId, feedbackId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [feedback, setFeedback] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingShare, setSavingShare] = useState(false)
  const [shareError, setShareError] = useState('')

  // A säljare/admin viewing a konsult's shared session passes targetUid in
  // navigation state. The owner (konsult) has no targetUid → owns the doc.
  const targetUid = location.state?.targetUid ?? null
  const isOwner = !targetUid
  const uid = targetUid ?? auth.currentUser.uid

  // Sidan följer SESSIONENS språk. Innan dokumentet laddats (och för äldre
  // feedback utan fältet) blir det svenska.
  const language = feedback?.language
  const copy = feedbackCopy(language)

  useEffect(() => {
    let cancelled = false

    async function loadFeedback() {
      try {
        const feedbackSnap = await getDoc(
          doc(db, 'users', uid, 'jobs', jobId, 'feedback', feedbackId)
        )

        if (cancelled) return

        if (!feedbackSnap.exists()) {
          setError(copy.notFound)
        } else {
          setFeedback({ id: feedbackSnap.id, ...feedbackSnap.data() })
        }
      } catch (err) {
        console.error('Kunde inte hämta feedback:', err)
        if (!cancelled) setError(err.message ?? copy.loadFailed)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadFeedback()
    return () => {
      cancelled = true
    }
  }, [jobId, feedbackId, uid])

  async function handleToggleShare() {
    if (!isOwner || savingShare || !feedback) return
    const turningOn = !feedback.sharedWithSeller
    setSavingShare(true)
    setShareError('')
    try {
      const update = turningOn
        ? { sharedWithSeller: true, sharedAt: serverTimestamp() }
        : { sharedWithSeller: false, sharedAt: null }
      await updateDoc(
        doc(db, 'users', uid, 'jobs', jobId, 'feedback', feedbackId),
        update
      )
      // Mirror locally; use a Date now so the label updates immediately.
      setFeedback((prev) => ({
        ...prev,
        sharedWithSeller: turningOn,
        sharedAt: turningOn ? { toDate: () => new Date() } : null,
      }))
    } catch (err) {
      console.error('Kunde inte uppdatera delning:', err)
      setShareError(copy.shareFailed)
    } finally {
      setSavingShare(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex items-center gap-3" style={{ color: 'var(--color-text-secondary)' }}>
          <Spinner />
          <span className="text-sm">{copy.loading}</span>
        </div>
      </div>
    )
  }

  if (error || !feedback) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate(jobId ? `/jobb/${jobId}` : '/')}
          className="text-sm transition-colors tap-target"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseOver={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
          onMouseOut={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
        >
          {copy.backToJob}
        </button>
        <p className="text-sm" style={{ color: 'var(--color-feedback-error)' }}>
          {error || copy.notFound}
        </p>
      </div>
    )
  }

  const scoreColor =
    feedback.overallScore >= 8
      ? 'var(--color-feedback-success)'
      : feedback.overallScore >= 6
      ? 'var(--color-feedback-warning)'
      : 'var(--color-feedback-error)'

  const formattedDate = feedback.createdAt?.toDate
    ? new Date(feedback.createdAt.toDate()).toLocaleDateString(copy.locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : copy.unknownDate

  const backPath = targetUid ? `/konsulter/${targetUid}` : `/jobb/${jobId}`
  const backLabel = targetUid ? copy.backToConsultant : copy.backToJob

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <button
          onClick={() => navigate(backPath)}
          className="text-sm transition-colors tap-target"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseOver={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
          onMouseOut={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
        >
          {backLabel}
        </button>

        <div>
          <h1 className="text-2xl font-medium text-text-primary tracking-tight max-sm:text-xl max-sm:break-words">
            {copy.title(feedback.jobTitle)}
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {feedback.company && `${feedback.company} · `}
            {formattedDate}
          </p>
        </div>
      </div>

      {/* Delning / integritet – visas bara för ägaren (konsulten) */}
      {isOwner && <ShareCard
        status={describeShareStatus(feedback, language)}
        saving={savingShare}
        error={shareError}
        onToggle={handleToggleShare}
        copy={copy}
      />}

      {/* Overall Score */}
      <div className="flex flex-col items-center gap-4 py-8">
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: 120,
            height: 120,
            backgroundColor: `color-mix(in srgb, ${scoreColor} 12%, transparent)`,
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
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
          {copy.overallScore}
        </p>
      </div>

      {/* Summary */}
      {feedback.summary && (
        <div
          className="rounded-xl border p-6 max-sm:p-5"
          style={{ backgroundColor: 'var(--color-background-primary)', borderColor: 'var(--color-border-default)' }}
        >
          <h2
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: 'var(--color-accent-purple)' }}
          >
            {copy.summary}
          </h2>
          <p className="text-sm leading-relaxed text-text-primary">
            {feedback.summary}
          </p>
        </div>
      )}

      {/* Strengths and Improvements */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Strengths */}
        {feedback.strengths && feedback.strengths.length > 0 && (
          <div
            className="rounded-xl border p-6 space-y-3 max-sm:p-5"
            style={{ backgroundColor: 'var(--color-feedback-success-background)', borderColor: 'color-mix(in srgb, var(--color-feedback-success) 25%, transparent)' }}
          >
            <h2
              className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2"
              style={{ color: 'var(--color-feedback-success)' }}
            >
              <CheckIcon />
              {copy.strengths}
            </h2>
            <ul className="space-y-2">
              {feedback.strengths.map((strength, i) => (
                <li
                  key={i}
                  className="text-sm leading-relaxed"
                  style={{ color: 'var(--color-text-primary)' }}
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
            className="rounded-xl border p-6 space-y-3 max-sm:p-5"
            style={{ backgroundColor: 'var(--color-feedback-warning-background)', borderColor: 'color-mix(in srgb, var(--color-feedback-warning) 25%, transparent)' }}
          >
            <h2
              className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2"
              style={{ color: 'var(--color-feedback-warning)' }}
            >
              <LightbulbIcon />
              {copy.improvements}
            </h2>
            <ul className="space-y-2">
              {feedback.improvements.map((improvement, i) => (
                <li
                  key={i}
                  className="text-sm leading-relaxed"
                  style={{ color: 'var(--color-text-primary)' }}
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
          className="rounded-xl border p-6 space-y-3 max-sm:p-5"
          style={{ backgroundColor: 'var(--color-feedback-info-background)', borderColor: 'color-mix(in srgb, var(--color-feedback-info) 25%, transparent)' }}
        >
          <h2
            className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2"
            style={{ color: 'var(--color-feedback-info)' }}
          >
            <LinkIcon />
            {copy.competencyLink}
          </h2>
          <ul className="space-y-2">
            {feedback.competencyGaps.map((gap, i) => (
              <li
                key={i}
                className="text-sm leading-relaxed"
                style={{ color: 'var(--color-text-primary)' }}
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
            style={{ color: 'var(--color-accent-purple)' }}
          >
            {copy.perQuestion}
          </h2>
          <div className="space-y-3">
            {feedback.questionFeedback.map((qf, i) => (
              <QuestionFeedbackCard key={i} feedback={qf} index={i} copy={copy} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Share card ────────────────────────────────────────────────────────────

function ShareCard({ status, saving, error, onToggle, copy }) {
  const on = status.shared
  return (
    <div
      className="rounded-xl border p-5 space-y-4"
      style={{ backgroundColor: 'var(--color-background-primary)', borderColor: on ? 'var(--color-control-checked)' : 'var(--color-border-default)' }}
    >
      <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        {copy.privacyNote}
      </p>

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {copy.shareToggle}
          </p>
          <p
            className="text-xs mt-0.5"
            style={{ color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}
          >
            {status.label}
          </p>
        </div>

        <button
          onClick={onToggle}
          disabled={saving}
          role="switch"
          aria-checked={on}
          aria-label={copy.shareToggle}
          className="relative shrink-0 rounded-full transition-colors disabled:opacity-50 max-sm:before:absolute max-sm:before:-inset-2 max-sm:before:content-['']"
          style={{
            width: 48,
            height: 28,
            backgroundColor: on ? 'var(--color-control-checked)' : 'var(--color-border-strong)',
          }}
        >
          <span
            className="absolute rounded-full bg-control-check transition-transform"
            style={{
              width: 22,
              height: 22,
              top: 3,
              left: 3,
              transform: on ? 'translateX(20px)' : 'translateX(0)',
            }}
          />
        </button>
      </div>

      {error && (
        <p className="text-xs" style={{ color: 'var(--color-feedback-error)' }}>{error}</p>
      )}
    </div>
  )
}

function QuestionFeedbackCard({ feedback, index, copy }) {
  const [expanded, setExpanded] = useState(false)

  const scoreColor =
    feedback.score >= 8
      ? 'var(--color-feedback-success)'
      : feedback.score >= 6
      ? 'var(--color-feedback-warning)'
      : 'var(--color-feedback-error)'

  return (
    <div
      className="rounded-xl border transition-colors cursor-pointer"
      style={{ backgroundColor: 'var(--color-background-primary)', borderColor: 'var(--color-border-default)' }}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-start justify-between gap-4 p-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
            {copy.question(index + 1)}
          </p>
          <p className="text-sm text-text-primary leading-relaxed">
            {feedback.question}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div
            className="flex items-center justify-center rounded-full"
            style={{
              width: 40,
              height: 40,
              backgroundColor: `color-mix(in srgb, ${scoreColor} 12%, transparent)`,
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
          style={{ borderColor: 'var(--color-border-default)' }}
        >
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
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
        color: 'var(--color-text-secondary)',
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
