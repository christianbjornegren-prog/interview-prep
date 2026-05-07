import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
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
import { useUser } from '../components/AuthGate'
import { analyzeJobPosting, sanitizeCompetencies } from '../lib/claude'

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
  const location = useLocation()
  const { role } = useUser()

  const targetUid = location.state?.targetUid ?? null
  const pendingEmail = location.state?.pendingEmail ?? null
  const uid = targetUid ?? auth.currentUser.uid
  const isSaljare = role === 'saljare'
  const isReadOnly = isSaljare || !!pendingEmail

  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [feedbacks, setFeedbacks] = useState([])
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(true)
  const [activeTab, setActiveTab] = useState('preparation')
  const [archiving, setArchiving] = useState(false)
  const [refreshingGap, setRefreshingGap] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [config, setConfig] = useState({ numQuestions: 5, focus: 'Mix', difficulty: 'Standard' })

  useEffect(() => {
    if (pendingEmail) {
      const unsub = onSnapshot(doc(db, 'pendingProfiles', pendingEmail), (snap) => {
        if (snap.exists()) {
          const found = (snap.data().jobs ?? []).find((j) => j.id === jobId)
          setJob(found ? { docId: jobId, ...found } : null)
        } else {
          setJob(null)
        }
        setLoading(false)
      })
      return unsub
    }
    const unsub = onSnapshot(doc(db, 'users', uid, 'jobs', jobId), (snap) => {
      setJob(snap.exists() ? { docId: snap.id, ...snap.data() } : null)
      setLoading(false)
    })
    return unsub
  }, [jobId, uid, pendingEmail])

  useEffect(() => {
    if (!jobId || isReadOnly) return
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
  }, [jobId, uid, isSaljare])

  async function handleArchive() {
    if (!job) return
    setArchiving(true)
    try {
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

  async function handleRefreshGap() {
    if (!job || refreshingGap) return
    setRefreshingGap(true)
    try {
      const compSnap = await getDocs(collection(db, 'users', uid, 'competencies'))
      const latestComps = compSnap.docs.map((d) => d.data())
      const result = await analyzeJobPosting(
        job.rawJobText ?? job.summary ?? '',
        '',
        sanitizeCompetencies(latestComps)
      )
      await updateDoc(doc(db, 'users', uid, 'jobs', jobId), {
        gapAnalysis: result.gapAnalysis,
      })
    } catch (err) {
      console.error('Kunde inte uppdatera gap-analys:', err)
    } finally {
      setRefreshingGap(false)
    }
  }

  const backPath = pendingEmail
    ? `/konsulter/pending/${encodeURIComponent(pendingEmail)}`
    : targetUid ? `/konsulter/${targetUid}` : '/'
  const backLabel = pendingEmail
    ? '← Tillbaka till väntande profil'
    : targetUid ? '← Tillbaka till konsultprofil' : '← Tillbaka till alla uppdrag'

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate(backPath)}
        className="text-sm transition-colors"
        style={{ color: '#6b7280' }}
        onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
        onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
      >
        {backLabel}
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

        {!isReadOnly && (
          <button
            onClick={startInterview}
            disabled={questions.length === 0}
            className="flex items-center gap-2 px-5 py-3 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#8064ad' }}
            onMouseOver={(e) => {
              if (questions.length > 0) e.currentTarget.style.backgroundColor = '#9781be'
            }}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#8064ad')}
          >
            🎙 Starta intervjuträning
          </button>
        )}
      </div>

      {!isReadOnly && showConfig ? (
        <InterviewConfigScreen
          config={config}
          onChange={setConfig}
          questions={questions}
          onStart={launchInterview}
          onBack={() => setShowConfig(false)}
        />
      ) : (
        <>
          {/* Tabs – only for konsult/admin */}
          {!isReadOnly && (
            <div className="border-b" style={{ borderColor: '#404040' }}>
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
                          ? '2px solid #8064ad'
                          : '2px solid transparent',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tab content */}
          {(isReadOnly || activeTab === 'preparation') && (
            <PrepTab
              job={job}
              covered={covered}
              gaps={gaps}
              onRefreshGap={pendingEmail ? null : handleRefreshGap}
              refreshingGap={refreshingGap}
            />
          )}
          {!isReadOnly && activeTab === 'history' && (
            <HistoryTab
              feedbacks={feedbacks}
              loading={loadingFeedbacks}
              hasQuestions={questions.length > 0}
              onNavigate={(fId) => navigate(`/feedback/${jobId}/${fId}`)}
              onStartInterview={startInterview}
            />
          )}

          {/* Archive link – only for the job owner */}
          {!isReadOnly && (
            <div className="pt-6 border-t" style={{ borderColor: '#323232' }}>
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
          )}

        </>
      )}
    </div>
  )
}

// ── Tab: Förberedelse ─────────────────────────────────────────────────────

const MAX_VISIBLE = 5

const STRENGTH_ORDER = { hög: 0, medel: 1, låg: 2 }

// ── Job text parser ───────────────────────────────────────────────────────

function parseJobText(text) {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean)
  const blocks = []
  let inListContext = false

  for (const line of lines) {
    const isHeading = !/[a-zåäö]/.test(line) && /[A-ZÅÄÖ]/.test(line) && line.length >= 4 && line.length < 70
    const isSubheading = line.endsWith(':') && line.length < 120
    const isBullet = /^[-•*–·▸▪]\s/.test(line)

    if (isHeading) {
      inListContext = false
      blocks.push({ type: 'heading', text: line })
    } else if (isSubheading) {
      inListContext = true
      blocks.push({ type: 'subheading', text: line })
    } else if (isBullet) {
      const cleanText = line.replace(/^[-•*–·▸▪]\s*/, '')
      const last = blocks[blocks.length - 1]
      if (last?.type === 'list') last.items.push(cleanText)
      else blocks.push({ type: 'list', items: [cleanText] })
      inListContext = false
    } else if (inListContext && line.length < 120) {
      const last = blocks[blocks.length - 1]
      if (last?.type === 'list') last.items.push(line)
      else blocks.push({ type: 'list', items: [line] })
    } else {
      inListContext = false
      const last = blocks[blocks.length - 1]
      if (last?.type === 'paragraph') last.text += ' ' + line
      else blocks.push({ type: 'paragraph', text: line })
    }
  }

  return blocks
}

function JobTextBlocks({ blocks }) {
  return (
    <div className="space-y-1">
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          return (
            <p
              key={i}
              className="text-xs font-semibold uppercase tracking-widest mt-4 mb-1"
              style={{ color: '#8064ad' }}
            >
              {block.text}
            </p>
          )
        }
        if (block.type === 'subheading') {
          return (
            <p key={i} className="text-sm font-semibold mt-3 mb-1 text-white">
              {block.text}
            </p>
          )
        }
        if (block.type === 'list') {
          return (
            <ul key={i} className="space-y-0.5 my-1">
              {block.items.map((item, j) => (
                <li key={j} className="flex gap-2 text-sm leading-relaxed" style={{ color: '#d1d5db' }}>
                  <span className="shrink-0 mt-0.5" style={{ color: '#8064ad' }}>•</span>
                  {item}
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i} className="text-sm leading-relaxed" style={{ color: '#d1d5db' }}>
            {block.text}
          </p>
        )
      })}
    </div>
  )
}

function PrepTab({ job, covered, gaps, onRefreshGap, refreshingGap }) {
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  const [showAllCovered, setShowAllCovered] = useState(false)
  const [showAllGaps, setShowAllGaps] = useState(false)

  useEffect(() => {
    if (covered.length === 0) return
    console.log('[CoveredRow debug] covered items:', covered.map((c) => ({
      requirement: c.requirement,
      competencyName: c.competencyName ?? '(saknas)',
      strength: c.strength ?? '(saknas)',
    })))
  }, [covered])

  const sortedCovered = useMemo(
    () => [...covered].sort((a, b) => {
      const aOrder = STRENGTH_ORDER[a.strength?.toLowerCase()] ?? 3
      const bOrder = STRENGTH_ORDER[b.strength?.toLowerCase()] ?? 3
      return aOrder - bOrder
    }),
    [covered]
  )

  const visibleCovered = showAllCovered ? sortedCovered : sortedCovered.slice(0, MAX_VISIBLE)
  const visibleGaps = showAllGaps ? gaps : gaps.slice(0, MAX_VISIBLE)

  const rawText = job.rawJobText || job.description || job.jobDescription || ''
  const PREVIEW_CHARS = 300

  const previewText = useMemo(() => {
    if (rawText.length <= PREVIEW_CHARS) return rawText
    const cut = rawText.indexOf(' ', PREVIEW_CHARS)
    return cut === -1 ? rawText.slice(0, PREVIEW_CHARS) : rawText.slice(0, cut)
  }, [rawText])

  // Replace ". " with ".\n\n" so sentences become readable paragraphs when expanded
  const fullText  = useMemo(() => rawText.replace(/\. /g, '.\n\n'), [rawText])
  const descHasMore = rawText.length > PREVIEW_CHARS

  return (
    <div className="space-y-6">
      {/* Job description */}
      {rawText.length > 0 && (
        <div>
          <SectionLabel>Uppdragsbeskrivning</SectionLabel>
          {summaryExpanded ? (
            <>
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#d1d5db' }}>
                {fullText}
              </p>
              <button
                onClick={() => setSummaryExpanded(false)}
                className="text-xs mt-3 transition-colors"
                style={{ color: '#8064ad' }}
                onMouseOver={(e) => (e.currentTarget.style.color = '#b19ae0')}
                onMouseOut={(e) => (e.currentTarget.style.color = '#8064ad')}
              >
                Läs mindre ←
              </button>
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed" style={{ color: '#d1d5db' }}>
                {previewText}{descHasMore ? '…' : ''}
              </p>
              {descHasMore && (
                <button
                  onClick={() => setSummaryExpanded(true)}
                  className="text-xs mt-2 transition-colors"
                  style={{ color: '#8064ad' }}
                  onMouseOver={(e) => (e.currentTarget.style.color = '#b19ae0')}
                  onMouseOut={(e) => (e.currentTarget.style.color = '#8064ad')}
                >
                  Läs mer →
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Gap analysis header – always visible */}
      <div className="flex items-center justify-between gap-3">
        <SectionLabel noMargin>Gap-analys</SectionLabel>
        {onRefreshGap && (
          <button
            onClick={onRefreshGap}
            disabled={refreshingGap}
            className="text-xs transition-colors disabled:opacity-40 shrink-0"
            style={{ color: '#6b7280' }}
            onMouseOver={(e) => !refreshingGap && (e.currentTarget.style.color = '#fff')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
          >
            🔄 Uppdatera gap-analys
          </button>
        )}
      </div>

      {refreshingGap && (
        <p className="text-xs -mt-4" style={{ color: '#9ca3af' }}>
          Analyserar mot din uppdaterade kompetensbank...
        </p>
      )}

      {/* Covered requirements */}
      {covered.length > 0 && (
        <div>
          <SectionLabel>Täckta krav</SectionLabel>
          <ul className="space-y-2">
            {visibleCovered.map((item, i) => (
              <CoveredRow key={i} item={item} />
            ))}
          </ul>
          {covered.length > MAX_VISIBLE && (
            <button
              onClick={() => setShowAllCovered((v) => !v)}
              className="text-xs mt-2 transition-colors"
              style={{ color: '#8064ad' }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#b19ae0')}
              onMouseOut={(e) => (e.currentTarget.style.color = '#8064ad')}
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

      {covered.length === 0 && gaps.length === 0 && !refreshingGap && (
        <p className="text-sm -mt-4" style={{ color: '#6b7280' }}>
          Ingen gap-analys tillgänglig än.
        </p>
      )}
    </div>
  )
}

function CoveredRow({ item }) {
  const [expanded, setExpanded] = useState(false)
  const strength = STRENGTH_STYLE[item.strength?.toLowerCase()] ?? null
  const name = item.competencyName?.trim() || null

  return (
    <li
      className="rounded-lg p-3 cursor-pointer"
      style={{ backgroundColor: '#0d2b1a', border: '1px solid #1a4d2e' }}
      onClick={() => name ? setExpanded((v) => !v) : undefined}
    >
      <div className="flex items-start gap-3">
        <CheckIcon />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white">{item.requirement}</p>
          {expanded && name && (
            <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>→ {name}</p>
          )}
        </div>
        {strength && (
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 self-center"
            style={{
              backgroundColor: strength.color + '20',
              color: strength.color,
              border: `1px solid ${strength.color}40`,
            }}
          >
            {strength.label}
          </span>
        )}
        {name && <ChevronIcon expanded={expanded} />}
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
          style={{ backgroundColor: '#8064ad' }}
          onMouseOver={(e) => {
            if (hasQuestions) e.currentTarget.style.backgroundColor = '#9781be'
          }}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#8064ad')}
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
              style={{ backgroundColor: '#1d1d1d', borderColor: '#404040' }}
              onMouseOver={(e) => (e.currentTarget.style.borderColor = '#8064ad')}
              onMouseOut={(e) => (e.currentTarget.style.borderColor = '#404040')}
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
  erfarenhet: { label: 'Erfarenhet', color: '#8064ad' },
  kompetens:  { label: 'Kompetens',  color: '#8064ad' },
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
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8064ad' }}>
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
                ? { backgroundColor: '#8064ad', color: '#fff' }
                : { backgroundColor: '#323232', color: '#9ca3af' }
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
            style={{ backgroundColor: '#8064ad' }}
            onMouseOver={(e) => {
              if (previewQuestions.length > 0) e.currentTarget.style.backgroundColor = '#9781be'
            }}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#8064ad')}
          >
            🎙 Starta intervju
          </button>
        </div>

        {/* Right – question preview */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8064ad' }}>
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
                    style={{ backgroundColor: '#1d1d1d', borderColor: '#404040' }}
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

function SectionLabel({ children, noMargin }) {
  return (
    <p
      className={`text-xs font-semibold uppercase tracking-widest${noMargin ? '' : ' mb-3'}`}
      style={{ color: '#8064ad' }}
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
