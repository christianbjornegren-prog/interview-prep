import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { db, auth, collection, addDoc, serverTimestamp, Timestamp, doc, updateDoc, arrayUnion } from '../lib/firebase'
import { analyzeJobPosting, extractCompetencies } from '../lib/claude'
import { createPendingCvStore, createUserCvStore } from '../lib/cvStore'
import { cvDisplayName, describeCvError, findCv, toMillis } from '../lib/cvs'
import { useCvs } from '../lib/useCvs'
import { createJobFromPosting, getCvFileType, validateCvFile } from '../lib/jobCreation'
import { buildJobCreateSteps } from '../lib/progressSteps'
import { useProgressSteps } from '../lib/useProgressSteps'
import StepIndicator from '../components/StepIndicator'

// Valet i CV-listan som betyder "det nya CV:t jag just valt som fil".
const NEW_CV = '__new__'

export default function JobCreate() {
  const navigate = useNavigate()
  const location = useLocation()
  const targetUid = location.state?.targetUid ?? null
  const targetName = location.state?.targetName ?? null
  const pendingEmail = location.state?.pendingEmail ?? null
  const pendingName = location.state?.pendingName ?? null
  const ownerName = targetName ?? pendingName
  const [jobText, setJobText] = useState('')
  const [companyInfo, setCompanyInfo] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | error
  const [errorMsg, setErrorMsg] = useState('')

  // Uppdraget styr vilket CV som gäller. Det kan väljas här – befintligt
  // eller ett nytt som laddas upp i samma svep – eller kopplas efteråt.
  const ownerUid = targetUid ?? auth.currentUser.uid
  const store = useMemo(
    () => (pendingEmail ? createPendingCvStore(pendingEmail) : createUserCvStore(ownerUid)),
    [pendingEmail, ownerUid]
  )
  const { cvs, loading: loadingCvs, reload: reloadCvs } = useCvs(store)
  const [selectedCvId, setSelectedCvId] = useState('')
  const [cvTouched, setCvTouched] = useState(false)
  const [cvFile, setCvFile] = useState(null)
  const [fileError, setFileError] = useState('')
  const fileInputRef = useRef(null)

  // Finns exakt ett CV är det nästan alltid det som avses – förvälj det.
  // Med flera CV:n väljer man aktivt.
  useEffect(() => {
    if (!cvTouched && cvs.length === 1) setSelectedCvId(cvs[0].id)
  }, [cvs, cvTouched])

  // Stegen bestäms när analysen startar (med/utan nytt CV) och ligger fast.
  const [steps, setSteps] = useState(() => buildJobCreateSteps())
  const progress = useProgressSteps(steps)

  function handleFilePicked(file) {
    if (!file) return
    const invalid = validateCvFile(file)
    if (invalid) {
      setFileError(invalid)
      return
    }
    setFileError('')
    setCvFile(file)
    setSelectedCvId(NEW_CV)
    setCvTouched(true)
  }

  function removeNewCv() {
    setCvFile(null)
    setSelectedCvId('')
  }

  async function handleAnalyze() {
    if (!jobText.trim()) {
      setStatus('error')
      setErrorMsg('Klistra in jobbannonsen först.')
      return
    }

    const useNewFile = selectedCvId === NEW_CV && cvFile
    const existingCv = useNewFile ? null : findCv(cvs, selectedCvId)
    setSteps(buildJobCreateSteps({ uploadCv: !!useNewFile, hasCv: !!existingCv }))
    setStatus('loading')
    setErrorMsg('')

    try {
      const { saved } = await createJobFromPosting({
        jobText,
        companyInfo,
        cv: existingCv,
        cvFile: useNewFile ? cvFile : null,
        extract: (file) => extractCompetencies(file, getCvFileType(file)),
        createCv: (input) => store.create(input),
        analyze: (text, info, comps) => analyzeJobPosting(text, info, comps),
        saveJob: async (jobData) => {
          if (pendingEmail) {
            // serverTimestamp() is a sentinel that can't live inside an array, so
            // stamp pending jobs with a concrete Timestamp for consistent sorting.
            // (Migration to users/{uid}/jobs re-stamps createdAt server-side.)
            await updateDoc(doc(db, 'pendingProfiles', pendingEmail), {
              jobs: arrayUnion({ ...jobData, createdAt: Timestamp.now() }),
            })
            return null
          }
          const ref = await addDoc(collection(db, 'users', ownerUid, 'jobs'), {
            ...jobData,
            createdAt: serverTimestamp(),
          })
          return ref.id
        },
        onPhase: progress.enterPhase,
      })

      // Visa "allt klart" en kort stund innan vi går vidare.
      await new Promise((r) => setTimeout(r, 800))
      navigate(
        pendingEmail
          ? `/konsulter/pending/${encodeURIComponent(pendingEmail)}`
          : targetUid
          ? `/konsulter/${targetUid}`
          : `/jobb/${saved}`
      )
    } catch (err) {
      console.error(err)
      // CV:t hann sparas innan något gick fel – välj det, så laddas samma
      // fil inte upp och tolkas en gång till vid nästa försök.
      if (err.savedCv) {
        await reloadCvs()
        setCvFile(null)
        setSelectedCvId(err.savedCv.id)
      }
      progress.reset()
      setStatus('error')
      setErrorMsg(
        (err.savedCv ? `CV:t "${cvDisplayName(err.savedCv)}" är sparat, men uppdraget kunde inte analyseras: ` : '') +
        describeCvError(err)
      )
    }
  }

  const isLoading = status === 'loading'
  const hasNewFile = selectedCvId === NEW_CV && cvFile

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Nytt uppdrag</h1>
          <p className="mt-1 text-sm" style={{ color: '#6b7280' }}>
            {ownerName
              ? `Klistra in en jobbannons för ${ownerName}.`
              : 'Klistra in en jobbannons och välj vilket CV som gäller – AI:n analyserar krav och matchning mot just det CV:t.'}
          </p>
        </div>
        {!isLoading && (
          <button
            onClick={() =>
              navigate(
                pendingEmail
                  ? `/konsulter/pending/${encodeURIComponent(pendingEmail)}`
                  : targetUid
                  ? `/konsulter/${targetUid}`
                  : '/'
              )
            }
            className="text-sm transition-colors shrink-0"
            style={{ color: '#6b7280' }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
          >
            ← Tillbaka
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <StepIndicator steps={steps} currentStep={progress.index} />
          <p className="text-xs text-center" style={{ color: '#6b7280' }}>
            {steps.length > 6
              ? 'CV och uppdrag analyseras i samma svep – det tar oftast 1–2 minuter, ibland längre.'
              : 'Det tar oftast runt en minut, ibland längre.'}{' '}
            Stäng inte fliken.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <label
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: '#8064ad' }}
            >
              Klistra in jobbannonsen
            </label>
            <textarea
              value={jobText}
              onChange={(e) => setJobText(e.target.value)}
              placeholder="Klistra in hela jobbannonsen här – titel, beskrivning, krav och meriter."
              rows={12}
              className="w-full rounded-lg border p-4 text-sm text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#8064ad]"
              style={{ backgroundColor: '#1d1d1d', borderColor: '#404040', resize: 'vertical' }}
            />
          </div>

          <div className="space-y-2">
            <label
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: '#8064ad' }}
            >
              Om företaget{' '}
              <span className="lowercase" style={{ color: '#6b7280' }}>– valfritt</span>
            </label>
            <textarea
              value={companyInfo}
              onChange={(e) => setCompanyInfo(e.target.value)}
              placeholder="Fritext om bolaget – bransch, storlek, kultur, utmaningar du vet om."
              rows={4}
              className="w-full rounded-lg border p-4 text-sm text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#8064ad]"
              style={{ backgroundColor: '#1d1d1d', borderColor: '#404040', resize: 'vertical' }}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="job-cv"
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: '#8064ad' }}
            >
              CV för uppdraget
            </label>
            {loadingCvs ? (
              <p className="text-sm" style={{ color: '#6b7280' }}>Laddar CV:n...</p>
            ) : (
              <>
                <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                  <select
                    id="job-cv"
                    value={selectedCvId}
                    onChange={(e) => { setSelectedCvId(e.target.value); setCvTouched(true) }}
                    className="flex-1 min-w-0 rounded-lg border px-4 py-3 text-sm text-white focus:outline-none focus:border-[#8064ad]"
                    style={{ backgroundColor: '#1d1d1d', borderColor: '#404040' }}
                  >
                    <option value="">Koppla CV senare</option>
                    {cvFile && <option value={NEW_CV}>Nytt CV: {cvFile.name}</option>}
                    {cvs.map((cv) => (
                      <option key={cv.id} value={cv.id}>
                        {cvDisplayName(cv)}
                        {toMillis(cv.createdAt)
                          ? ` · ${new Date(toMillis(cv.createdAt)).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' })}`
                          : ''}
                      </option>
                    ))}
                  </select>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx"
                    className="hidden"
                    onChange={(e) => { handleFilePicked(e.target.files?.[0]); e.target.value = '' }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-colors shrink-0"
                    style={{ backgroundColor: '#8064ad1f', border: '1px solid #8064ad', color: '#e4dbf2' }}
                    onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
                    onMouseOut={(e) => (e.currentTarget.style.color = '#e4dbf2')}
                  >
                    <UploadIcon />
                    {cvFile ? 'Välj annan fil' : 'Ladda upp CV'}
                  </button>
                </div>

                {hasNewFile && (
                  <div
                    className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
                    style={{ backgroundColor: '#1a1626', borderColor: '#8064ad80' }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileIcon />
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{cvFile.name}</p>
                        <p className="text-xs" style={{ color: '#9ca3af' }}>
                          Sparas {ownerName ? 'bland konsultens CV:n' : 'bland dina CV:n'} och kopplas till uppdraget när du klickar Analysera.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={removeNewCv}
                      className="text-xs shrink-0 transition-colors"
                      style={{ color: '#6b7280' }}
                      onMouseOver={(e) => (e.currentTarget.style.color = '#f87171')}
                      onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
                    >
                      Ta bort
                    </button>
                  </div>
                )}

                {fileError && <p className="text-xs" style={{ color: '#f87171' }}>{fileError}</p>}

                {!hasNewFile && (
                  <p className="text-xs" style={{ color: '#6b7280' }}>
                    {cvs.length === 0
                      ? 'Inga CV:n uppladdade än – ladda upp det CV som gäller för uppdraget, eller koppla ett senare.'
                      : selectedCvId
                      ? 'Kravmatchning och intervjufrågor bygger på det här CV:t. Du kan byta senare.'
                      : 'Utan CV kan uppdraget sparas, men träningen kan inte startas förrän ett CV är kopplat.'}
                  </p>
                )}
              </>
            )}
          </div>

          <button
            onClick={handleAnalyze}
            disabled={loadingCvs}
            className="w-full py-3 disabled:opacity-60 rounded-lg text-white text-sm font-semibold transition-colors"
            style={{ backgroundColor: '#8064ad' }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#9781be')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#8064ad')}
          >
            {hasNewFile ? 'Analysera CV och uppdrag' : 'Analysera och generera frågor'}
          </button>

          {status === 'error' && (
            <div
              className="rounded-lg px-4 py-3 text-sm"
              style={{
                backgroundColor: '#2b0d0d',
                border: '1px solid #4d1a1a',
                color: '#f87171',
              }}
            >
              {errorMsg}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function FileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8064ad"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}
