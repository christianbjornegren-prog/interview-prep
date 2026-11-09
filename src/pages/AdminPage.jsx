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
  const [actionError, setActionError] = useState('')

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

    try {
      await updateDoc(doc(db, 'users', uid), {
        role: newRole,
        updatedAt: serverTimestamp(),
      })
    } catch (err) {
      console.error('Kunde inte ändra roll:', err)
      setActionError('Kunde inte ändra rollen. Försök igen.')
      setTimeout(() => setActionError(''), 4000)
      return
    }

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
      <h1 className="text-2xl font-medium text-text-primary tracking-tight">Användarhantering</h1>

      {/* Confirmation toast */}
      {confirmation && (
        <div
          className="rounded-lg border px-4 py-3 flex items-center gap-2 text-sm"
          style={{ backgroundColor: 'var(--color-feedback-success-background)', borderColor: 'var(--color-feedback-success)', color: 'var(--color-feedback-success)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {confirmation.name} är nu {confirmation.role} ✓
        </div>
      )}

      {/* Error toast */}
      {actionError && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ backgroundColor: 'var(--color-feedback-error-background)', borderColor: 'var(--color-feedback-error)', color: 'var(--color-feedback-error)' }}
        >
          {actionError}
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
          backgroundColor: 'var(--color-input-background)',
          border: '1px solid var(--color-input-border)',
          color: 'var(--color-input-text)',
        }}
      />

      {/* Table */}
      {loading ? (
        <p className="text-sm py-4" style={{ color: 'var(--color-text-secondary)' }}>Laddar användare...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm py-4" style={{ color: 'var(--color-text-secondary)' }}>Inga användare hittades.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--color-border-default)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: 'var(--color-background-tertiary)', borderBottom: '1px solid var(--color-border-default)' }}>
                {['Namn', 'E-post', 'Roll', 'Ändrad'].map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--color-text-secondary)' }}
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
                    backgroundColor: i % 2 === 0 ? 'var(--color-background-primary)' : 'var(--color-background-secondary)',
                    borderBottom: i < filtered.length - 1 ? '1px solid var(--color-border-default)' : 'none',
                  }}
                >
                  <td className="px-4 py-3 font-medium text-text-primary">
                    {u.name ?? '–'}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                    {u.email ?? '–'}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role ?? 'konsult'}
                      onChange={(e) => handleRoleChange(u.uid, e.target.value)}
                      className="rounded-md px-2 py-1 text-xs font-medium outline-none cursor-pointer"
                      style={{
                        backgroundColor: 'var(--color-input-background)',
                        border: '1px solid var(--color-input-border)',
                        color: 'var(--color-input-text)',
                      }}
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
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
