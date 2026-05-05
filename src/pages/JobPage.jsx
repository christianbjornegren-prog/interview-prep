import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore'
import { db, auth } from '../lib/firebase'
import { logger, CATEGORIES } from '../lib/logger'

const STRENGTH_STYLE = {
  hög:   { color: '#4ade80', label: 'Hög' },
  medel: { color: '#e9c46a', label: 'Medel' },
  låg:   { color: '#f87171', label: 'Låg' },
}

const TABS = [
  { key: 'preparation', label: 'Förberedelse' },
  { key: 'history',     label: 'Historik' },
]

const FOCUS_TO_CATEGORY = {
  Erfarenhet: 'erfarenhet',
  Kompetens: 'kompetens',
  Situation: 'situation',
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function JobPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()

  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [competencies, setCompetencies] = useState([])
  const [feedbacks, setFeedbacks] = useState([])
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(true)
  const [activeTab, setActiveTab] = useState('preparation')
  const [archiving, setArchiving] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [config, setConfig] = useState({ numQuestions: 5, focus: 'Mix', difficulty: 'Standard' })

  useEffect(() => {
    logger.info(CATEGORIES.APP, 'JobPage loaded', { jobId })
    const uid = auth.currentUser.uid
    const unsub = onSnapshot(doc(db, 'users', uid, 'jobs', jobId), (snap) => {
      setJob(snap.exists() ? { docId: snap.id, ...snap.data() } : null)
      setLoading(false)
    })
    return unsub
  }, [jobId])

  useEffect(() => {
    const uid = auth.currentUser.uid
    getDocs(collection(db, 'users', uid, 'competencies')).then((snap) => {
      setCompetencies(snap.docs.map((d) => ({ docId: d.id, ...d.data() })))
    })
  }, [])

  useEffect(() => {
    if (!jobId) return
    const uid = auth.currentUser.uid
    getDocs(
      query(
        collection(db, 'users', uid, 'jobs', jobId, 'feedback'),
        orderBy('createdAt', 'desc')
      )
    )
      .then((snap) => {
        setFeedbacks(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoadingFeedbacks(false)
      })
      .catch((err) => {
        console.error('Failed to load feedbacks:', err)
        setLoadingFeedbacks(false)
      })
  }, [jobId])

  const competencyById = useMemo(() => {
    const map = new Map()
    competencies.forEach((c) => map.set(c.id, c))
    return map
  }, [competencies])

  async function handleArchive() {
    if (!job) return
    setArchiving(true)
    try {
      const uid = auth.currentUser.uid
      await updateDoc(doc(db, 'users', uid, 'jobs', jobId), {
        archived: !job.archived,
      })
    } finally {
      setArchiving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm" style={{ color: '#6b7280' }}>Laddar uppdrag...</p>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/')}
          className="text-sm transition-colors"
          style={{ color: '#6b7280' }}
          onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
          onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
        >
          ← Tillbaka till alla uppdrag
        </button>
        <p className="text-sm" style={{ color: '#f87171' }}>
          Uppdraget hittades inte.
        </p>
      </div>
    )
  }

  const questions = job.questions ?? []
  const covered = job.gapAnalysis?.covered ?? []
  const gaps = job.gapAnalysis?.gaps ?? []
  const total = covered.length + gaps.length
  const scoreRatio = total > 0 ? covered.length / total : null
  const scoreColor =
    scoreRatio === null
      ? '#6b7280'
      : scoreRatio >= 0.7
      ? '#22c55e'
      : scoreRatio >= 0.4
      ? '#E9C46A'
      : '#ef4444'

  function startInterview() {
    setShowConfig(true)
  }

  function launchInterview() {
    const categoryKey = FOCUS_TO_CATEGORY[config.focus]
    const filtered = categoryKey
      ? questions.filter((q) => q.category === categoryKey)
      : questions
    const pool = filtered.length > 0 ? filtered : questions
    const selectedQuestions = pool.slice(0, config.numQuestions)
    navigate(`/intervju-tts/${jobId}`, {
      state: { ...config, selectedQuestions },
    })
  }

  return (
    <div className="space-y-6 pb-28">
      {/* Back */}
      <button
        onClick={() => navigate('/')}
        className="text-sm transition-colors"
        style={{ color: '#6b7280' }}
        onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
        onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
      >
        ← Tillbaka till alla uppdrag
      </button>

      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {job.jobTitle || 'Namnlös roll'}
            </h1>
            {job.company && (
              <p className="text-sm mt-1" style={{ color: '#9ca3af' }}>
                {job.company}
              </p>
            )}
          </div>
          {scoreRatio !== null && (
            <span
              className="text-sm font-semibold px-3 py-1.5 rounded-full"
              style={{
                backgroundColor: scoreColor + '20',
                color: scoreColor,
                border: `1px solid ${scoreColor}40`,
              }}
            >
              {covered.length} av {total} krav täckta
            </span>
          )}
        </div>

        <button
          onClick={startInterview}
          disabled={questions.length === 0}
          className="flex items-center gap-2 px-5 py-3 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ backgroundColor: '#2A9D8F' }}
          onMouseOver={(e) => {
            if (questions.length > 0) e.currentTarget.style.backgroundColor = '#34b8a8'
          }}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#2A9D8F')}
        >
          🎙 Starta intervjuträning
        </button>
      </div>

      {showConfig ? (
        <InterviewConfigScreen
          config={config}
          onChange={setConfig}
          questions={questions}
          onStart={launchInterview}
          onBack={() => setShowConfig(false)}
        />
      ) : (
        <>
          {/* Tabs */}
          <div className="border-b" style={{ borderColor: '#2a2d3a' }}>
            <div className="flex gap-1">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="px-4 py-2.5 text-sm font-medium transition-colors"
                  style={{
                    color: activeTab === tab.key ? '#fff' : '#6b7280',
                    borderBottom:
                      activeTab === tab.key
                        ? '2px solid #4A6FA5'
                        : '2px solid transparent',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          {activeTab === 'preparation' && (
            <PrepTab
              job={job}
              covered={covered}
              gaps={gaps}
              competencyById={competencyById}
            />
          )}
          {activeTab === 'history' && (
            <HistoryTab
              feedbacks={feedbacks}
              loading={loadingFeedbacks}
              hasQuestions={questions.length > 0}
              onNavigate={(fId) => navigate(`/feedback/${jobId}/${fId}`)}
              onStartInterview={startInterview}
            />
          )}

          {/* Archive link */}
          <div className="pt-6 border-t" style={{ borderColor: '#1e2030' }}>
            <button
              onClick={handleArchive}
              disabled={archiving}
              className="text-xs transition-colors disabled:opacity-40"
              style={{ color: '#4b5563' }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#9ca3af')}
              onMouseOut={(e) => (e.currentTarget.style.color = '#4b5563')}
            >
              {archiving
                ? 'Sparar...'
                : job.archived
                ? 'Återställ uppdrag'
                : 'Arkivera uppdrag'}
            </button>
          </div>

          {/* Sticky footer CTA */}
          <div
            className="fixed bottom-0 left-0 right-0 border-t flex items-center justify-center px-6 py-4"
            style={{ backgroundColor: '#0f1117cc', backdropFilter: 'blur(8px)', borderColor: '#2a2d3a' }}
          >
            <button
              onClick={startInterview}
              disabled={questions.length === 0}
              className="flex items-center gap-2 px-8 py-3 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#2A9D8F' }}
              onMouseOver={(e) => {
                if (questions.length > 0) e.currentTarget.style.backgroundColor = '#34b8a8'
              }}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#2A9D8F')}
            >
              🎙 Starta intervjuträning
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Tab: Förberedelse ─────────────────────────────────────────────────────

const MAX_VISIBLE = 5

function PrepTab({ job, covered, gaps, competencyById }) {
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  const [showAllCovered, setShowAllCovered] = useState(false)
  const [showAllGaps, setShowAllGaps] = useState(false)

  const visibleCovered = showAllCovered ? covered : covered.slice(0, MAX_VISIBLE)
  const visibleGaps = showAllGaps ? gaps : gaps.slice(0, MAX_VISIBLE)

  return (
    <div className="space-y-6">
      {/* Job summary */}
      {job.summary && (
        <div>
          <SectionLabel>Jobbeskrivning</SectionLabel>
          <p
            className="text-sm leading-relaxed"
            style={{
              color: '#d1d5db',
              display: '-webkit-box',
              WebkitLineClamp: summaryExpanded ? 'unset' : 3,
              WebkitBoxOrient: 'vertical',
              overflow: summaryExpanded ? 'visible' : 'hidden',
            }}
          >
            {job.summary}
          </p>
          {job.summary.length > 160 && (
            <button
              onClick={() => setSummaryExpanded((v) => !v)}
              className="text-xs mt-1 transition-colors"
              style={{ color: '#4A6FA5' }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#7aa3d4')}
              onMouseOut={(e) => (e.currentTarget.style.color = '#4A6FA5')}
            >
              {summaryExpanded ? 'Visa mindre' : 'Visa mer'}
            </button>
          )}
        </div>
      )}

      {/* Covered requirements */}
      {covered.length > 0 && (
        <div>
          <SectionLabel>Täckta krav</SectionLabel>
          <ul className="space-y-2">
            {visibleCovered.map((item, i) => (
              <CoveredRow key={i} item={item} competencyById={competencyById} />
            ))}
          </ul>
          {covered.length > MAX_VISIBLE && (
            <button
              onClick={() => setShowAllCovered((v) => !v)}
              className="text-xs mt-2 transition-colors"
              style={{ color: '#4A6FA5' }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#7aa3d4')}
              onMouseOut={(e) => (e.currentTarget.style.color = '#4A6FA5')}
            >
              {showAllCovered ? 'Visa färre' : `Visa alla ${covered.length}`}
            </button>
          )}
        </div>
      )}

      {/* Gaps */}
      {gaps.length > 0 && (
        <div>
          <SectionLabel>Gap att adressera</SectionLabel>
          <ul className="space-y-2">
            {visibleGaps.map((item, i) => (
              <GapRow key={i} item={item} />
            ))}
          </ul>
          {gaps.length > MAX_VISIBLE && (
            <button
              onClick={() => setShowAllGaps((v) => !v)}
              className="text-xs mt-2 transition-colors"
              style={{ color: '#E9C46A' }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#f0d48a')}
              onMouseOut={(e) => (e.currentTarget.style.color = '#E9C46A')}
            >
              {showAllGaps ? 'Visa färre' : `Visa alla ${gaps.length}`}
            </button>
          )}
        </div>
      )}

      {covered.length === 0 && gaps.length === 0 && (
        <p className="text-sm" style={{ color: '#6b7280' }}>
          Ingen gap-analys tillgänglig.
        </p>
      )}
    </div>
  )
}

function CoveredRow({ item, competencyById }) {
  const [expanded, setExpanded] = useState(false)
  const comp = item.competencyId ? competencyById.get(item.competencyId) : null
  const strength = STRENGTH_STYLE[item.strength] ?? null

  return (
    <li
      className="rounded-lg p-3 cursor-pointer"
      style={{ backgroundColor: '#0d2b1a', border: '1px solid #1a4d2e' }}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-start gap-3">
        <CheckIcon />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white">{item.requirement}</p>
          {expanded && (comp || strength) && (
            <div
              className="flex flex-wrap items-center gap-2 mt-1 text-xs"
              style={{ color: '#9ca3af' }}
            >
              {comp && <span>→ {comp.title}</span>}
              {!comp && item.competencyId && (
                <span style={{ color: '#6b7280' }}>(kompetens ej i banken längre)</span>
              )}
              {strength && (
                <span style={{ color: strength.color }}>• Styrka: {strength.label}</span>
              )}
            </div>
          )}
        </div>
        <ChevronIcon expanded={expanded} />
      </div>
    </li>
  )
}

function GapRow({ item }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <li
      className="rounded-lg p-3 cursor-pointer"
      style={{ backgroundColor: '#2b1a0d', border: '1px solid #4d2e1a' }}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-start gap-3">
        <WarnIcon />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white">{item.requirement}</p>
          {expanded && item.suggestion && (
            <p className="text-xs mt-1 leading-relaxed" style={{ color: '#f0a085' }}>
              {item.suggestion}
            </p>
          )}
        </div>
        {item.suggestion && <ChevronIcon expanded={expanded} />}
      </div>
    </li>
  )
}

// ── Tab: Historik ─────────────────────────────────────────────────────────

function HistoryTab({ feedbacks, loading, hasQuestions, onNavigate, onStartInterview }) {
  if (loading) {
    return (
      <p className="text-sm" style={{ color: '#6b7280' }}>
        Laddar...
      </p>
    )
  }

  if (feedbacks.length === 0) {
    return (
      <div className="text-center py-8 space-y-4">
        <p className="text-sm" style={{ color: '#6b7280' }}>
          Du har inte tränat på detta uppdrag ännu. Starta din första intervju!
        </p>
        <button
          onClick={onStartInterview}
          disabled={!hasQuestions}
          className="flex items-center gap-2 mx-auto px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-60"
          style={{ backgroundColor: '#2A9D8F' }}
          onMouseOver={(e) => {
            if (hasQuestions) e.currentTarget.style.backgroundColor = '#34b8a8'
          }}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#2A9D8F')}
        >
          🎙 Starta intervjuträning
        </button>
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {feedbacks.map((feedback) => {
        const scoreColor =
          feedback.overallScore >= 4
            ? '#22c55e'
            : feedback.overallScore >= 3
            ? '#E9C46A'
            : '#ef4444'

        return (
          <li key={feedback.id}>
            <button
              onClick={() => onNavigate(feedback.id)}
              className="w-full text-left rounded-xl border p-4 transition-colors flex items-center justify-between gap-4"
              style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
              onMouseOver={(e) => (e.currentTarget.style.borderColor = '#4A6FA5')}
              onMouseOut={(e) => (e.currentTarget.style.borderColor = '#2a2d3a')}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">
                  {feedback.createdAt
                    ? new Date(feedback.createdAt.toDate()).toLocaleDateString(
                        'sv-SE',
                        { year: 'numeric', month: 'long', day: 'numeric' }
                      )
                    : 'Datum okänt'}
                </p>
                {feedback.interviewer && (
                  <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
                    Intervjuare: {feedback.interviewer}
                  </p>
                )}
              </div>
              <div
                className="flex items-center justify-center rounded-full shrink-0"
                style={{
                  width: 48,
                  height: 48,
                  backgroundColor: scoreColor + '20',
                  border: `2px solid ${scoreColor}`,
                }}
              >
                <span
                  className="text-lg font-bold"
                  style={{ color: scoreColor }}
                >
                  {feedback.overallScore}
                </span>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ── Interview Config Screen ───────────────────────────────────────────────

const CAT_META = {
  erfarenhet: { label: 'Erfarenhet', color: '#4A6FA5' },
  kompetens:  { label: 'Kompetens',  color: '#2A9D8F' },
  situation:  { label: 'Situation',  color: '#E9C46A' },
  motivation: { label: 'Motivation', color: '#7C5CBF' },
}

const DIFFICULTY_COLOR = {
  Avslappnad: '#22c55e',
  Standard:   '#E9C46A',
  Hård:       '#ef4444',
}

function OptionGroup({ label, options, value, onChange }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#4A6FA5' }}>
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={
              value === opt
                ? { backgroundColor: '#4A6FA5', color: '#fff' }
                : { backgroundColor: '#1e2030', color: '#9ca3af' }
            }
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

function InterviewConfigScreen({ config, onChange, questions, onStart, onBack }) {
  const categoryKey = FOCUS_TO_CATEGORY[config.focus]
  const filtered = categoryKey
    ? questions.filter((q) => q.category === categoryKey)
    : questions
  const pool = filtered.length > 0 ? filtered : questions
  const previewQuestions = pool.slice(0, config.numQuestions)
  const diffColor = DIFFICULTY_COLOR[config.difficulty] ?? '#9ca3af'

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={onBack}
        className="text-sm transition-colors"
        style={{ color: '#6b7280' }}
        onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
        onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
      >
        ← Tillbaka
      </button>

      <h2 className="text-xl font-bold text-white tracking-tight">Konfigurera intervjun</h2>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Left – settings */}
        <div className="space-y-6">
          <OptionGroup
            label="Antal frågor"
            options={[3, 5, 8]}
            value={config.numQuestions}
            onChange={(v) => onChange((c) => ({ ...c, numQuestions: v }))}
          />
          <OptionGroup
            label="Fokus"
            options={['Mix', 'Erfarenhet', 'Kompetens', 'Situation']}
            value={config.focus}
            onChange={(v) => onChange((c) => ({ ...c, focus: v }))}
          />
          <OptionGroup
            label="Svårighetsgrad"
            options={['Avslappnad', 'Standard', 'Hård']}
            value={config.difficulty}
            onChange={(v) => onChange((c) => ({ ...c, difficulty: v }))}
          />
          <button
            onClick={onStart}
            disabled={previewQuestions.length === 0}
            className="w-full py-3 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#2A9D8F' }}
            onMouseOver={(e) => {
              if (previewQuestions.length > 0) e.currentTarget.style.backgroundColor = '#34b8a8'
            }}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#2A9D8F')}
          >
            🎙 Starta intervju
          </button>
        </div>

        {/* Right – question preview */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#4A6FA5' }}>
            Frågor som ingår ({previewQuestions.length})
          </p>
          {previewQuestions.length === 0 ? (
            <p className="text-sm" style={{ color: '#6b7280' }}>
              Inga frågor matchar valt fokus.
            </p>
          ) : (
            <ul className="space-y-2">
              {previewQuestions.map((q, i) => {
                const cat = CAT_META[q.category]
                return (
                  <li
                    key={i}
                    className="rounded-lg border p-3 space-y-2"
                    style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
                  >
                    <div className="flex items-center gap-2">
                      {cat && (
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: cat.color + '20', color: cat.color }}
                        >
                          {cat.label}
                        </span>
                      )}
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: diffColor + '20', color: diffColor }}
                      >
                        {config.difficulty}
                      </span>
                    </div>
                    <p className="text-sm text-white leading-relaxed">{q.question}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p
      className="text-xs font-semibold uppercase tracking-widest mb-3"
      style={{ color: '#4A6FA5' }}
    >
      {children}
    </p>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────

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
      className="shrink-0"
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
