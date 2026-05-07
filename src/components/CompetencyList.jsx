import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, deleteDoc, doc, query, orderBy } from 'firebase/firestore'
import { db, auth } from '../lib/firebase'

// ── Category definitions (names must match CATEGORY_ENUM in claude.js) ────

const CATEGORIES = [
  {
    name: 'Mjukvaruutveckling & programmering',
    color: '#3B82F6', bg: '#0d1f3c', textColor: '#7db4f8',
    tags: new Set(['react', 'angular', 'vue', 'typescript', 'javascript', 'c#', '.net', 'java', 'python', 'nodejs', 'node.js', 'fullstack', 'backend', 'frontend', 'blazor', 'asp.net']),
  },
  {
    name: 'IT-arkitektur & design',
    color: '#2a9d8f', bg: '#0d2b27', textColor: '#5ecfc3',
    tags: new Set(['arkitektur', 'togaf', 'systemarkitektur', 'api-strategi', 'access-management', 'integrationsstrategi', 'skalbarhet', 'ddd', 'systemdesign', 'lösningsarkitektur', 'domänmodellering']),
  },
  {
    name: 'Molntjänster & Azure',
    color: '#0EA5E9', bg: '#0d2233', textColor: '#5bc4f5',
    tags: new Set(['azure', 'cloud', 'aws', 'gcp', 'docker', 'kubernetes', 'cloud-migration', 'microsoft-azure', 'plattformsledning', 'teknisk-transformation', 'cosmosdb', 'service bus']),
  },
  {
    name: 'Systemintegration & API',
    color: '#8B5CF6', bg: '#1e1433', textColor: '#b48ef5',
    tags: new Set(['integration', 'api', 'biztalk', 'webhooks', 'event-driven', 'meddelandehantering', 'kundportal']),
  },
  {
    name: 'Testning & kvalitetssäkring',
    color: '#10B981', bg: '#0d2b1f', textColor: '#4ec994',
    tags: new Set(['testautomation', 'jest', 'selenium', 'enhetstester', 'integrationstester', 'storybook', 'puppeteer']),
  },
  {
    name: 'Microsoft 365 & modern arbetsplats',
    color: '#F59E0B', bg: '#2b2010', textColor: '#f5c060',
    tags: new Set(['microsoft-365', 'sharepoint', 'teams', 'power-platform', 'power-apps', 'power-automate', 'intune']),
  },
  {
    name: 'Informationsförvaltning & governance',
    color: '#EC4899', bg: '#2b1020', textColor: '#f07dbf',
    tags: new Set(['informationsförvaltning', 'datagovernance', 'governance', 'master-data', 'datakvalitet']),
  },
  {
    name: 'Data & analys',
    color: '#06B6D4', bg: '#0d2633', textColor: '#4dd8e8',
    tags: new Set(['power-bi', 'sql', 'datamodellering', 'etl', 'dataplattform', 'rapportering', 'beslutsunderlag']),
  },
  {
    name: 'IT-säkerhet & compliance',
    color: '#E76F51', bg: '#2b1a14', textColor: '#f0a085',
    tags: new Set(['säkerhet', 'gdpr', 'compliance', 'nis2']),
  },
  {
    name: 'Ledarskap & organisation',
    color: '#8064ad', bg: '#1e2d45', textColor: '#b19ae0',
    tags: new Set(['ledarskap', 'styrning', 'strategi', 'strategisk-kommunikation', 'ledningsstöd', 'teamledning', 'mentorskap', 'organisationsutveckling']),
  },
  {
    name: 'Affärsutveckling & strategi',
    color: '#7C5CBF', bg: '#221533', textColor: '#b19de0',
    tags: new Set(['affärsutveckling', 'digitalisering', 'transformation', 'förändringsledning', 'processautomation', 'effektivisering', 'affärsnytta', 'projektledning', 'projektledare', 'portfolio']),
  },
  {
    name: 'AI & innovation',
    color: '#57A773', bg: '#0d2b1a', textColor: '#7dcc99',
    tags: new Set(['ai', 'automation', 'innovation', 'maskininlärning']),
  },
  {
    name: 'Övrigt',
    color: '#6B7280', bg: '#1e1f2a', textColor: '#9ca3af',
    tags: new Set(),
  },
]

const MISC_CATEGORY = CATEGORIES[CATEGORIES.length - 1]

function categorize(competency) {
  // Primary: use the stored category field from Claude extraction
  if (competency.category) {
    const match = CATEGORIES.find((c) => c.name === competency.category)
    if (match) return match
  }
  // Fallback: tag-based matching for older documents
  const tags = (competency.tags || []).map((t) => t.toLowerCase())
  let best = null
  let bestCount = 0
  for (const cat of CATEGORIES.slice(0, -1)) {
    const count = tags.filter((t) => cat.tags.has(t)).length
    if (count > bestCount) {
      bestCount = count
      best = cat
    }
  }
  return best ?? MISC_CATEGORY
}

function tagStyle(tag) {
  const lower = tag.toLowerCase()
  for (const cat of CATEGORIES.slice(0, -1)) {
    if (cat.tags.has(lower)) {
      return { backgroundColor: cat.bg, color: cat.textColor }
    }
  }
  return { backgroundColor: MISC_CATEGORY.bg, color: MISC_CATEGORY.textColor }
}

// ── Component ─────────────────────────────────────────────────────────────

export default function CompetencyList() {
  const [competencies, setCompetencies] = useState([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState(null)
  const [activeCategory, setActiveCategory] = useState(null) // null = Alla

  useEffect(() => {
    const uid = auth.currentUser.uid
    const q = query(collection(db, 'users', uid, 'competencies'), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setCompetencies(snapshot.docs.map((d) => ({ docId: d.id, ...d.data() })))
        setLoading(false)
      },
      (err) => {
        console.error('Firestore onSnapshot-fel:', err)
        setLoading(false)
      }
    )
    return unsubscribe
  }, [])

  const categoryCounts = useMemo(() => {
    const counts = new Map(CATEGORIES.map((c) => [c.name, 0]))
    competencies.forEach((c) => {
      const cat = categorize(c)
      counts.set(cat.name, (counts.get(cat.name) ?? 0) + 1)
    })
    return counts
  }, [competencies])

  const filtered = activeCategory
    ? competencies.filter((c) => categorize(c).name === activeCategory)
    : competencies

  async function handleDelete(docId) {
    setDeletingId(docId)
    try {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'competencies', docId))
    } catch (err) {
      console.error('Kunde inte ta bort kompetens:', err)
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-8" style={{ color: '#6b7280' }}>
        <MiniSpinner />
        <span className="text-sm">Laddar kompetenser...</span>
      </div>
    )
  }

  if (competencies.length === 0) {
    return (
      <div
        className="rounded-xl border-2 border-dashed p-12 text-center"
        style={{ borderColor: '#404040' }}
      >
        <p className="text-sm" style={{ color: '#6b7280' }}>
          Kompetensbanken är tom. Ladda upp ett CV för att komma igång.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Category filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory(null)}
          className="px-3 py-1.5 rounded-full text-sm font-medium transition-all"
          style={
            activeCategory === null
              ? { backgroundColor: '#8064ad', color: '#fff' }
              : { backgroundColor: '#323232', color: '#6b7280' }
          }
        >
          Alla ({competencies.length})
        </button>

        {CATEGORIES.filter((cat) => (categoryCounts.get(cat.name) ?? 0) > 0).map((cat) => {
          const isActive = activeCategory === cat.name
          return (
            <button
              key={cat.name}
              onClick={() => setActiveCategory(isActive ? null : cat.name)}
              className="px-3 py-1.5 rounded-full text-sm font-medium transition-all"
              style={
                isActive
                  ? { backgroundColor: cat.color, color: '#fff' }
                  : {
                      backgroundColor: '#323232',
                      color: '#9ca3af',
                      borderLeft: `3px solid ${cat.color}`,
                      paddingLeft: '0.625rem',
                    }
              }
            >
              {cat.name} ({categoryCounts.get(cat.name)})
            </button>
          )
        })}
      </div>

      {/* Count label */}
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8064ad' }}>
        {activeCategory
          ? `${filtered.length} kompetens${filtered.length === 1 ? '' : 'er'} i "${activeCategory}"`
          : `${competencies.length} kompetens${competencies.length === 1 ? '' : 'er'} i din bank`}
      </p>

      <CategoryAccordions
        competencies={filtered}
        activeCategory={activeCategory}
        deletingId={deletingId}
        onDelete={handleDelete}
      />
    </div>
  )
}

// ── Accordion grouping ────────────────────────────────────────────────────

function CategoryAccordions({ competencies, activeCategory, deletingId, onDelete }) {
  const grouped = useMemo(() => {
    const map = new Map()
    competencies.forEach((c) => {
      const cat = categorize(c)
      if (!map.has(cat.name)) map.set(cat.name, { cat, items: [] })
      map.get(cat.name).items.push(c)
    })
    return Array.from(map.values())
  }, [competencies])

  // When a specific category filter is active, start it expanded
  const [openCategories, setOpenCategories] = useState(() =>
    activeCategory ? new Set([activeCategory]) : new Set()
  )

  // Sync expansion state when filter chip changes
  useEffect(() => {
    if (activeCategory) {
      setOpenCategories(new Set([activeCategory]))
    }
  }, [activeCategory])

  function toggle(name) {
    setOpenCategories((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  if (grouped.length === 0) return null

  return (
    <div className="space-y-2">
      {grouped.map(({ cat, items }) => {
        const isOpen = openCategories.has(cat.name)
        return (
          <div
            key={cat.name}
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: '#404040' }}
          >
            {/* Accordion header */}
            <button
              onClick={() => toggle(cat.name)}
              className="w-full flex items-center justify-between px-4 py-3 transition-colors"
              style={{ backgroundColor: '#1d1d1d' }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#252525')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1d1d1d')}
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="text-sm font-semibold text-white">
                  {cat.name}
                </span>
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: cat.bg, color: cat.textColor }}
                >
                  {items.length}
                </span>
              </div>
              <ChevronIcon expanded={isOpen} />
            </button>

            {/* Accordion body */}
            {isOpen && (
              <ul
                className="space-y-px border-t"
                style={{ borderColor: '#404040', backgroundColor: '#141414' }}
              >
                {items.map((c) => (
                  <CompetencyCard
                    key={c.docId}
                    competency={c}
                    deleting={deletingId === c.docId}
                    onDelete={() => onDelete(c.docId)}
                  />
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────

const STRENGTH_STYLE = {
  hög:   { label: 'Hög',   color: '#4ade80', bg: '#0d2b1a' },
  medel: { label: 'Medel', color: '#E9C46A', bg: '#2b2414' },
  låg:   { label: 'Låg',   color: '#f87171', bg: '#2b0d0d' },
}

function StrengthBadge({ strength }) {
  if (!strength) return null
  const s = STRENGTH_STYLE[strength.toLowerCase()]
  if (!s) return null
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
      style={{ backgroundColor: s.bg, color: s.color, border: `1px solid ${s.color}40` }}
    >
      {s.label}
    </span>
  )
}

function CompetencyCard({ competency, deleting, onDelete }) {
  const { title, description, tags, impact, context, sourceFile, strength } = competency
  const [expanded, setExpanded] = useState(false)

  return (
    <li
      className="rounded-xl border p-5 transition-colors cursor-pointer"
      style={{ backgroundColor: '#1d1d1d', borderColor: '#404040' }}
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Always-visible header: title + tags + controls */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-white font-semibold text-base leading-snug select-none">
              {title}
            </h3>
            <StrengthBadge strength={strength} />
          </div>

          {tags && tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tags.map((tag, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={tagStyle(tag)}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Chevron – purely visual, click handled by li */}
          <span className="p-1.5" style={{ color: '#6b7280' }}>
            <ChevronIcon expanded={expanded} />
          </span>

          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            disabled={deleting}
            title="Ta bort kompetens"
            className="p-1.5 rounded transition-colors disabled:opacity-40"
            style={{ color: '#6b7280' }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#f87171')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
          >
            {deleting ? <MiniSpinner size={15} /> : <TrashIcon />}
          </button>
        </div>
      </div>

      {/* Expandable: description + impact + meta */}
      {expanded && (
        <div className="mt-3 space-y-2">
          {description && (
            <p className="text-sm leading-relaxed" style={{ color: '#d1d5db' }}>
              {description}
            </p>
          )}
          {impact && (
            <p className="text-sm leading-relaxed italic" style={{ color: '#9ca3af' }}>
              {impact}
            </p>
          )}
          {(context || sourceFile) && (
            <div
              className="mt-3 pt-3 space-y-3 border-t"
              style={{ borderColor: '#404040' }}
            >
              {context && <DetailRow label="Sammanhang" value={context} />}
              {sourceFile && <DetailRow label="Källfil" value={sourceFile} />}
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function DetailRow({ label, value }) {
  return (
    <div>
      <p
        className="text-xs uppercase tracking-wider font-semibold mb-1"
        style={{ color: '#8064ad' }}
      >
        {label}
      </p>
      <p className="text-sm leading-relaxed" style={{ color: '#d1d5db' }}>
        {value}
      </p>
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────

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

function TrashIcon() {
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
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

function MiniSpinner({ size = 14 }) {
  return (
    <svg
      className="animate-spin"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  )
}
