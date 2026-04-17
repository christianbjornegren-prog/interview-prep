import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  addDoc,
  getDocs,
  onSnapshot,
  doc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore'
import { db, auth } from '../lib/firebase'
import { analyzeJobPosting } from '../lib/claude'
import ProgressIndicator from '../components/ProgressIndicator'

// ── Page shell ────────────────────────────────────────────────────────────

export default function JobPage() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('list') // list | create | detail
  const [selectedJobId, setSelectedJobId] = useState(null)

  useEffect(() => {
    const uid = auth.currentUser.uid
    const q = query(collection(db, 'users', uid, 'jobs'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setJobs(snap.docs.map((d) => ({ docId: d.id, ...d.data() })))
        setLoading(false)
      },
      (err) => {
        console.error('Firestore jobs onSnapshot fel:', err)
        setLoading(false)
      }
    )
    return unsub
  }, [])

  function openDetail(docId) {
    setSelectedJobId(docId)
    setMode('detail')
  }

  function backToList() {
    setSelectedJobId(null)
    setMode('list')
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Jobbannons</h1>
        <p className="mt-1 text-sm" style={{ color: '#6b7280' }}>
          Analysera jobbannonser och få skräddarsydda intervjufrågor baserat på din kompetensbank.
        </p>
      </div>

      {mode === 'list' && (
        <JobList
          jobs={jobs}
          loading={loading}
          onCreate={() => setMode('create')}
          onSelect={openDetail}
        />
      )}
      {mode === 'create' && (
        <JobCreate onBack={backToList} onCreated={openDetail} />
      )}
      {mode === 'detail' && (
        <JobDetail
          job={jobs.find((j) => j.docId === selectedJobId) ?? null}
          onBack={backToList}
        />
      )}
    </div>
  )
}

// ── List mode ─────────────────────────────────────────────────────────────

function JobList({ jobs, loading, onCreate, onSelect }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionLabel>Sparade jobbannonser</SectionLabel>
        <button
          onClick={onCreate}
          className="px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors"
          style={{ backgroundColor: '#4A6FA5' }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#5a82bc')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#4A6FA5')}
        >
          + Ny jobbannons
        </button>
      </div>

      {loading ? (
        <p className="text-sm py-8" style={{ color: '#6b7280' }}>
          Laddar jobbannonser...
        </p>
      ) : jobs.length === 0 ? (
        <div
          className="rounded-xl border-2 border-dashed p-12 text-center"
          style={{ borderColor: '#2a2d3a' }}
        >
          <p className="text-sm" style={{ color: '#6b7280' }}>
            Ingen jobbannons sparad ännu. Klicka på "Ny jobbannons" för att komma igång.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {jobs.map((job) => (
            <li key={job.docId}>
              <button
                onClick={() => onSelect(job.docId)}
                className="w-full text-left rounded-xl border p-4 transition-colors"
                style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
                onMouseOver={(e) => (e.currentTarget.style.borderColor = '#4A6FA5')}
                onMouseOut={(e) => (e.currentTarget.style.borderColor = '#2a2d3a')}
              >
                <h3 className="text-white font-semibold text-base leading-snug line-clamp-2">
                  {job.jobTitle || 'Namnlös jobbannons'}
                </h3>
                {job.company && (
                  <p className="text-sm mt-1" style={{ color: '#9ca3af' }}>
                    {job.company}
                  </p>
                )}
                <div
                  className="flex items-center justify-between mt-3 text-xs"
                  style={{ color: '#6b7280' }}
                >
                  <span>{formatDate(job.createdAt)}</span>
                  <span>
                    {(job.questions?.length ?? 0)} fråg
                    {(job.questions?.length ?? 0) === 1 ? 'a' : 'or'}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Create mode ───────────────────────────────────────────────────────────

function JobCreate({ onBack, onCreated }) {
  const [jobText, setJobText] = useState('')
  const [companyInfo, setCompanyInfo] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | error
  const [errorMsg, setErrorMsg] = useState('')
  const [progressMsg, setProgressMsg] = useState('')
  const [progressPct, setProgressPct] = useState(0)

  function onProgress(msg, pct) {
    setProgressMsg(msg)
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
    setProgressMsg('')

    try {
      // Fetch the competency bank to pass to Claude
      const uid = auth.currentUser.uid
      const compSnap = await getDocs(collection(db, 'users', uid, 'competencies'))
      const competencies = compSnap.docs.map((d) => ({ docId: d.id, ...d.data() }))

      const result = await analyzeJobPosting(jobText, companyInfo, competencies, onProgress)

      // Save to Firestore
      const docRef = await addDoc(collection(db, 'users', uid, 'jobs'), {
        jobTitle: result.jobTitle ?? '',
        company: result.company ?? '',
        summary: result.summary ?? '',
        rawJobText: jobText.trim(),
        companyInfo: companyInfo.trim(),
        questions: result.questions ?? [],
        gapAnalysis: result.gapAnalysis ?? { covered: [], gaps: [] },
        competencySnapshot: competencies.length,
        createdAt: serverTimestamp(),
      })

      onProgress('Klart!', 100)
      // Small delay so the user sees "Klart!"
      setTimeout(() => onCreated(docRef.id), 350)
    } catch (err) {
      console.error(err)
      setStatus('error')
      setErrorMsg(err.message ?? 'Något gick fel. Försök igen.')
    }
  }

  const isLoading = status === 'loading'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionLabel>Ny jobbannons</SectionLabel>
        {!isLoading && (
          <button
            onClick={onBack}
            className="text-sm transition-colors"
            style={{ color: '#6b7280' }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
          >
            ← Tillbaka
          </button>
        )}
      </div>

      {isLoading ? (
        <ProgressIndicator percent={progressPct} message={progressMsg} />
      ) : (
        <>
          <div className="space-y-2">
            <label
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: '#4A6FA5' }}
            >
              Klistra in jobbannonsen
            </label>
            <textarea
              value={jobText}
              onChange={(e) => setJobText(e.target.value)}
              placeholder="Klistra in hela jobbannonsen här – titel, beskrivning, krav och meriter."
              rows={12}
              className="w-full rounded-lg border p-4 text-sm text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#4A6FA5]"
              style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a', resize: 'vertical' }}
            />
          </div>

          <div className="space-y-2">
            <label
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: '#4A6FA5' }}
            >
              Om företaget <span className="lowercase" style={{ color: '#6b7280' }}>– valfritt</span>
            </label>
            <textarea
              value={companyInfo}
              onChange={(e) => setCompanyInfo(e.target.value)}
              placeholder="Fritext om bolaget – bransch, storlek, kultur, utmaningar du vet om."
              rows={4}
              className="w-full rounded-lg border p-4 text-sm text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#4A6FA5]"
              style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a', resize: 'vertical' }}
            />
          </div>

          <button
            onClick={handleAnalyze}
            className="w-full py-3 rounded-lg text-white text-sm font-semibold transition-colors"
            style={{ backgroundColor: '#4A6FA5' }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#5a82bc')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#4A6FA5')}
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

// ── Detail mode ───────────────────────────────────────────────────────────

const QUESTION_CATEGORIES = [
  { key: 'erfarenhet', label: 'Erfarenhet', color: '#4A6FA5' },
  { key: 'kompetens', label: 'Kompetens', color: '#2A9D8F' },
  { key: 'situation', label: 'Situation', color: '#E9C46A' },
  { key: 'motivation', label: 'Motivation', color: '#7C5CBF' },
]

const STRENGTH_STYLE = {
  hög: { color: '#4ade80', label: 'Hög' },
  medel: { color: '#e9c46a', label: 'Medel' },
  låg: { color: '#f87171', label: 'Låg' },
}

function JobDetail({ job, onBack }) {
  const [competencies, setCompetencies] = useState([])

  useEffect(() => {
    const uid = auth.currentUser.uid
    getDocs(collection(db, 'users', uid, 'competencies')).then((snap) => {
      setCompetencies(snap.docs.map((d) => ({ docId: d.id, ...d.data() })))
    })
  }, [])

  const competencyById = useMemo(() => {
    const map = new Map()
    competencies.forEach((c) => map.set(c.id, c))
    return map
  }, [competencies])

  if (!job) {
    return (
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="text-sm transition-colors"
          style={{ color: '#6b7280' }}
        >
          ← Tillbaka
        </button>
        <p className="text-sm" style={{ color: '#6b7280' }}>
          Hittade ingen jobbannons.
        </p>
      </div>
    )
  }

  const questions = job.questions ?? []
  const grouped = QUESTION_CATEGORIES.map((cat) => ({
    ...cat,
    items: questions.filter((q) => q.category === cat.key),
  })).filter((g) => g.items.length > 0)

  const covered = job.gapAnalysis?.covered ?? []
  const gaps = job.gapAnalysis?.gaps ?? []

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-sm transition-colors"
          style={{ color: '#6b7280' }}
          onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
          onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
        >
          ← Tillbaka till listan
        </button>
      </div>

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">
          {job.jobTitle || 'Namnlös roll'}
        </h2>
        {job.company && (
          <p className="text-sm mt-1" style={{ color: '#9ca3af' }}>
            {job.company}
          </p>
        )}
        {job.summary && (
          <p className="text-sm mt-4 leading-relaxed" style={{ color: '#d1d5db' }}>
            {job.summary}
          </p>
        )}
      </div>

      {/* Gap analysis */}
      <section className="space-y-4">
        <SectionLabel>Gap-analys</SectionLabel>

        {covered.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-white">Täckta krav</h3>
            <ul className="space-y-2">
              {covered.map((item, i) => {
                const comp = item.competencyId ? competencyById.get(item.competencyId) : null
                const strength = STRENGTH_STYLE[item.strength] ?? null
                return (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-lg p-3"
                    style={{
                      backgroundColor: '#0d2b1a',
                      border: '1px solid #1a4d2e',
                    }}
                  >
                    <CheckIcon />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white">{item.requirement}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs" style={{ color: '#9ca3af' }}>
                        {comp && <span>→ {comp.title}</span>}
                        {!comp && item.competencyId && (
                          <span style={{ color: '#6b7280' }}>(kompetens ej i banken längre)</span>
                        )}
                        {strength && (
                          <span style={{ color: strength.color }}>
                            • Styrka: {strength.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {gaps.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-white">Gap att adressera</h3>
            <ul className="space-y-2">
              {gaps.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-lg p-3"
                  style={{
                    backgroundColor: '#2b1a0d',
                    border: '1px solid #4d2e1a',
                  }}
                >
                  <WarnIcon />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white">{item.requirement}</p>
                    {item.suggestion && (
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: '#f0a085' }}>
                        {item.suggestion}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {covered.length === 0 && gaps.length === 0 && (
          <p className="text-sm" style={{ color: '#6b7280' }}>
            Ingen gap-analys tillgänglig.
          </p>
        )}
      </section>

      {/* Questions grouped by category */}
      <section className="space-y-4">
        <SectionLabel>Intervjufrågor</SectionLabel>
        {grouped.length === 0 ? (
          <p className="text-sm" style={{ color: '#6b7280' }}>
            Inga frågor genererade.
          </p>
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => (
              <div key={group.key} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: group.color }}
                  />
                  <h3
                    className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: group.color }}
                  >
                    {group.label} ({group.items.length})
                  </h3>
                </div>
                <ul className="space-y-2">
                  {group.items.map((q) => (
                    <QuestionCard
                      key={q.id}
                      question={q}
                      competencyById={competencyById}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Simulation CTA (disabled for now) */}
      <div>
        <button
          disabled
          className="w-full py-3 rounded-lg text-sm font-semibold cursor-not-allowed"
          style={{
            backgroundColor: '#1a1d27',
            color: '#6b7280',
            border: '1px solid #2a2d3a',
          }}
          title="Kommer i nästa steg"
        >
          Starta intervjusimulering (kommer snart)
        </button>
      </div>
    </div>
  )
}

function QuestionCard({ question, competencyById }) {
  const [expanded, setExpanded] = useState(false)
  const relevantIds = question.relevantCompetencies ?? []
  const relevantComps = relevantIds
    .map((id) => competencyById.get(id))
    .filter(Boolean)

  return (
    <li
      className="rounded-xl border transition-colors cursor-pointer"
      style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-start justify-between gap-3 p-4">
        <p className="text-sm text-white leading-relaxed flex-1">{question.question}</p>
        <span className="shrink-0 mt-0.5" style={{ color: '#6b7280' }}>
          <ChevronIcon expanded={expanded} />
        </span>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: '#2a2d3a' }}>
          {question.rationale && (
            <div className="pt-3">
              <p
                className="text-xs uppercase tracking-wider font-semibold mb-1"
                style={{ color: '#4A6FA5' }}
              >
                Varför denna fråga
              </p>
              <p className="text-sm leading-relaxed" style={{ color: '#d1d5db' }}>
                {question.rationale}
              </p>
            </div>
          )}

          {relevantIds.length > 0 && (
            <div>
              <p
                className="text-xs uppercase tracking-wider font-semibold mb-1"
                style={{ color: '#4A6FA5' }}
              >
                Relevanta kompetenser
              </p>
              {relevantComps.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {relevantComps.map((c) => (
                    <span
                      key={c.docId}
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: '#1e2d45', color: '#7aa3d4' }}
                    >
                      {c.title}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs" style={{ color: '#6b7280' }}>
                  {relevantIds.join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  )
}

// ── Shared bits ───────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p
      className="text-xs font-semibold uppercase tracking-widest"
      style={{ color: '#4A6FA5' }}
    >
      {children}
    </p>
  )
}

function formatDate(ts) {
  if (!ts) return '—'
  // Firestore Timestamp objects expose toDate(); serverTimestamp pending → null
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('sv-SE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#4ade80"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 mt-0.5"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function WarnIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#f0a085"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 mt-0.5"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
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
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
