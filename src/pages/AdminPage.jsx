import { useEffect, useState } from 'react'
import { collection, db, getDocs, doc, updateDoc, serverTimestamp } from '../lib/firebase'

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'konsult', label: 'Konsult' },
  { value: 'saljare', label: 'Säljare' },
]

export default function AdminPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [confirmation, setConfirmation] = useState(null) // { name, role }

  useEffect(() => {
    getDocs(collection(db, 'users')).then((snap) => {
      setUsers(
        snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
      )
      setLoading(false)
    })
  }, [])

  async function handleRoleChange(uid, newRole) {
    const userDoc = users.find((u) => u.uid === uid)
    if (!userDoc || userDoc.role === newRole) return

    await updateDoc(doc(db, 'users', uid), {
      role: newRole,
      updatedAt: serverTimestamp(),
    })

    setUsers((prev) =>
      prev.map((u) => (u.uid === uid ? { ...u, role: newRole } : u))
    )

    const roleLabel = ROLES.find((r) => r.value === newRole)?.label ?? newRole
    setConfirmation({ name: userDoc.name ?? userDoc.email, role: roleLabel })
    setTimeout(() => setConfirmation(null), 3000)
  }

  const filtered = users.filter((u) => {
    const q = search.toLowerCase()
    return (
      (u.name ?? '').toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q)
    )
  })

  function formatDate(ts) {
    const date = ts?.toDate?.()
    if (!date) return '–'
    return date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white tracking-tight">Användarhantering</h1>

      {/* Confirmation toast */}
      {confirmation && (
        <div
          className="rounded-lg border px-4 py-3 flex items-center gap-2 text-sm"
          style={{ backgroundColor: '#052e16', borderColor: '#166534', color: '#86efac' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {confirmation.name} är nu {confirmation.role} ✓
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="Sök på namn eller e-post..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm rounded-lg px-4 py-2 text-sm outline-none"
        style={{
          backgroundColor: '#1d1d1d',
          border: '1px solid #404040',
          color: '#fff',
        }}
      />

      {/* Table */}
      {loading ? (
        <p className="text-sm py-4" style={{ color: '#6b7280' }}>Laddar användare...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm py-4" style={{ color: '#6b7280' }}>Inga användare hittades.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: '#404040' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: '#1d1d1d', borderBottom: '1px solid #404040' }}>
                {['Namn', 'E-post', 'Roll', 'Ändrad'].map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest"
                    style={{ color: '#6b7280' }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => (
                <tr
                  key={u.uid}
                  style={{
                    backgroundColor: i % 2 === 0 ? '#141414' : '#000000',
                    borderBottom: i < filtered.length - 1 ? '1px solid #1e2130' : 'none',
                  }}
                >
                  <td className="px-4 py-3 font-medium text-white">
                    {u.name ?? '–'}
                  </td>
                  <td className="px-4 py-3" style={{ color: '#9ca3af' }}>
                    {u.email ?? '–'}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role ?? 'konsult'}
                      onChange={(e) => handleRoleChange(u.uid, e.target.value)}
                      className="rounded-md px-2 py-1 text-xs font-medium outline-none cursor-pointer"
                      style={{
                        backgroundColor: '#404040',
                        border: '1px solid #3a3d4a',
                        color: '#e5e7eb',
                      }}
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: '#6b7280' }}>
                    {formatDate(u.updatedAt ?? u.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
