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
import { resolveRequirements, deriveGapBuckets } from '../lib/gapAnalysis'
import { parseJobDescription, resolveQuickFacts } from '../lib/jobDescription'

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
        requirements: result.requirements ?? [],
        summary: result.summary ?? job.summary ?? '',
        sections: result.sections ?? [],
        quickFacts: result.quickFacts ?? null,
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
    // Desktop-first executive briefing: bryt ut ur appens smala max-w-5xl och
    // bli bredare (~1200px), centrerad. Gäller ENBART uppdragsvyn.
    <div className="relative left-1/2 -translate-x-1/2 w-[min(1200px,100vw-2rem)] space-y-6">
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

      {/* Header: titel + kund vänster, Starta höger */}
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

        {!isReadOnly && (
          <button
            onClick={startInterview}
            disabled={questions.length === 0}
            className="shrink-0 flex items-center gap-2 px-5 py-3 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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

// ── Wayfinding (ikon + färg per metric/sektion) ───────────────────────────
// Ikonbrickor: ljus bakgrund + mörk ikon (läsbart). Stora siffervärden i vyn
// använder LJUSA semantiska färger (CSS-vars / #8064ad) – aldrig dessa mörka hex.

const WF = {
  coverage:   { badgeBg: '#EEEDFE', iconColor: '#26215C', icon: (s) => <TiChartPie size={s} /> },
  prioritera: { badgeBg: '#FAEEDA', iconColor: '#854F0B', icon: (s) => <TiFlag size={s} /> },
  forbered:   { badgeBg: '#F1EFE8', iconColor: '#444441', icon: (s) => <TiListCheck size={s} /> },
  styrkor:    { badgeBg: '#EAF3DE', iconColor: '#27500A', icon: (s) => <TiStar size={s} /> },
}

function IconBadge({ bg, color, size = 32, children }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-lg shrink-0"
      style={{ width: size, height: size, backgroundColor: bg, color }}
    >
      {children}
    </span>
  )
}

function SectionHeading({ wf, title, count, titleColor }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <IconBadge bg={wf.badgeBg} color={wf.iconColor} size={28}>{wf.icon(16)}</IconBadge>
      <h3 className="text-sm font-semibold" style={{ color: titleColor }}>
        {title}
        {count != null && <span className="font-normal" style={{ color: '#6b7280' }}> · {count}</span>}
      </h3>
    </div>
  )
}

// Smooth-scrolla till en sektion och blinka kort (wayfinding från metric-korten)
function scrollToSection(id) {
  if (typeof document === 'undefined') return
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  el.classList.remove('section-flash')
  void el.offsetWidth // restart animation
  el.classList.add('section-flash')
  window.setTimeout(() => el.classList.remove('section-flash'), 1300)
}

function DescriptionView({ blocks }) {
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        if (b.type === 'heading') {
          return <p key={i} className="text-sm font-semibold text-white mt-4 mb-1">{b.text}</p>
        }
        if (b.type === 'list') {
          return (
            <ul key={i} className="space-y-0.5 my-1">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-2 text-sm leading-relaxed" style={{ color: '#d1d5db' }}>
                  <span className="shrink-0 mt-0.5" style={{ color: '#8064ad' }}>•</span>
                  {it}
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i} className="text-sm leading-relaxed whitespace-pre-line" style={{ color: '#d1d5db' }}>
            {b.text}
          </p>
        )
      })}
    </div>
  )
}

function PrepTab({ job, onRefreshGap, refreshingGap }) {
  const requirements = resolveRequirements(job)
  const buckets = deriveGapBuckets(requirements)
  const hasReqs = buckets.total > 0
  const metrics = {
    coveragePct: Math.round(buckets.coverage * 100),
    strong: buckets.styrkor.length,
    total: buckets.total,
    prioritize: buckets.prioritera.length,
    prepare: buckets.förbered.length,
    strengths: buckets.styrkor.length,
  }

  const sections = Array.isArray(job.sections) ? job.sections : []
  const rawText = job.rawJobText || job.description || job.jobDescription || ''
  const descBlocks = useMemo(() => parseJobDescription(rawText), [rawText])
  const quickFacts = resolveQuickFacts(job)
  const summary = (job.summary ?? '').trim()
  const hasDescription = sections.length > 0 || descBlocks.length > 0

  return (
    <div className="space-y-8">
      {/* b. AI-summering + refresh */}
      <div className="flex items-start justify-between gap-6">
        {summary
          ? <p className="text-sm leading-relaxed max-w-3xl" style={{ color: '#d1d5db' }}>{summary}</p>
          : <span />}
        {onRefreshGap && (
          <button
            onClick={onRefreshGap}
            disabled={refreshingGap}
            className="text-xs transition-colors disabled:opacity-40 shrink-0"
            style={{ color: '#6b7280' }}
            onMouseOver={(e) => !refreshingGap && (e.currentTarget.style.color = '#fff')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
          >
            🔄 Uppdatera analys
          </button>
        )}
      </div>

      {refreshingGap && (
        <p className="text-xs" style={{ color: '#9ca3af' }}>
          Analyserar mot din uppdaterade kompetensbank...
        </p>
      )}

      {/* c. quick facts som pills */}
      {quickFacts.length > 0 && <QuickFactPills facts={quickFacts} />}

      {hasReqs ? (
        <>
          {/* d. metric-rad */}
          <MetricRow metrics={metrics} onJump={scrollToSection} />

          {/* e. prioritera, f. förbered, g. styrkor – allt fullbredd */}
          <section id="sec-prioritera" className="scroll-mt-4">
            <PrioritizeSection items={buckets.prioritera} />
          </section>
          <section id="sec-forbered" className="scroll-mt-4">
            <PrepareSection items={buckets.förbered} />
          </section>
          <section id="sec-styrkor" className="scroll-mt-4">
            <StrengthsSection items={buckets.styrkor} />
          </section>
        </>
      ) : !refreshingGap ? (
        <p className="text-sm" style={{ color: '#6b7280' }}>
          Ingen analys tillgänglig än.
        </p>
      ) : null}

      {/* h. hela uppdragsbeskrivningen längst ned */}
      {hasDescription && (
        <section id="sec-beskrivning" className="scroll-mt-4 pt-6 border-t" style={{ borderColor: '#323232' }}>
          <SectionLabel>Hela uppdragsbeskrivningen</SectionLabel>
          {sections.length > 0 ? (
            <StructuredSections sections={sections} />
          ) : (
            <DescriptionView blocks={descBlocks} />
          )}
        </section>
      )}
    </div>
  )
}

// ── d. Metric-rad (klickbara wayfinding-kort) ─────────────────────────────

function MetricRow({ metrics, onJump }) {
  const { coveragePct, strong, total, prioritize, prepare, strengths } = metrics
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <MetricCard
        wf={WF.coverage} label="Kravtäckning" value={`${coveragePct}%`}
        valueColor="#8064ad" sub={`${strong} av ${total} krav starkt matchade`}
        onActivate={() => onJump('sec-beskrivning')}
      >
        <div className="mt-2 w-full rounded-full h-1.5" style={{ backgroundColor: '#404040' }}>
          <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${coveragePct}%`, backgroundColor: '#8064ad' }} />
        </div>
      </MetricCard>
      <MetricCard
        wf={WF.prioritera} label="Att prioritera" value={prioritize}
        valueColor="var(--color-text-warning)" sub="svag matchning på viktiga krav"
        onActivate={() => onJump('sec-prioritera')}
      />
      <MetricCard
        wf={WF.forbered} label="Att förbereda" value={prepare}
        valueColor="#fff" sub="delvis matchning"
        onActivate={() => onJump('sec-forbered')}
      />
      <MetricCard
        wf={WF.styrkor} label="Dina styrkor" value={strengths}
        valueColor="var(--color-text-success)" sub="stark matchning"
        onActivate={() => onJump('sec-styrkor')}
      />
    </div>
  )
}

function MetricCard({ wf, label, value, valueColor, sub, onActivate, children }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${label}: ${value}. Hoppa till sektionen.`}
      onClick={onActivate}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate() } }}
      className="rounded-xl border p-4 cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-[#8064ad]"
      style={{ backgroundColor: '#1d1d1d', borderColor: '#404040' }}
      onMouseOver={(e) => (e.currentTarget.style.borderColor = '#8064ad')}
      onMouseOut={(e) => (e.currentTarget.style.borderColor = '#404040')}
    >
      <div className="flex items-start justify-between">
        <IconBadge bg={wf.badgeBg} color={wf.iconColor} size={32}>{wf.icon(18)}</IconBadge>
        <TiChevronDown size={16} color="#6b7280" />
      </div>
      <p className="text-xs font-medium mt-3" style={{ color: '#6b7280' }}>{label}</p>
      <p className="text-3xl font-bold mt-0.5" style={{ color: valueColor }}>{value}</p>
      {children}
      {sub && <p className="text-xs mt-1.5" style={{ color: '#6b7280' }}>{sub}</p>}
    </div>
  )
}

// ── c. Quick facts pills ──────────────────────────────────────────────────

function QuickFactPills({ facts }) {
  return (
    <div className="flex flex-wrap gap-2">
      {facts.map((f, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
          style={{ backgroundColor: '#1d1d1d', border: '1px solid #404040' }}
        >
          <span className="font-medium" style={{ color: '#6b7280' }}>{f.label}:</span>
          <span style={{ color: '#d1d5db' }}>{f.value}</span>
        </span>
      ))}
    </div>
  )
}

// ── e. Prioritera dessa ───────────────────────────────────────────────────

function MetaPill({ label, value }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
      style={{ backgroundColor: '#1d1d1d', border: '1px solid #404040' }}
    >
      <span style={{ color: '#6b7280' }}>{label}:</span>
      <span className="font-medium" style={{ color: '#d1d5db' }}>{value}</span>
    </span>
  )
}

function PrioritizeSection({ items }) {
  return (
    <div>
      <SectionHeading wf={WF.prioritera} title="Prioritera dessa" count={items.length} titleColor="var(--color-text-warning)" />
      {items.length === 0 ? (
        <div className="rounded-xl border p-4" style={{ backgroundColor: '#0d2b1a', borderColor: '#1a4d2e' }}>
          <p className="text-sm" style={{ color: 'var(--color-text-success)' }}>
            Stark matchning – inget kritiskt att prioritera inför det här uppdraget.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((r, i) => (
            <div
              key={i}
              className="rounded-xl border p-4 space-y-3"
              style={{ backgroundColor: '#211a0d', borderColor: '#7c5a1a' }}
            >
              <p className="text-base text-white" style={{ fontWeight: 500 }}>{r.requirement}</p>
              <div className="flex flex-wrap gap-2 text-xs">
                <MetaPill label="Krav" value={r.importance} />
                <MetaPill label="Din matchning" value={r.match} />
              </div>
              {r.howToAddress && (
                <div className="rounded-lg p-3" style={{ backgroundColor: '#2b2414', border: '1px solid #4d3e1a' }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: '#f0c674' }}>Så här hanterar du det:</p>
                  <p className="text-sm leading-relaxed" style={{ color: '#f0e3c8' }}>{r.howToAddress}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── f. Förbered dig på (neutral, ingen varningsfärg) ──────────────────────

function PrepareSection({ items }) {
  return (
    <div>
      <SectionHeading wf={WF.forbered} title="Förbered dig på" count={items.length} titleColor="#e5e5e5" />
      {items.length === 0 ? (
        <p className="text-sm" style={{ color: '#6b7280' }}>Inget extra att förbereda just nu.</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {items.map((r, i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-lg p-3"
              style={{ backgroundColor: '#1d1d1d', border: '1px solid #404040' }}
            >
              <span className="text-sm text-white flex-1 min-w-0">{r.requirement}</span>
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0"
                style={{ backgroundColor: '#2a2a2a', color: '#9ca3af', border: '1px solid #404040' }}
              >
                {r.match === 'delvis' ? 'Delvis' : 'Låg vikt'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── g. Dina styrkor (chip-moln, alltid synligt) ───────────────────────────

function StrengthsSection({ items }) {
  return (
    <div>
      <SectionHeading wf={WF.styrkor} title="Dina styrkor" count={items.length} titleColor="var(--color-text-success)" />
      {items.length === 0 ? (
        <p className="text-sm" style={{ color: '#6b7280' }}>Inga starkt matchade krav ännu.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((r, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
              style={{ backgroundColor: '#0d2b1a', color: '#86efac', border: '1px solid #1a4d2e' }}
            >
              <TiCheck size={12} color="#4ade80" />
              {r.requirement}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Structured description (from AI sections) ──────────────────────────────

function StructuredSections({ sections }) {
  return (
    <div className="space-y-4">
      {sections.map((sec, i) => (
        <div key={i}>
          {sec.heading && (
            <p className="text-sm font-semibold text-white mb-1">{sec.heading}</p>
          )}
          {Array.isArray(sec.points) && sec.points.length > 0 && (
            <ul className="space-y-0.5">
              {sec.points.map((pt, j) => (
                <li key={j} className="flex gap-2 text-sm leading-relaxed" style={{ color: '#d1d5db' }}>
                  <span className="shrink-0 mt-0.5" style={{ color: '#8064ad' }}>•</span>
                  {pt}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
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
          feedback.overallScore >= 8
            ? '#22c55e'
            : feedback.overallScore >= 6
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
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm text-white">
                    {feedback.createdAt
                      ? new Date(feedback.createdAt.toDate()).toLocaleDateString(
                          'sv-SE',
                          { year: 'numeric', month: 'long', day: 'numeric' }
                        )
                      : 'Datum okänt'}
                  </p>
                  {feedback.sharedWithSeller && (
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0"
                      style={{ backgroundColor: '#2a9d8f20', color: '#5ecfc3', border: '1px solid #2a9d8f40' }}
                      title="Delad med din säljare"
                    >
                      Delad
                    </span>
                  )}
                </div>
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

// ── Icons (Tabler-stil, stroke=currentColor så de ärver brickans färg) ─────

function Svg({ size = 16, color = 'currentColor', children }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="shrink-0"
    >
      {children}
    </svg>
  )
}

function TiChartPie({ size, color }) {
  return (
    <Svg size={size} color={color}>
      <path d="M10 3.2a9 9 0 1 0 10.8 10.8a1 1 0 0 0 -1 -1h-6.8a1 1 0 0 1 -1 -1v-7a.9 .9 0 0 0 -1 -.8" />
      <path d="M15 3.5a9 9 0 0 1 5.5 5.5h-4.5a1 1 0 0 1 -1 -1z" />
    </Svg>
  )
}

function TiFlag({ size, color }) {
  return (
    <Svg size={size} color={color}>
      <path d="M5 21V4" />
      <path d="M5 4h12l-2.5 4 2.5 4H5" />
    </Svg>
  )
}

function TiListCheck({ size, color }) {
  return (
    <Svg size={size} color={color}>
      <path d="M4 5.5l1.5 1.5l2.5 -2.5" />
      <path d="M4 11.5l1.5 1.5l2.5 -2.5" />
      <path d="M4 17.5l1.5 1.5l2.5 -2.5" />
      <line x1="11" y1="6" x2="20" y2="6" />
      <line x1="11" y1="12" x2="20" y2="12" />
      <line x1="11" y1="18" x2="20" y2="18" />
    </Svg>
  )
}

function TiStar({ size, color }) {
  return (
    <Svg size={size} color={color}>
      <path d="M12 4l2.4 4.9l5.4 .8l-3.9 3.8l.9 5.4l-4.8 -2.5l-4.8 2.5l.9 -5.4l-3.9 -3.8l5.4 -.8z" />
    </Svg>
  )
}

function TiChevronDown({ size, color }) {
  return (
    <Svg size={size} color={color}>
      <path d="M6 9l6 6l6 -6" />
    </Svg>
  )
}

function TiCheck({ size, color }) {
  return (
    <Svg size={size} color={color}>
      <path d="M5 12l5 5l9 -9" />
    </Svg>
  )
}
