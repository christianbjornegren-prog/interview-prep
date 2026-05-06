import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { db, auth, collection, addDoc, getDocs, serverTimestamp, doc, getDoc, updateDoc, arrayUnion } from '../lib/firebase'
import { analyzeJobPosting } from '../lib/claude'
import StepIndicator, { percentToStep } from '../components/StepIndicator'

const JOB_STEPS = [
  { label: 'Läser jobbannonsen',          subtext: 'Förbereder analysen...' },
  { label: 'Matchar mot kompetensbanken', subtext: 'Jämför krav mot dina kompetenser...' },
  { label: 'Genererar intervjufrågor',    subtext: 'Claude skapar skräddarsydda frågor...' },
  { label: 'Skapar gap-analys',           subtext: 'Identifierar styrkor och gap...' },
]

export default function JobCreate() {
  const navigate = useNavigate()
  const location = useLocation()
  const targetUid = location.state?.targetUid ?? null
  const targetName = location.state?.targetName ?? null
  const pendingEmail = location.state?.pendingEmail ?? null
  const pendingName = location.state?.pendingName ?? null
  const [jobText, setJobText] = useState('')
  const [companyInfo, setCompanyInfo] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | error
  const [errorMsg, setErrorMsg] = useState('')
  const [progressPct, setProgressPct] = useState(0)

  function onProgress(_msg, pct) {
    setProgressPct(pct)
  }

  async function handleAnalyze() {
    if (!jobText.trim()) {
      setStatus('error')
      setErrorMsg('Klistra in jobbannonsen först.')
      return
    }

    setStatus('loading')
    setErrorMsg('')
    setProgressPct(0)

    try {
      let competencies = []

      if (pendingEmail) {
        const pendingSnap = await getDoc(doc(db, 'pendingProfiles', pendingEmail))
        competencies = (pendingSnap.data()?.competencies ?? []).map((c, i) => ({ docId: String(i), ...c }))
      } else {
        const uid = targetUid ?? auth.currentUser.uid
        const compSnap = await getDocs(collection(db, 'users', uid, 'competencies'))
        competencies = compSnap.docs.map((d) => ({ docId: d.id, ...d.data() }))
      }

      const result = await analyzeJobPosting(jobText, companyInfo, competencies, onProgress)

      const jobData = {
        id: `job_${Date.now()}`,
        jobTitle: result.jobTitle ?? '',
        company: result.company ?? '',
        summary: result.summary ?? '',
        rawJobText: jobText.trim(),
        companyInfo: companyInfo.trim(),
        questions: result.questions ?? [],
        gapAnalysis: result.gapAnalysis ?? { covered: [], gaps: [] },
        competencySnapshot: competencies.length,
      }

      let navigateTo
      if (pendingEmail) {
        await updateDoc(doc(db, 'pendingProfiles', pendingEmail), {
          jobs: arrayUnion(jobData),
        })
        navigateTo = `/konsulter/pending/${encodeURIComponent(pendingEmail)}`
      } else {
        const uid = targetUid ?? auth.currentUser.uid
        const docRef = await addDoc(collection(db, 'users', uid, 'jobs'), {
          ...jobData,
          createdAt: serverTimestamp(),
        })
        navigateTo = targetUid ? `/konsulter/${targetUid}` : `/jobb/${docRef.id}`
      }

      onProgress('Klart!', 100)
      await new Promise((r) => setTimeout(r, 1000))
      navigate(navigateTo)
    } catch (err) {
      console.error(err)
      setStatus('error')
      setErrorMsg(err.message ?? 'Något gick fel. Försök igen.')
    }
  }

  const isLoading = status === 'loading'

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Nytt uppdrag</h1>
          <p className="mt-1 text-sm" style={{ color: '#6b7280' }}>
            {(targetName || pendingName)
              ? `Klistra in en jobbannons för ${targetName ?? pendingName}.`
              : 'Klistra in en jobbannons så analyserar AI:n krav och matchning mot din kompetensbank.'}
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
        <StepIndicator steps={JOB_STEPS} currentStep={percentToStep(progressPct)} />
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

          <button
            onClick={handleAnalyze}
            className="w-full py-3 rounded-lg text-white text-sm font-semibold transition-colors"
            style={{ backgroundColor: '#8064ad' }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#9781be')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#8064ad')}
          >
            Analysera och generera frågor
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
