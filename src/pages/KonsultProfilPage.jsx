import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  collection,
  db,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from '../lib/firebase'
import { isEnglish } from '../lib/language'
import { createUserCvStore } from '../lib/cvStore'
import { resolveJobCv } from '../lib/cvs'
import { useCvs } from '../lib/useCvs'
import CvLibrary from '../components/CvLibrary'
import JobCvCard from '../components/JobCvCard'

// ── Main component ────────────────────────────────────────────────────────

export default function KonsultProfilPage() {
  const { uid } = useParams()
  const navigate = useNavigate()

  const [konsult, setKonsult] = useState(null)
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  // Uppdraget styr – därför är Uppdrag första fliken: lägg till uppdrag,
  // koppla sedan rätt CV till det.
  const [activeTab, setActiveTab] = useState('uppdrag')
  const [sharedFeedback, setSharedFeedback] = useState([])
  const [loadingShared, setLoadingShared] = useState(true)

  const store = useMemo(() => createUserCvStore(uid), [uid])
  const { cvs, loading: loadingCvs, error: cvError, reload: reloadCvs } = useCvs(store)

  const loadJobs = useCallback(async () => {
    const snap = await getDocs(collection(db, 'users', uid, 'jobs'))
    setJobs(snap.docs.map((d) => ({ docId: d.id, ...d.data() })))
  }, [uid])

  async function reloadAll() {
    await Promise.all([loadJobs(), reloadCvs()])
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [userSnap, jobsSnap] = await Promise.all([
          getDoc(doc(db, 'users', uid)),
          getDocs(collection(db, 'users', uid, 'jobs')),
        ])
        if (cancelled) return
        if (userSnap.exists()) setKonsult({ uid, ...userSnap.data() })
        setJobs(jobsSnap.docs.map((d) => ({ docId: d.id, ...d.data() })))
      } catch (err) {
        console.error('Kunde inte ladda konsultprofilen:', err)
        if (!cancelled) setLoadError(err.message ?? 'Kunde inte ladda profilen.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [uid])

  const jobIdsKey = jobs.map((j) => j.docId).join(',')

  // Load the sessions the konsult has chosen to share. Each per-job query
  // MUST filter sharedWithSeller==true so the security rules permit the read.
  useEffect(() => {
    if (loading) return
    let cancelled = false
    async function loadShared() {
      setLoadingShared(true)
      try {
        const perJob = await Promise.all(
          jobs.map(async (job) => {
            const snap = await getDocs(
              query(
                collection(db, 'users', uid, 'jobs', job.docId, 'feedback'),
                where('sharedWithSeller', '==', true)
              )
            )
            return snap.docs.map((d) => ({
              id: d.id,
              jobId: job.docId,
              jobTitle: job.jobTitle || d.data().jobTitle || 'Namnlöst uppdrag',
              company: job.company || d.data().company || '',
              ...d.data(),
            }))
          })
        )
        if (cancelled) return
        const all = perJob.flat().sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() ?? 0
          const tb = b.createdAt?.toMillis?.() ?? 0
          return tb - ta
        })
        setSharedFeedback(all)
      } catch (err) {
        console.error('Kunde inte hämta delad feedback:', err)
        if (!cancelled) setSharedFeedback([])
      } finally {
        if (!cancelled) setLoadingShared(false)
      }
    }
    loadShared()
    return () => { cancelled = true }
  // Laddas bara om när uppdragslistan byts ut (inte vid varje CV-koppling
  // som ändrar ett uppdrags fält) – nyckeln är uppdragens id:n.
  }, [uid, jobIdsKey, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <p className="text-sm py-8" style={{ color: 'var(--color-text-secondary)' }}>Laddar profil...</p>
  }

  if (loadError) {
    return <p className="text-sm py-8" style={{ color: 'var(--color-feedback-error)' }}>Kunde inte ladda profilen: {loadError}</p>
  }

  if (!konsult) {
    return <p className="text-sm py-8" style={{ color: 'var(--color-feedback-error)' }}>Konsulten hittades inte.</p>
  }

  const tabs = [
    { id: 'uppdrag', label: 'Uppdrag' },
    { id: 'cv', label: 'CV' },
    { id: 'feedback', label: 'Delad feedback' },
  ]
  const unlinkedCount = jobs.filter((j) => !j.archived && resolveJobCv(j, cvs).status !== 'linked').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 max-sm:flex-col max-sm:items-start max-sm:gap-1">
        <button
          onClick={() => navigate('/konsulter')}
          className="text-sm transition-colors shrink-0 tap-target"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseOver={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
          onMouseOut={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
        >
          ← Konsulter
        </button>
        <div className="max-sm:min-w-0 max-sm:max-w-full">
          <h1 className="text-2xl font-medium text-text-primary tracking-tight max-sm:text-xl max-sm:break-words">
            {konsult.name ?? konsult.email}
          </h1>
          <p className="text-sm mt-0.5 max-sm:break-all" style={{ color: 'var(--color-text-secondary)' }}>{konsult.email}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: 'var(--color-border-default)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-5 py-2.5 text-sm font-medium transition-colors -mb-px max-sm:px-4 max-sm:py-3"
            style={{
              color: activeTab === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-link-text)' : '2px solid transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Uppdrag – här kopplas CV till varje uppdrag */}
      {activeTab === 'uppdrag' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-accent-purple)' }}>
                {jobs.length} uppdrag
              </p>
              {!loadingCvs && unlinkedCount > 0 && (
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                  {unlinkedCount} uppdrag saknar kopplat CV – konsulten kan inte träna på dem än.
                </p>
              )}
            </div>
            <button
              onClick={() => navigate('/jobb/ny', { state: { targetUid: uid, targetName: konsult.name ?? konsult.email } })}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold text-action-primary-text transition-colors max-sm:w-full max-sm:min-h-11"
              style={{ backgroundColor: 'var(--color-action-primary-background)' }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-action-primary-background-hover)')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-action-primary-background)')}
            >
              + Skapa nytt uppdrag åt konsulten
            </button>
          </div>

          {cvError && <p className="text-sm" style={{ color: 'var(--color-feedback-error)' }}>{cvError}</p>}

          {jobs.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed p-12 text-center max-sm:p-6" style={{ borderColor: 'var(--color-border-default)' }}>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Inga uppdrag ännu. Skapa ett uppdrag och koppla sedan det CV som gäller för det.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {jobs.map((job) => (
                <JobCvCard
                  key={job.docId}
                  job={job}
                  cvs={cvs}
                  loadingCvs={loadingCvs}
                  store={store}
                  onChanged={reloadAll}
                  onOpen={() => navigate(`/jobb/${job.docId}`, { state: { targetUid: uid } })}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Tab: CV – överblick, inga aggregerade kompetenser */}
      {activeTab === 'cv' && (
        <CvLibrary
          store={store}
          cvs={cvs}
          jobs={jobs}
          loading={loadingCvs}
          error={cvError}
          onChanged={reloadAll}
          onOpenJob={(job) => navigate(`/jobb/${job.docId}`, { state: { targetUid: uid } })}
          uploadLabel="+ Ladda upp CV åt konsulten"
        />
      )}

      {/* Tab: Delad feedback */}
      {activeTab === 'feedback' && (
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-accent-purple)' }}>
            Sessioner konsulten delat
          </p>

          {loadingShared ? (
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Laddar delad feedback...</p>
          ) : sharedFeedback.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed p-12 text-center max-sm:p-6" style={{ borderColor: 'var(--color-border-default)' }}>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Konsulten har inte delat någon feedback.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {sharedFeedback.map((fb) => (
                <SharedFeedbackItem
                  key={`${fb.jobId}/${fb.id}`}
                  feedback={fb}
                  onClick={() =>
                    navigate(`/feedback/${fb.jobId}/${fb.id}`, { state: { targetUid: uid } })
                  }
                />
              ))}
            </ul>
          )}
        </div>
      )}

    </div>
  )
}

// ── Shared feedback item ──────────────────────────────────────────────────

function SharedFeedbackItem({ feedback, onClick }) {
  const score = feedback.overallScore
  const scoreColor =
    score == null ? 'var(--color-text-secondary)'
    : score >= 8 ? 'var(--color-feedback-success)'
    : score >= 6 ? 'var(--color-feedback-warning)'
    : 'var(--color-feedback-error)'

  const dateStr = feedback.createdAt?.toDate
    ? feedback.createdAt.toDate().toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Datum okänt'

  return (
    <li>
      <button
        onClick={onClick}
        className="w-full text-left rounded-xl border p-4 transition-colors flex items-center justify-between gap-4"
        style={{ backgroundColor: 'var(--color-background-primary)', borderColor: 'var(--color-border-default)' }}
        onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--color-link-text)')}
        onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-primary truncate">
            {feedback.jobTitle}
            {feedback.company && <span style={{ color: 'var(--color-text-secondary)' }}> · {feedback.company}</span>}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{dateStr}</p>
            {isEnglish(feedback.language) && (
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0"
                style={{ backgroundColor: 'var(--color-action-secondary-background-hover)', color: 'var(--color-text-primary)', border: '1px solid var(--color-action-secondary-background-pressed)' }}
                title="Intervjun hölls på engelska"
              >
                EN
              </span>
            )}
          </div>
        </div>
        <div
          className="flex items-center justify-center rounded-full shrink-0"
          style={{ width: 44, height: 44, backgroundColor: scoreColor + '20', border: `2px solid ${scoreColor}` }}
        >
          <span className="text-base font-bold" style={{ color: scoreColor }}>
            {score != null ? score : '—'}
          </span>
        </div>
      </button>
    </li>
  )
}

