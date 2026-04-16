import { useEffect, useState } from 'react'
import { collection, onSnapshot, deleteDoc, doc, query, orderBy } from 'firebase/firestore'
import { db } from '../lib/firebase'

export default function CompetencyList() {
  const [competencies, setCompetencies] = useState([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    const q = query(collection(db, 'competencies'), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({ docId: d.id, ...d.data() }))
        setCompetencies(docs)
        setLoading(false)
      },
      (err) => {
        console.error('Firestore onSnapshot error:', err)
        setLoading(false)
      }
    )
    return unsubscribe
  }, [])

  async function handleDelete(docId) {
    setDeletingId(docId)
    try {
      await deleteDoc(doc(db, 'competencies', docId))
    } catch (err) {
      console.error('Kunde inte ta bort kompetens:', err)
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-brand-muted py-8">
        <MiniSpinner />
        <span className="text-sm">Laddar kompetenser...</span>
      </div>
    )
  }

  if (competencies.length === 0) {
    return (
      <div
        className="rounded-xl border border-dashed border-brand-border p-10 text-center"
      >
        <p className="text-brand-muted text-sm">
          Inga kompetenser ännu. Ladda upp ett CV ovan för att komma igång.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-brand-muted text-xs uppercase tracking-widest font-medium">
        {competencies.length} kompetens{competencies.length === 1 ? '' : 'er'}
      </p>

      <ul className="space-y-3">
        {competencies.map((c) => (
          <CompetencyCard
            key={c.docId}
            competency={c}
            deleting={deletingId === c.docId}
            onDelete={() => handleDelete(c.docId)}
          />
        ))}
      </ul>
    </div>
  )
}

function CompetencyCard({ competency, deleting, onDelete }) {
  const { title, description, tags, impact, context } = competency
  const [expanded, setExpanded] = useState(false)

  return (
    <li
      className="rounded-xl border border-brand-border p-5 transition-colors hover:border-brand-accent/40"
      style={{ backgroundColor: '#1a1d27' }}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: title + tags */}
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-base leading-snug truncate">
            {title}
          </h3>

          {tags && tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tags.map((tag, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: '#1e2d45', color: '#7aa3d4' }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-brand-muted hover:text-white transition-colors p-1 rounded"
            title={expanded ? 'Dölj detaljer' : 'Visa detaljer'}
          >
            <ChevronIcon expanded={expanded} />
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="text-brand-muted hover:text-red-400 transition-colors p-1 rounded disabled:opacity-40"
            title="Ta bort kompetens"
          >
            {deleting ? <MiniSpinner size={14} /> : <TrashIcon />}
          </button>
        </div>
      </div>

      {/* Description always visible */}
      {description && (
        <p className="text-gray-300 text-sm mt-3 leading-relaxed">{description}</p>
      )}

      {/* Expandable details */}
      {expanded && (
        <div className="mt-4 space-y-3 border-t border-brand-border pt-4">
          {context && (
            <DetailRow label="Sammanhang" value={context} />
          )}
          {impact && (
            <DetailRow label="Påverkan / Resultat" value={impact} />
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
        className="text-xs uppercase tracking-wider font-medium mb-1"
        style={{ color: '#4A6FA5' }}
      >
        {label}
      </p>
      <p className="text-gray-300 text-sm leading-relaxed">{value}</p>
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────

function ChevronIcon({ expanded }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
