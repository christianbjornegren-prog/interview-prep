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
    return <p className="text-sm py-8" style={{ color: '#6b7280' }}>Laddar profil...</p>
  }
  if (loadError) {
    return <p className="text-sm py-8" style={{ color: '#f87171' }}>Kunde inte ladda profilen: {loadError}</p>
  }
  if (!profile) {
    return <p className="text-sm py-8" style={{ color: '#f87171' }}>Profilen hittades inte.</p>
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
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/konsulter')}
          className="text-sm transition-colors shrink-0"
          style={{ color: '#6b7280' }}
          onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
          onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
        >
          ← Konsulter
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {profile.name ?? email}
            </h1>
            <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: '#4d3e1a', color: '#f0d48a' }}>
              Väntande
            </span>
          </div>
          <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>{email}</p>
        </div>
      </div>

      {/* Pending banner */}
      <div
        className="rounded-xl border px-5 py-4"
        style={{ backgroundColor: '#1d1d1d', borderColor: '#4d3e1a' }}
      >
        <p className="text-sm" style={{ color: '#f0d48a' }}>
          Konsulten har inte loggat in än. CV:n och uppdrag du lägger till här – och vilket CV som är kopplat till vilket uppdrag – följer automatiskt med till deras konto när de loggar in första gången.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: '#404040' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-5 py-2.5 text-sm font-medium transition-colors -mb-px"
            style={{
              color: activeTab === tab.id ? '#fff' : '#6b7280',
              borderBottom: activeTab === tab.id ? '2px solid #8064ad' : '2px solid transparent',
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
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8064ad' }}>
                {jobs.length} uppdrag
              </p>
              {!loadingCvs && unlinkedCount > 0 && (
                <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
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
              className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors"
              style={{ backgroundColor: '#8064ad' }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#9781be')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#8064ad')}
            >
              + Skapa nytt uppdrag åt konsulten
            </button>
          </div>

          {cvError && <p className="text-sm" style={{ color: '#f87171' }}>{cvError}</p>}

          {jobs.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed p-12 text-center" style={{ borderColor: '#404040' }}>
              <p className="text-sm" style={{ color: '#6b7280' }}>
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
