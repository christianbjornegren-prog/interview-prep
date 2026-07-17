import { useState } from 'react'
import { useUser } from '../components/AuthGate'
import { clearCompetencies, clearJobs, clearAll } from '../lib/userData'

const ACTIONS = [
  {
    key: 'competencies',
    label: 'Rensa kompetensbank',
    description: 'Tar bort alla extraherade kompetenser i din kompetensbank.',
    confirm:
      'Ta bort ALLA kompetenser i din kompetensbank? Detta går inte att ångra.',
    run: clearCompetencies,
  },
  {
    key: 'jobs',
    label: 'Rensa uppdrag',
    description:
      'Tar bort alla sparade uppdrag med frågor, gap-analyser och historik.',
    confirm: 'Ta bort ALLA dina uppdrag? Detta går inte att ångra.',
    run: clearJobs,
  },
]

export default function Settings() {
  const { user } = useUser()
  const [busyKey, setBusyKey] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function run(key, confirmText, fn, successFn) {
    if (!window.confirm(confirmText)) return
    setBusyKey(key)
    setMessage('')
    setError('')
    try {
      const result = await fn()
      setMessage(successFn(result))
    } catch (err) {
      console.error(err)
      setError(err.message ?? 'Något gick fel vid rensningen.')
    } finally {
      setBusyKey(null)
    }
  }

  const busy = busyKey !== null

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Inställningar
        </h1>
        <p className="mt-1 text-sm" style={{ color: '#6b7280' }}>
          Hantera och rensa din egna data. Endast ditt konto påverkas
          {user?.email ? ` – ${user.email}` : ''}.
        </p>
      </div>

      <section className="space-y-4">
        <p
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: '#f87171' }}
        >
          Rensa data
        </p>

        <div className="space-y-3">
          {ACTIONS.map((action) => (
            <div
              key={action.key}
              className="rounded-xl border p-5 flex items-center justify-between gap-4"
              style={{ backgroundColor: '#1d1d1d', borderColor: '#404040' }}
            >
              <div className="min-w-0">
                <h3 className="text-white font-semibold text-sm">
                  {action.label}
                </h3>
                <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
                  {action.description}
                </p>
              </div>
              <button
                onClick={() =>
                  run(action.key, action.confirm, action.run, (count) =>
                    typeof count === 'number'
                      ? `${action.label}: ${count} post${
                          count === 1 ? '' : 'er'
                        } borttagna.`
                      : `${action.label}: klart.`
                  )
                }
                disabled={busy}
                className="shrink-0 px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#8064ad' }}
              >
                {busyKey === action.key ? 'Rensar...' : 'Rensa'}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section
        className="rounded-xl border p-5 flex items-center justify-between gap-4"
        style={{ backgroundColor: '#2b0d0d', borderColor: '#4d1a1a' }}
      >
        <div className="min-w-0">
          <h3 className="text-white font-semibold text-sm">Rensa allt</h3>
          <p className="text-xs mt-1" style={{ color: '#f0a085' }}>
            Nollställ profilen helt – kompetensbank och alla uppdrag.
          </p>
        </div>
        <button
          onClick={() =>
            run(
              'all',
              'Ta bort ALL din data – kompetensbank och alla uppdrag? Detta går inte att ångra.',
              clearAll,
              (res) =>
                `Allt rensat: ${res.competencies} kompetenser och ${res.jobs} uppdrag borttagna.`
            )
          }
          disabled={busy}
          className="shrink-0 px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: '#c0392b' }}
        >
          {busyKey === 'all' ? 'Rensar...' : 'Rensa allt'}
        </button>
      </section>

      {message && (
        <p className="text-sm" style={{ color: '#4ade80' }}>
          {message}
        </p>
      )}
      {error && (
        <p className="text-sm" style={{ color: '#f87171' }}>
          {error}
        </p>
      )}
    </div>
  )
}
