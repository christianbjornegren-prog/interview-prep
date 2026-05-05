import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  collection,
  db,
  doc,
  getDoc,
  getDocs,
  addDoc,
  serverTimestamp,
} from '../lib/firebase'

// ── Category definitions (mirrors CompetencyList) ─────────────────────────

const CAT_DEFS = [
  { name: 'Ledning & styrning', color: '#4A6FA5', bg: '#1e2d45', textColor: '#7aa3d4',
    tags: new Set(['ledarskap','styrning','governance','strategi','beslutsunderlag','power-bi','rapportering','strategisk-kommunikation','ledningsstöd']) },
  { name: 'Digitalisering', color: '#7C5CBF', bg: '#221533', textColor: '#b19de0',
    tags: new Set(['digitalisering','transformation','förändringsledning','processautomation','effektivisering','affärsnytta','digitaleffektivisering']) },
  { name: 'IT-arkitektur', color: '#2A9D8F', bg: '#0d2b27', textColor: '#5ecfc3',
    tags: new Set(['arkitektur','togaf','systemarkitektur','integration','kundportal','api-strategi','access-management','integrationsstrategi','skalbarhet']) },
  { name: 'Molntjänster & Azure', color: '#0EA5E9', bg: '#0d2233', textColor: '#5bc4f5',
    tags: new Set(['azure','cloud','microsoft','cloud-migration','microsoft-azure','plattformsledning','teknisk-transformation']) },
  { name: 'IT-säkerhet & compliance', color: '#E76F51', bg: '#2b1a14', textColor: '#f0a085',
    tags: new Set(['säkerhet','gdpr','compliance','nis2']) },
  { name: 'AI & innovation', color: '#57A773', bg: '#0d2b1a', textColor: '#7dcc99',
    tags: new Set(['ai','automation','innovation']) },
  { name: 'Projektledning', color: '#E9C46A', bg: '#2b2414', textColor: '#f0d48a',
    tags: new Set(['projektledning','projektledare','portfolio']) },
  { name: 'Övrigt', color: '#6B7280', bg: '#1e1f2a', textColor: '#9ca3af', tags: new Set() },
]
const MISC_CAT = CAT_DEFS[CAT_DEFS.length - 1]

function categorize(comp) {
  const tags = (comp.tags || []).map((t) => t.toLowerCase())
  let best = null, bestCount = 0
  for (const cat of CAT_DEFS.slice(0, -1)) {
    const count = tags.filter((t) => cat.tags.has(t)).length
    if (count > bestCount) { bestCount = count; best = cat }
  }
  return best ?? MISC_CAT
}

function tagStyle(tag) {
  const lower = tag.toLowerCase()
  for (const cat of CAT_DEFS.slice(0, -1)) {
    if (cat.tags.has(lower)) return { backgroundColor: cat.bg, color: cat.textColor }
  }
  return { backgroundColor: MISC_CAT.bg, color: MISC_CAT.textColor }
}

// ── Main component ────────────────────────────────────────────────────────

export default function KonsultProfilPage() {
  const { uid } = useParams()
  const navigate = useNavigate()

  const [konsult, setKonsult] = useState(null)
  const [competencies, setCompetencies] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('kompetensbank')
  const [expandedJob, setExpandedJob] = useState(null)
  const [openCats, setOpenCats] = useState(new Set())
  const [showAddModal, setShowAddModal] = useState(false)

  async function loadCompetencies() {
    const snap = await getDocs(collection(db, 'users', uid, 'competencies'))
    setCompetencies(snap.docs.map((d) => ({ docId: d.id, ...d.data() })))
  }

  useEffect(() => {
    async function load() {
      const [userSnap, compSnap, jobsSnap] = await Promise.all([
        getDoc(doc(db, 'users', uid)),
        getDocs(collection(db, 'users', uid, 'competencies')),
        getDocs(collection(db, 'users', uid, 'jobs')),
      ])
      if (userSnap.exists()) setKonsult({ uid, ...userSnap.data() })
      setCompetencies(compSnap.docs.map((d) => ({ docId: d.id, ...d.data() })))
      setJobs(jobsSnap.docs.map((d) => ({ docId: d.id, ...d.data() })))
      setLoading(false)
    }
    load()
  }, [uid])

  function toggleCat(name) {
    setOpenCats((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  if (loading) {
    return <p className="text-sm py-8" style={{ color: '#6b7280' }}>Laddar profil...</p>
  }

  if (!konsult) {
    return <p className="text-sm py-8" style={{ color: '#f87171' }}>Konsulten hittades inte.</p>
  }

  const tabs = [
    { id: 'kompetensbank', label: 'Kompetensbank' },
    { id: 'uppdrag', label: 'Uppdrag' },
  ]

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
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {konsult.name ?? konsult.email}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>{konsult.email}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: '#2a2d3a' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-5 py-2.5 text-sm font-medium transition-colors -mb-px"
            style={{
              color: activeTab === tab.id ? '#fff' : '#6b7280',
              borderBottom: activeTab === tab.id ? '2px solid #4A6FA5' : '2px solid transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Kompetensbank */}
      {activeTab === 'kompetensbank' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#4A6FA5' }}>
              {competencies.length} kompetens{competencies.length === 1 ? '' : 'er'}
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors"
              style={{ backgroundColor: '#4A6FA5' }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#5a82bc')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#4A6FA5')}
            >
              + Lägg till kompetens manuellt
            </button>
          </div>

          {competencies.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed p-12 text-center" style={{ borderColor: '#2a2d3a' }}>
              <p className="text-sm" style={{ color: '#6b7280' }}>Inga kompetenser ännu.</p>
            </div>
          ) : (
            <ReadOnlyAccordion
              competencies={competencies}
              openCats={openCats}
              onToggle={toggleCat}
            />
          )}
        </div>
      )}

      {/* Tab: Uppdrag */}
      {activeTab === 'uppdrag' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#4A6FA5' }}>
              {jobs.length} uppdrag
            </p>
            <button
              onClick={() => navigate('/jobb/ny', { state: { targetUid: uid, targetName: konsult.name ?? konsult.email } })}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors"
              style={{ backgroundColor: '#4A6FA5' }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#5a82bc')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#4A6FA5')}
            >
              + Skapa nytt uppdrag åt konsulten
            </button>
          </div>

          {jobs.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed p-12 text-center" style={{ borderColor: '#2a2d3a' }}>
              <p className="text-sm" style={{ color: '#6b7280' }}>Inga uppdrag ännu.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {jobs.map((job) => (
                <JobItem
                  key={job.docId}
                  job={job}
                  expanded={expandedJob === job.docId}
                  onToggle={() => setExpandedJob(expandedJob === job.docId ? null : job.docId)}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Add competency modal */}
      {showAddModal && (
        <AddCompetencyModal
          uid={uid}
          onClose={() => setShowAddModal(false)}
          onAdded={() => loadCompetencies()}
        />
      )}
    </div>
  )
}

// ── Read-only accordion ───────────────────────────────────────────────────

function ReadOnlyAccordion({ competencies, openCats, onToggle }) {
  const grouped = useMemo(() => {
    const map = new Map()
    competencies.forEach((c) => {
      const cat = categorize(c)
      if (!map.has(cat.name)) map.set(cat.name, { cat, items: [] })
      map.get(cat.name).items.push(c)
    })
    return Array.from(map.values())
  }, [competencies])

  return (
    <div className="space-y-2">
      {grouped.map(({ cat, items }) => {
        const isOpen = openCats.has(cat.name)
        return (
          <div key={cat.name} className="rounded-xl border overflow-hidden" style={{ borderColor: '#2a2d3a' }}>
            <button
              onClick={() => onToggle(cat.name)}
              className="w-full flex items-center justify-between px-4 py-3 transition-colors"
              style={{ backgroundColor: '#1a1d27' }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#1e2230')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1a1d27')}
            >
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                <span className="text-sm font-semibold text-white">{cat.name}</span>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: cat.bg, color: cat.textColor }}>
                  {items.length}
                </span>
              </div>
              <ChevronIcon expanded={isOpen} />
            </button>

            {isOpen && (
              <ul className="space-y-px border-t" style={{ borderColor: '#2a2d3a', backgroundColor: '#13151f' }}>
                {items.map((c) => (
                  <ReadOnlyCompetencyCard key={c.docId} competency={c} />
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ReadOnlyCompetencyCard({ competency }) {
  const { title, description, tags, impact, context } = competency
  const [expanded, setExpanded] = useState(false)

  return (
    <li
      className="rounded-xl border p-5 transition-colors cursor-pointer"
      style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-base leading-snug select-none">{title}</h3>
          {tags && tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tags.map((tag, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-full font-medium" style={tagStyle(tag)}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className="p-1.5 shrink-0" style={{ color: '#6b7280' }}>
          <ChevronIcon expanded={expanded} />
        </span>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          {description && <p className="text-sm leading-relaxed" style={{ color: '#d1d5db' }}>{description}</p>}
          {impact && <p className="text-sm leading-relaxed italic" style={{ color: '#9ca3af' }}>{impact}</p>}
          {context && (
            <div className="mt-3 pt-3 border-t" style={{ borderColor: '#2a2d3a' }}>
              <p className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: '#4A6FA5' }}>Sammanhang</p>
              <p className="text-sm leading-relaxed" style={{ color: '#d1d5db' }}>{context}</p>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

// ── Job item with inline gap analysis ────────────────────────────────────

function JobItem({ job, expanded, onToggle }) {
  const covered = job.gapAnalysis?.covered ?? []
  const gaps = job.gapAnalysis?.gaps ?? []
  const total = covered.length + gaps.length
  const scoreRatio = total > 0 ? covered.length / total : null
  const matchColor = scoreRatio === null ? '#6b7280'
    : scoreRatio >= 0.7 ? '#22c55e'
    : scoreRatio >= 0.4 ? '#E9C46A'
    : '#ef4444'

  return (
    <li>
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: expanded ? '#4A6FA5' : '#2a2d3a' }}>
        <button
          onClick={onToggle}
          className="w-full text-left p-4 transition-colors"
          style={{ backgroundColor: '#1a1d27' }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#1e2230')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1a1d27')}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-white font-semibold text-base leading-snug">
                {job.jobTitle || 'Namnlös jobbannons'}
              </h3>
              {job.company && <p className="text-sm" style={{ color: '#9ca3af' }}>{job.company}</p>}
              {scoreRatio !== null && (
                <span
                  className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: matchColor + '20', color: matchColor, border: `1px solid ${matchColor}40` }}
                >
                  Matchning: {covered.length} av {total} krav
                </span>
              )}
            </div>
            <ChevronIcon expanded={expanded} />
          </div>
        </button>

        {expanded && (
          <div className="border-t p-4 space-y-4" style={{ borderColor: '#2a2d3a', backgroundColor: '#13151f' }}>
            {covered.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#22c55e' }}>
                  Täckta krav ({covered.length})
                </p>
                <ul className="space-y-1">
                  {covered.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span style={{ color: '#22c55e', flexShrink: 0 }}>✓</span>
                      <span style={{ color: '#d1d5db' }}>
                        {item.requirement}
                        {item.competencyName && (
                          <span style={{ color: '#6b7280' }}> · {item.competencyName}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {gaps.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#f87171' }}>
                  Gap ({gaps.length})
                </p>
                <ul className="space-y-1">
                  {gaps.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span style={{ color: '#f87171', flexShrink: 0 }}>–</span>
                      <span style={{ color: '#d1d5db' }}>
                        {item.requirement}
                        {item.suggestion && (
                          <span className="block text-xs mt-0.5" style={{ color: '#6b7280' }}>{item.suggestion}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {total === 0 && (
              <p className="text-sm" style={{ color: '#6b7280' }}>Ingen gap-analys tillgänglig.</p>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

// ── Add competency modal ──────────────────────────────────────────────────

function AddCompetencyModal({ uid, onClose, onAdded }) {
  const [form, setForm] = useState({ namn: '', kategori: '', beskrivning: '', taggar: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit() {
    if (!form.namn.trim()) { setError('Namn krävs.'); return }
    setSaving(true)
    setError('')
    try {
      const tags = form.taggar.split(',').map((t) => t.trim()).filter(Boolean)
      await addDoc(collection(db, 'users', uid, 'competencies'), {
        title: form.namn.trim(),
        description: form.beskrivning.trim(),
        tags,
        category: form.kategori.trim(),
        createdAt: serverTimestamp(),
      })
      onAdded()
      onClose()
    } catch (err) {
      console.error(err)
      setError('Kunde inte spara. Försök igen.')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6 space-y-5"
        style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">Lägg till kompetens</h2>
          <button onClick={onClose} className="text-sm transition-colors" style={{ color: '#6b7280' }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
          >✕</button>
        </div>

        {[
          { field: 'namn', label: 'Namn *', placeholder: 'T.ex. Strategisk ledarskap i offentlig sektor' },
          { field: 'kategori', label: 'Kategori', placeholder: 'T.ex. Ledning & styrning' },
          { field: 'beskrivning', label: 'Beskrivning', placeholder: 'Vad personen gjort och hur...', multiline: true },
          { field: 'taggar', label: 'Taggar (kommaseparerade)', placeholder: 'ledarskap, strategi, governance' },
        ].map(({ field, label, placeholder, multiline }) => (
          <div key={field} className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#4A6FA5' }}>
              {label}
            </label>
            {multiline ? (
              <textarea
                value={form[field]}
                onChange={(e) => update(field, e.target.value)}
                placeholder={placeholder}
                rows={3}
                className="w-full rounded-lg border p-3 text-sm text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#4A6FA5]"
                style={{ backgroundColor: '#13151f', borderColor: '#2a2d3a', resize: 'vertical' }}
              />
            ) : (
              <input
                type="text"
                value={form[field]}
                onChange={(e) => update(field, e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-lg border px-3 py-2 text-sm text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#4A6FA5]"
                style={{ backgroundColor: '#13151f', borderColor: '#2a2d3a' }}
              />
            )}
          </div>
        ))}

        {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{ backgroundColor: '#2a2d3a', color: '#9ca3af' }}
          >
            Avbryt
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60"
            style={{ backgroundColor: '#4A6FA5' }}
            onMouseOver={(e) => !saving && (e.currentTarget.style.backgroundColor = '#5a82bc')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#4A6FA5')}
          >
            {saving ? 'Sparar...' : 'Spara kompetens'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────

function ChevronIcon({ expanded }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
