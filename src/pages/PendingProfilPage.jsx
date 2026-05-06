import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  db,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
} from '../lib/firebase'
import { extractCompetencies } from '../lib/claude'
import StepIndicator, { percentToStep } from '../components/StepIndicator'

// ── Category definitions (mirrors CompetencyList) ─────────────────────────

const CAT_DEFS = [
  { name: 'Ledning & styrning', color: '#8064ad', bg: '#1e2d45', textColor: '#b19ae0',
    tags: new Set(['ledarskap','styrning','governance','strategi','beslutsunderlag','power-bi','rapportering','strategisk-kommunikation','ledningsstöd']) },
  { name: 'Digitalisering', color: '#7C5CBF', bg: '#221533', textColor: '#b19de0',
    tags: new Set(['digitalisering','transformation','förändringsledning','processautomation','effektivisering','affärsnytta','digitaleffektivisering']) },
  { name: 'IT-arkitektur', color: '#2a9d8f', bg: '#0d2b27', textColor: '#5ecfc3',
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

export default function PendingProfilPage() {
  const { email: encodedEmail } = useParams()
  const email = decodeURIComponent(encodedEmail)
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('kompetensbank')
  const [openCats, setOpenCats] = useState(new Set())
  const [showAddModal, setShowAddModal] = useState(false)
  const [showCvUpload, setShowCvUpload] = useState(false)

  async function loadProfile() {
    const snap = await getDoc(doc(db, 'pendingProfiles', email))
    if (snap.exists()) setProfile({ email, ...snap.data() })
    setLoading(false)
  }

  useEffect(() => { loadProfile() }, [email])

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
  if (!profile) {
    return <p className="text-sm py-8" style={{ color: '#f87171' }}>Profilen hittades inte.</p>
  }

  const competencies = profile.competencies ?? []
  const jobs = profile.jobs ?? []

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
          Konsulten har inte loggat in än. Kompetenser och uppdrag du lägger till här kopieras automatiskt till deras konto när de loggar in första gången.
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

      {/* Tab: Kompetensbank */}
      {activeTab === 'kompetensbank' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8064ad' }}>
              {competencies.length} kompetens{competencies.length === 1 ? '' : 'er'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCvUpload((v) => !v)}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                style={{ backgroundColor: '#404040', color: '#9ca3af' }}
                onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
                onMouseOut={(e) => (e.currentTarget.style.color = '#9ca3af')}
              >
                {showCvUpload ? '↑ Stäng CV-uppladdning' : '+ Ladda upp CV'}
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors"
                style={{ backgroundColor: '#8064ad' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#9781be')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#8064ad')}
              >
                + Lägg till kompetens manuellt
              </button>
            </div>
          </div>

          {showCvUpload && (
            <div className="rounded-xl border p-5" style={{ backgroundColor: '#1d1d1d', borderColor: '#404040' }}>
              <PendingFileUpload
                email={email}
                existingCompetencies={competencies}
                onSuccess={loadProfile}
              />
            </div>
          )}

          {competencies.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed p-12 text-center" style={{ borderColor: '#404040' }}>
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
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8064ad' }}>
              {jobs.length} uppdrag
            </p>
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

          {jobs.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed p-12 text-center" style={{ borderColor: '#404040' }}>
              <p className="text-sm" style={{ color: '#6b7280' }}>Inga uppdrag ännu.</p>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {jobs.map((job, i) => (
                <PendingJobCard
                  key={job.id ?? i}
                  job={job}
                  onClick={() =>
                    navigate(`/jobb/${job.id}`, { state: { pendingEmail: email } })
                  }
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {showAddModal && (
        <PendingAddCompetencyModal
          email={email}
          onClose={() => setShowAddModal(false)}
          onAdded={loadProfile}
        />
      )}
    </div>
  )
}

// ── CV upload for pending profiles ────────────────────────────────────────

const CV_STEPS = [
  { label: 'Läser dokumentet',       subtext: 'Förbereder din fil...' },
  { label: 'Skickar till Claude',    subtext: 'Väntar på svar från Claude...' },
  { label: 'Analyserar kompetenser', subtext: 'Bearbetar extraherade kompetenser...' },
  { label: 'Sparar till profilen',   subtext: 'Skriver kompetenser till databasen...' },
]

const ACCEPTED_TYPES = '.pdf,.docx'

function getFileType(file) {
  if (file.type === 'application/pdf') return 'pdf'
  if (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.name.endsWith('.docx')
  )
    return 'docx'
  return null
}

function PendingFileUpload({ email, existingCompetencies, onSuccess }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')
  const [progressPct, setProgressPct] = useState(0)

  function onProgress(_msg, pct) { setProgressPct(pct) }

  function handleFileSelect(file) {
    if (!file) return
    if (!getFileType(file)) {
      setStatus('error')
      setMessage('Otillåtet filformat. Ladda upp en PDF- eller DOCX-fil.')
      setSelectedFile(null)
      return
    }
    setSelectedFile(file)
    setStatus('idle')
    setMessage('')
  }

  async function handleAnalyze() {
    if (!selectedFile) return
    const fileType = getFileType(selectedFile)
    setStatus('loading')
    setMessage('')
    setProgressPct(0)

    try {
      const competencies = await extractCompetencies(selectedFile, fileType, onProgress)

      const existingTitles = new Set(
        existingCompetencies.map((c) => (c.title ?? '').toLowerCase())
      )
      const toSave = competencies.filter(
        (c) => !existingTitles.has((c.title ?? '').toLowerCase())
      )

      onProgress('Sparar till profilen...', 87)
      const pendingRef = doc(db, 'pendingProfiles', email)
      for (let i = 0; i < toSave.length; i++) {
        onProgress(`Sparar ${i + 1} av ${toSave.length}...`, 88 + (i / Math.max(toSave.length, 1)) * 11)
        const { createdAt: _ct, ...comp } = toSave[i]
        await updateDoc(pendingRef, {
          competencies: arrayUnion({ ...comp, sourceFile: selectedFile.name }),
        })
      }

      const skipped = competencies.length - toSave.length
      let msg = `${toSave.length} kompetens${toSave.length === 1 ? '' : 'er'} sparade.`
      if (skipped > 0) msg += ` ${skipped} dubblett${skipped === 1 ? '' : 'er'} hoppades över.`

      onProgress('Klart!', 100)
      await new Promise((r) => setTimeout(r, 1000))
      setStatus('success')
      setMessage(msg)
      setSelectedFile(null)
      onSuccess?.()
    } catch (err) {
      console.error(err)
      setStatus('error')
      setMessage(err.message ?? 'Något gick fel. Försök igen.')
    }
  }

  const isLoading = status === 'loading'

  return (
    <div className="space-y-3">
      {isLoading && (
        <StepIndicator steps={CV_STEPS} currentStep={percentToStep(progressPct)} />
      )}

      {!isLoading && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFileSelect(e.dataTransfer.files?.[0]) }}
          onClick={() => inputRef.current?.click()}
          className={[
            'flex flex-col items-center justify-center gap-3',
            'border-2 border-dashed rounded-xl p-10 transition-colors select-none cursor-pointer',
            dragging ? 'border-[#8064ad] bg-[#8064ad]/5' : 'border-[#404040] hover:border-[#8064ad]/50',
          ].join(' ')}
        >
          <input ref={inputRef} type="file" accept={ACCEPTED_TYPES} className="hidden" onChange={(e) => { handleFileSelect(e.target.files?.[0]); e.target.value = '' }} />
          {selectedFile ? (
            <div className="text-center">
              <p className="text-white text-sm font-semibold">{selectedFile.name}</p>
              <p className="text-[#6b7280] text-xs mt-1">Klicka för att välja en annan fil</p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-white text-sm font-medium">Dra och släpp CV här</p>
              <p className="text-[#6b7280] text-xs mt-1">eller klicka för att välja fil &mdash; PDF eller DOCX</p>
            </div>
          )}
        </div>
      )}

      {selectedFile && !isLoading && (
        <button
          onClick={handleAnalyze}
          className="w-full py-3 rounded-lg text-white text-sm font-semibold transition-colors"
          style={{ backgroundColor: '#8064ad' }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#9781be')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#8064ad')}
        >
          Analysera dokument
        </button>
      )}

      {status === 'success' && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: '#0d2b1a', border: '1px solid #1a4d2e', color: '#4ade80' }}>
          {message}
        </div>
      )}
      {status === 'error' && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: '#2b0d0d', border: '1px solid #4d1a1a', color: '#f87171' }}>
          {message}
        </div>
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
          <div key={cat.name} className="rounded-xl border overflow-hidden" style={{ borderColor: '#404040' }}>
            <button
              onClick={() => onToggle(cat.name)}
              className="w-full flex items-center justify-between px-4 py-3 transition-colors"
              style={{ backgroundColor: '#1d1d1d' }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#252525')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1d1d1d')}
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
              <ul className="space-y-px border-t" style={{ borderColor: '#404040', backgroundColor: '#141414' }}>
                {items.map((c, i) => (
                  <CompetencyCard key={c.title ?? i} competency={c} />
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

function CompetencyCard({ competency }) {
  const { title, description, tags } = competency
  const [expanded, setExpanded] = useState(false)

  return (
    <li
      className="rounded-xl border p-5 transition-colors cursor-pointer"
      style={{ backgroundColor: '#1d1d1d', borderColor: '#404040' }}
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
      {expanded && description && (
        <p className="mt-3 text-sm leading-relaxed" style={{ color: '#d1d5db' }}>{description}</p>
      )}
    </li>
  )
}

// ── Job card ──────────────────────────────────────────────────────────────

function PendingJobCard({ job, onClick }) {
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
      <button
        onClick={onClick}
        className="w-full text-left rounded-xl border p-4 space-y-2 transition-colors"
        style={{ backgroundColor: '#1d1d1d', borderColor: '#404040' }}
        onMouseOver={(e) => (e.currentTarget.style.borderColor = '#8064ad')}
        onMouseOut={(e) => (e.currentTarget.style.borderColor = '#404040')}
      >
        <div>
          <h3 className="text-white font-semibold text-base leading-snug line-clamp-2">
            {job.jobTitle || 'Namnlös jobbannons'}
          </h3>
          {job.company && (
            <p className="text-sm mt-0.5" style={{ color: '#9ca3af' }}>{job.company}</p>
          )}
        </div>
        {scoreRatio !== null && (
          <div>
            <span
              className="text-xs font-semibold px-2 py-1 rounded-full"
              style={{
                backgroundColor: matchColor + '20',
                color: matchColor,
                border: `1px solid ${matchColor}40`,
              }}
            >
              Matchning: {covered.length} av {total} krav
            </span>
          </div>
        )}
      </button>
    </li>
  )
}

// ── Add competency modal ──────────────────────────────────────────────────

function PendingAddCompetencyModal({ email, onClose, onAdded }) {
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
      await updateDoc(doc(db, 'pendingProfiles', email), {
        competencies: arrayUnion({
          title: form.namn.trim(),
          description: form.beskrivning.trim(),
          tags,
          category: form.kategori.trim(),
        }),
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
        style={{ backgroundColor: '#1d1d1d', borderColor: '#404040' }}
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
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8064ad' }}>
              {label}
            </label>
            {multiline ? (
              <textarea
                value={form[field]}
                onChange={(e) => update(field, e.target.value)}
                placeholder={placeholder}
                rows={3}
                className="w-full rounded-lg border p-3 text-sm text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#8064ad]"
                style={{ backgroundColor: '#141414', borderColor: '#404040', resize: 'vertical' }}
              />
            ) : (
              <input
                type="text"
                value={form[field]}
                onChange={(e) => update(field, e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-lg border px-3 py-2 text-sm text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#8064ad]"
                style={{ backgroundColor: '#141414', borderColor: '#404040' }}
              />
            )}
          </div>
        ))}

        {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{ backgroundColor: '#404040', color: '#9ca3af' }}
          >
            Avbryt
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60"
            style={{ backgroundColor: '#8064ad' }}
            onMouseOver={(e) => !saving && (e.currentTarget.style.backgroundColor = '#9781be')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#8064ad')}
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
