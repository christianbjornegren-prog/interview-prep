import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, db, getDocs } from '../lib/firebase'

const KONSULT_EMAILS = [
  'christian.bjornegren@gmail.com',
  'christian@boulder.se',
  'filip.almstrom@boulder.se',
]

export default function SäljarePage() {
  const navigate = useNavigate()
  const [konsulter, setKonsulter] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const usersSnap = await getDocs(collection(db, 'users'))
      const filtered = usersSnap.docs
        .map((d) => ({ uid: d.id, ...d.data() }))
        .filter((u) => KONSULT_EMAILS.includes(u.email))

      const withCounts = await Promise.all(
        filtered.map(async (u) => {
          const [compSnap, jobsSnap] = await Promise.all([
            getDocs(collection(db, 'users', u.uid, 'competencies')),
            getDocs(collection(db, 'users', u.uid, 'jobs')),
          ])
          return { ...u, competencyCount: compSnap.size, jobCount: jobsSnap.size }
        })
      )

      setKonsulter(withCounts)
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white tracking-tight">Konsulter</h1>

      {loading ? (
        <p className="text-sm py-8" style={{ color: '#6b7280' }}>Laddar konsulter...</p>
      ) : konsulter.length === 0 ? (
        <p className="text-sm py-8" style={{ color: '#6b7280' }}>
          Inga konsulter hittades.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {konsulter.map((k) => (
            <KonsultCard key={k.uid} konsult={k} onClick={() => navigate(`/konsulter/${k.uid}`)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function KonsultCard({ konsult, onClick }) {
  const initials = (konsult.name ?? konsult.email ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <li>
      <button
        onClick={onClick}
        className="w-full text-left rounded-xl border p-5 space-y-4 transition-colors"
        style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
        onMouseOver={(e) => (e.currentTarget.style.borderColor = '#4A6FA5')}
        onMouseOut={(e) => (e.currentTarget.style.borderColor = '#2a2d3a')}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
            style={{ backgroundColor: '#4A6FA5' }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold truncate">{konsult.name ?? '–'}</p>
            <p className="text-xs truncate" style={{ color: '#6b7280' }}>{konsult.email ?? '–'}</p>
          </div>
        </div>

        <div className="flex gap-6">
          <Stat label="Kompetenser" value={konsult.competencyCount} />
          <Stat label="Uppdrag" value={konsult.jobCount} />
        </div>
      </button>
    </li>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-xs" style={{ color: '#6b7280' }}>{label}</p>
    </div>
  )
}
