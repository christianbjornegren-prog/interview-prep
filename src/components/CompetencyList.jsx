import { useEffect, useState } from 'react'
import { collection, onSnapshot, deleteDoc, doc, query, orderBy } from 'firebase/firestore'
import { db, auth } from '../lib/firebase'

// ── Tag colour categorisation ─────────────────────────────────────────────

const LEADERSHIP_TAGS = new Set([
  'ledarskap', 'chef', 'manager', 'hr', 'team', 'teamledare', 'teamledning',
  'personalansvar', 'mentorskap', 'coaching', 'strategisk', 'strategi',
  'förändringsledning', 'förändring', 'organisationsutveckling',
])

const TECH_TAGS = new Set([
  'teknik', 'azure', 'aws', 'gcp', 'python', 'javascript', 'typescript',
  'react', 'node', 'api', 'databas', 'sql', 'nosql', 'system', 'molnet',
  'cloud', 'devops', 'ci/cd', 'docker', 'kubernetes', 'java', 'c#', '.net',
  'programutveckling', 'mjukvaruutveckling', 'agile', 'scrum',
])

function tagStyle(tag) {
  const lower = tag.toLowerCase()
  if (LEADERSHIP_TAGS.has(lower)) {
    // slate-blue
    return { backgroundColor: '#1e2d45', color: '#7aa3d4' }
  }
  if (TECH_TAGS.has(lower)) {
    // green
    return { backgroundColor: '#0d2b1a', color: '#4ade80' }
  }
  // grey
  return { backgroundColor: '#1e1f2a', color: '#9ca3af' }
}

// ── Component ─────────────────────────────────────────────────────────────

export default function CompetencyList() {
  const [competencies, setCompetencies] = useState([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState(null)

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
        style={{ borderColor: '#2a2d3a' }}
      >
        <p className="text-sm" style={{ color: '#6b7280' }}>
          Ladda upp ditt CV eller LinkedIn-profil för att komma igång.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Total count header */}
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#4A6FA5' }}>
        {competencies.length} kompetens{competencies.length === 1 ? '' : 'er'} i din bank
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

// ── Card ──────────────────────────────────────────────────────────────────

function CompetencyCard({ competency, deleting, onDelete }) {
  const { title, description, tags, impact, context, sourceFile } = competency
  const [expanded, setExpanded] = useState(false)

  return (
    <li
      className="rounded-xl border p-5 transition-colors"
      style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-base leading-snug">
            {title}
          </h3>

          {/* Tags */}
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

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Dölj detaljer' : 'Visa detaljer'}
            className="p-1.5 rounded transition-colors"
            style={{ color: '#6b7280' }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
          >
            <ChevronIcon expanded={expanded} />
          </button>
          <button
            onClick={onDelete}
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

      {/* Description */}
      {description && (
        <p className="text-sm mt-3 leading-relaxed" style={{ color: '#d1d5db' }}>
          {description}
        </p>
      )}

      {/* Impact – always visible, italic */}
      {impact && (
        <p className="text-sm mt-2 leading-relaxed italic" style={{ color: '#9ca3af' }}>
          {impact}
        </p>
      )}

      {/* Expandable details */}
      {expanded && (
        <div
          className="mt-4 pt-4 space-y-3 border-t"
          style={{ borderColor: '#2a2d3a' }}
        >
          {context && <DetailRow label="Sammanhang" value={context} />}
          {sourceFile && <DetailRow label="Källfil" value={sourceFile} />}
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
        style={{ color: '#4A6FA5' }}
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
      style={{ transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
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
