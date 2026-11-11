import { useEffect, useMemo, useState } from 'react'

// ── Category definitions (names must match CATEGORY_ENUM in claude.js) ────

const CATEGORIES = [
  {
    name: 'Mjukvaruutveckling & programmering',
    color: 'var(--color-tag-blue-1)', bg: 'var(--color-tag-blue-1)', textColor: 'var(--color-tag-text)',
    tags: new Set(['react', 'angular', 'vue', 'typescript', 'javascript', 'c#', '.net', 'java', 'python', 'nodejs', 'node.js', 'fullstack', 'backend', 'frontend', 'blazor', 'asp.net']),
  },
  {
    name: 'IT-arkitektur & design',
    color: 'var(--color-tag-teal-1)', bg: 'var(--color-tag-teal-1)', textColor: 'var(--color-tag-text)',
    tags: new Set(['arkitektur', 'togaf', 'systemarkitektur', 'api-strategi', 'access-management', 'integrationsstrategi', 'skalbarhet', 'ddd', 'systemdesign', 'lösningsarkitektur', 'domänmodellering']),
  },
  {
    name: 'Molntjänster & Azure',
    color: 'var(--color-tag-blue-2)', bg: 'var(--color-tag-blue-2)', textColor: 'var(--color-tag-text)',
    tags: new Set(['azure', 'cloud', 'aws', 'gcp', 'docker', 'kubernetes', 'cloud-migration', 'microsoft-azure', 'plattformsledning', 'teknisk-transformation', 'cosmosdb', 'service bus']),
  },
  {
    name: 'Systemintegration & API',
    color: 'var(--color-tag-purple-2)', bg: 'var(--color-tag-purple-2)', textColor: 'var(--color-tag-text)',
    tags: new Set(['integration', 'api', 'biztalk', 'webhooks', 'event-driven', 'meddelandehantering', 'kundportal']),
  },
  {
    name: 'Testning & kvalitetssäkring',
    color: 'var(--color-tag-green-1)', bg: 'var(--color-tag-green-1)', textColor: 'var(--color-tag-text)',
    tags: new Set(['testautomation', 'jest', 'selenium', 'enhetstester', 'integrationstester', 'storybook', 'puppeteer']),
  },
  {
    name: 'Microsoft 365 & modern arbetsplats',
    color: 'var(--color-tag-orange-1)', bg: 'var(--color-tag-orange-1)', textColor: 'var(--color-tag-text)',
    tags: new Set(['microsoft-365', 'sharepoint', 'teams', 'power-platform', 'power-apps', 'power-automate', 'intune']),
  },
  {
    name: 'Informationsförvaltning & governance',
    color: 'var(--color-tag-pink-1)', bg: 'var(--color-tag-pink-1)', textColor: 'var(--color-tag-text)',
    tags: new Set(['informationsförvaltning', 'datagovernance', 'governance', 'master-data', 'datakvalitet']),
  },
  {
    name: 'Data & analys',
    color: 'var(--color-tag-teal-2)', bg: 'var(--color-tag-teal-2)', textColor: 'var(--color-tag-text)',
    tags: new Set(['power-bi', 'sql', 'datamodellering', 'etl', 'dataplattform', 'rapportering', 'beslutsunderlag']),
  },
  {
    name: 'IT-säkerhet & compliance',
    color: 'var(--color-tag-pink-2)', bg: 'var(--color-tag-pink-2)', textColor: 'var(--color-tag-text)',
    tags: new Set(['säkerhet', 'gdpr', 'compliance', 'nis2']),
  },
  {
    name: 'Ledarskap & organisation',
    color: 'var(--color-tag-purple-1)', bg: 'var(--color-tag-purple-1)', textColor: 'var(--color-tag-text)',
    tags: new Set(['ledarskap', 'styrning', 'strategi', 'strategisk-kommunikation', 'ledningsstöd', 'teamledning', 'mentorskap', 'organisationsutveckling']),
  },
  {
    name: 'Affärsutveckling & strategi',
    color: 'var(--color-tag-orange-3)', bg: 'var(--color-tag-orange-3)', textColor: 'var(--color-tag-text)',
    tags: new Set(['affärsutveckling', 'digitalisering', 'transformation', 'förändringsledning', 'processautomation', 'effektivisering', 'affärsnytta', 'projektledning', 'projektledare', 'portfolio']),
  },
  {
    name: 'AI & innovation',
    color: 'var(--color-tag-green-2)', bg: 'var(--color-tag-green-2)', textColor: 'var(--color-tag-text)',
    tags: new Set(['ai', 'automation', 'innovation', 'maskininlärning']),
  },
  {
    name: 'Övrigt',
    color: 'var(--color-tag-grey-1)', bg: 'var(--color-tag-neutral-background)', textColor: 'var(--color-tag-neutral-text)',
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

/**
 * Visar ETT CV:s kompetenser grupperade per kategori (accordion, kollapsade
 * by default) med filter-chips. Ren visningskomponent – datan och
 * borttagningen ägs av anroparen (CV-lagret), så samma lista används för
 * konsultens egna CV:n, säljarens vy och väntande profiler.
 *
 * @param {object[]} competencies – CV:ts kompetenser i lagrad ordning
 * @param {(index: number) => Promise<void>} [onDelete] – utelämna för läsläge
 */
export default function CompetencyList({ competencies: input = [], onDelete, emptyText }) {
  const [deletingIndex, setDeletingIndex] = useState(null)
  const [activeCategory, setActiveCategory] = useState(null) // null = Alla

  // Varje kompetens bär sitt index i CV:ts lagrade lista. Filtrering och
  // gruppering ändrar ordningen – borttagning måste ändå träffa rätt post.
  const competencies = useMemo(
    () => (Array.isArray(input) ? input : []).map((c, i) => ({ ...c, _index: i })),
    [input]
  )

  const categoryCounts = useMemo(() => {
    const counts = new Map(CATEGORIES.map((c) => [c.name, 0]))
    competencies.forEach((c) => {
      const cat = categorize(c)
      counts.set(cat.name, (counts.get(cat.name) ?? 0) + 1)
    })
    return counts
  }, [competencies])

  // Ett filter som inte längre har några träffar (sista posten borttagen)
  // ska inte lämna en tom lista kvar.
  useEffect(() => {
    if (activeCategory && !(categoryCounts.get(activeCategory) > 0)) setActiveCategory(null)
  }, [activeCategory, categoryCounts])

  const filtered = activeCategory
    ? competencies.filter((c) => categorize(c).name === activeCategory)
    : competencies

  async function handleDelete(index) {
    if (!onDelete) return
    setDeletingIndex(index)
    try {
      await onDelete(index)
    } catch (err) {
      console.error('Kunde inte ta bort kompetens:', err)
    } finally {
      setDeletingIndex(null)
    }
  }

  if (competencies.length === 0) {
    return (
      <div
        className="rounded-xl border-2 border-dashed p-12 text-center max-sm:p-6"
        style={{ borderColor: 'var(--color-border-strong)' }}
      >
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {emptyText ?? 'Inga kompetenser i det här CV:t.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Category filter chips – bara meningsfulla med fler än en kategori */}
      {categoryCounts && [...categoryCounts.values()].filter((n) => n > 0).length > 1 && (
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory(null)}
          className="px-3 py-1.5 rounded-full text-sm font-medium transition-all max-sm:py-2"
          style={
            activeCategory === null
              ? { backgroundColor: 'var(--color-action-primary-background)', color: 'var(--color-action-primary-text)' }
              : { backgroundColor: 'var(--color-background-tertiary)', color: 'var(--color-text-secondary)' }
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
              className="px-3 py-1.5 rounded-full text-sm font-medium transition-all max-sm:py-2"
              style={
                isActive
                  ? { backgroundColor: cat.color, color: 'var(--color-tag-text)' }
                  : {
                      backgroundColor: 'var(--color-background-tertiary)',
                      color: 'var(--color-text-secondary)',
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
      )}

      {/* Count label */}
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-accent-purple)' }}>
        {activeCategory
          ? `${filtered.length} kompetens${filtered.length === 1 ? '' : 'er'} i "${activeCategory}"`
          : `${competencies.length} kompetens${competencies.length === 1 ? '' : 'er'} i CV:t`}
      </p>

      <CategoryAccordions
        competencies={filtered}
        activeCategory={activeCategory}
        deletingIndex={deletingIndex}
        onDelete={onDelete ? handleDelete : null}
      />
    </div>
  )
}

// ── Accordion grouping ────────────────────────────────────────────────────

function CategoryAccordions({ competencies, activeCategory, deletingIndex, onDelete }) {
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
            style={{ borderColor: 'var(--color-border-default)' }}
          >
            {/* Accordion header */}
            <button
              onClick={() => toggle(cat.name)}
              className="w-full flex items-center justify-between px-4 py-3 transition-colors max-sm:gap-3 max-sm:text-left"
              style={{ backgroundColor: 'var(--color-background-primary)' }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-action-ghost-background-hover)')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-background-primary)')}
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="text-sm font-semibold text-text-primary">
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
                style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-background-tertiary)' }}
              >
                {items.map((c) => (
                  <CompetencyCard
                    key={`${c._index}-${c.title ?? ''}`}
                    competency={c}
                    deleting={deletingIndex === c._index}
                    onDelete={onDelete ? () => onDelete(c._index) : null}
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
  hög:   { label: 'Hög',   color: 'var(--color-feedback-success)', bg: 'var(--color-feedback-success-background)' },
  medel: { label: 'Medel', color: 'var(--color-feedback-warning)', bg: 'var(--color-feedback-warning-background)' },
  låg:   { label: 'Låg',   color: 'var(--color-feedback-error)', bg: 'var(--color-feedback-error-background)' },
}

function StrengthBadge({ strength }) {
  if (!strength) return null
  const s = STRENGTH_STYLE[strength.toLowerCase()]
  if (!s) return null
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
      style={{ backgroundColor: s.bg, color: s.color, border: `1px solid color-mix(in srgb, ${s.color} 30%, transparent)` }}
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
      className="rounded-xl border p-5 transition-colors cursor-pointer max-sm:p-4"
      style={{ backgroundColor: 'var(--color-background-primary)', borderColor: 'var(--color-border-default)' }}
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Always-visible header: title + tags + controls */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-text-primary font-medium text-base leading-snug select-none">
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
          <span className="p-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            <ChevronIcon expanded={expanded} />
          </span>

          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              disabled={deleting}
              title="Ta bort kompetens"
              aria-label="Ta bort kompetens"
              className="p-1.5 rounded transition-colors disabled:opacity-40 max-sm:p-3 max-sm:-m-1.5"
              style={{ color: 'var(--color-text-secondary)' }}
              onMouseOver={(e) => (e.currentTarget.style.color = 'var(--color-feedback-error)')}
              onMouseOut={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
            >
              {deleting ? <MiniSpinner size={15} /> : <TrashIcon />}
            </button>
          )}
        </div>
      </div>

      {/* Expandable: description + impact + meta */}
      {expanded && (
        <div className="mt-3 space-y-2">
          {description && (
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
              {description}
            </p>
          )}
          {impact && (
            <p className="text-sm leading-relaxed italic" style={{ color: 'var(--color-text-secondary)' }}>
              {impact}
            </p>
          )}
          {(context || sourceFile) && (
            <div
              className="mt-3 pt-3 space-y-3 border-t"
              style={{ borderColor: 'var(--color-border-default)' }}
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
        style={{ color: 'var(--color-accent-purple)' }}
      >
        {label}
      </p>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
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
