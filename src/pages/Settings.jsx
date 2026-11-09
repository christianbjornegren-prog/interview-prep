import { useState } from 'react'
import { useUser } from '../components/AuthGate'
import { clearCvs, clearJobs, clearAll } from '../lib/userData'

const ACTIONS = [
  {
    key: 'cvs',
    label: 'Rensa CV:n',
    description:
      'Tar bort alla dina CV:n och deras kompetenser. Uppdragen finns kvar men behöver ett nytt CV kopplat innan du kan träna.',
    confirm: 'Ta bort ALLA dina CV:n? Detta går inte att ångra.',
    run: clearCvs,
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
        <h1 className="text-2xl font-medium text-text-primary tracking-tight">
          Inställningar
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Hantera och rensa din egna data. Endast ditt konto påverkas
          {user?.email ? ` – ${user.email}` : ''}.
        </p>
      </div>

      <section className="space-y-4">
        <p
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--color-feedback-error)' }}
        >
          Rensa data
        </p>

        <div className="space-y-3">
          {ACTIONS.map((action) => (
            <div
              key={action.key}
              className="rounded-xl border p-5 flex items-center justify-between gap-4"
              style={{ backgroundColor: 'var(--color-background-primary)', borderColor: 'var(--color-border-default)' }}
            >
              <div className="min-w-0">
                <h3 className="text-text-primary font-medium text-sm">
                  {action.label}
                </h3>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
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
                className="shrink-0 px-4 py-2 rounded-lg text-action-primary-text text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--color-action-primary-background)' }}
              >
                {busyKey === action.key ? 'Rensar...' : 'Rensa'}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section
        className="rounded-xl border p-5 flex items-center justify-between gap-4"
        style={{ backgroundColor: 'var(--color-feedback-error-background)', borderColor: 'var(--color-feedback-error)' }}
      >
        <div className="min-w-0">
          <h3 className="text-text-primary font-medium text-sm">Rensa allt</h3>
          <p className="text-xs mt-1" style={{ color: 'var(--color-feedback-error)' }}>
            Nollställ profilen helt – alla CV:n och alla uppdrag.
          </p>
        </div>
        <button
          onClick={() =>
            run(
              'all',
              'Ta bort ALL din data – alla CV:n och alla uppdrag? Detta går inte att ångra.',
              clearAll,
              (res) =>
                `Allt rensat: ${res.cvs} CV och ${res.jobs} uppdrag borttagna.`
            )
          }
          disabled={busy}
          className="shrink-0 px-4 py-2 rounded-lg text-action-danger-text text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--color-action-danger-background)' }}
        >
          {busyKey === 'all' ? 'Rensar...' : 'Rensa allt'}
        </button>
      </section>

      {message && (
        <p className="text-sm" style={{ color: 'var(--color-feedback-success)' }}>
          {message}
        </p>
      )}
      {error && (
        <p className="text-sm" style={{ color: 'var(--color-feedback-error)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
