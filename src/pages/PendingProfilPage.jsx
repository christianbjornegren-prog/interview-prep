import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db, doc, getDoc } from '../lib/firebase'
import { createPendingCvStore } from '../lib/cvStore'
import { resolveJobCv } from '../lib/cvs'
import { useCvs } from '../lib/useCvs'
import CvLibrary from '../components/CvLibrary'
import JobCvCard from '../components/JobCvCard'

// ── Main component ────────────────────────────────────────────────────────

export default function PendingProfilPage() {
  const { email: encodedEmail } = useParams()
  const email = decodeURIComponent(encodedEmail)
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  // Uppdraget styr – därför är Uppdrag första fliken.
  const [activeTab, setActiveTab] = useState('uppdrag')

  const store = useMemo(() => createPendingCvStore(email), [email])
  const { cvs, loading: loadingCvs, error: cvError, reload: reloadCvs } = useCvs(store)

  const loadProfile = useCallback(async () => {
    setLoadError('')
    try {
      const snap = await getDoc(doc(db, 'pendingProfiles', email))
      setProfile(snap.exists() ? { email, ...snap.data() } : null)
    } catch (err) {
      console.error('Kunde inte ladda profilen:', err)
      setLoadError(err.message ?? 'Kunde inte ladda profilen.')
    } finally {
      setLoading(false)
    }
  }, [email])

  useEffect(() => { loadProfile() }, [loadProfile])

  async function reloadAll() {
    await Promise.all([loadProfile(), reloadCvs()])
  }

  if (loading) {
    return <p className="text-sm py-8" style={{ color: 'var(--color-text-secondary)' }}>Laddar profil...</p>
  }
  if (loadError) {
    return <p className="text-sm py-8" style={{ color: 'var(--color-feedback-error)' }}>Kunde inte ladda profilen: {loadError}</p>
  }
  if (!profile) {
    return <p className="text-sm py-8" style={{ color: 'var(--color-feedback-error)' }}>Profilen hittades inte.</p>
  }

  // Pending-uppdrag har sitt id i fältet `id`; CV-väljaren och JobPage
  // arbetar med `docId`.
  const jobs = (profile.jobs ?? []).map((j) => ({ ...j, docId: j.id }))
  const unlinkedCount = jobs.filter((j) => resolveJobCv(j, cvs).status !== 'linked').length

  const tabs = [
    { id: 'uppdrag', label: 'Uppdrag' },
    { id: 'cv', label: 'CV' },
  ]

  function openJob(job) {
    if (job.id) navigate(`/jobb/${job.id}`, { state: { pendingEmail: email } })
  }

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
          <div className="flex items-center gap-2 max-sm:flex-wrap">
            <h1 className="text-2xl font-medium text-text-primary tracking-tight max-sm:text-xl max-sm:break-words">
              {profile.name ?? email}
            </h1>
            <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--color-feedback-warning-background)', color: 'var(--color-feedback-warning)' }}>
              Väntande
            </span>
          </div>
          <p className="text-sm mt-0.5 max-sm:break-all" style={{ color: 'var(--color-text-secondary)' }}>{email}</p>
        </div>
      </div>

      {/* Pending banner */}
      <div
        className="rounded-xl border px-5 py-4"
        style={{ backgroundColor: 'var(--color-background-primary)', borderColor: 'var(--color-feedback-warning)' }}
      >
        <p className="text-sm" style={{ color: 'var(--color-feedback-warning)' }}>
          Konsulten har inte loggat in än. CV:n och uppdrag du lägger till här – och vilket CV som är kopplat till vilket uppdrag – följer automatiskt med till deras konto när de loggar in första gången.
        </p>
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
              onClick={() =>
                navigate('/jobb/ny', {
                  state: {
                    pendingEmail: email,
                    pendingName: profile.name ?? email,
                  },
                })
              }
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
              {jobs.map((job, i) => (
                <JobCvCard
                  key={job.id ?? i}
                  job={job}
                  cvs={cvs}
                  loadingCvs={loadingCvs}
                  store={store}
                  onChanged={reloadAll}
                  onOpen={job.id ? () => openJob(job) : null}
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
          onOpenJob={openJob}
          uploadLabel="+ Ladda upp CV åt konsulten"
        />
      )}
    </div>
  )
}
