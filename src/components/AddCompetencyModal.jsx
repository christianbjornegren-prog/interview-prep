import { useState } from 'react'
import { CATEGORY_ENUM } from '../lib/claude'

/**
 * Lägg till en kompetens manuellt i ETT CV. Delas av konsultens CV-vy,
 * säljarens konsultprofil och väntande profiler.
 *
 * @param {string} cvName – visas i rubriken så det är tydligt vilket CV som ändras
 * @param {(competency: object) => Promise<void>} onSave
 */
export default function AddCompetencyModal({ cvName, onClose, onSave }) {
  const [form, setForm] = useState({ namn: '', kategori: 'Övrigt', beskrivning: '', taggar: '' })
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
      await onSave({
        title: form.namn.trim(),
        description: form.beskrivning.trim(),
        tags,
        category: form.kategori,
      })
      onClose()
    } catch (err) {
      console.error(err)
      setError(err.message ?? 'Kunde inte spara. Försök igen.')
      setSaving(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border px-3 py-2 text-sm text-input-text placeholder:text-[var(--color-input-placeholder)] focus:outline-none focus:border-focus-ring'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Lägg till kompetens"
        className="w-full max-w-md rounded-2xl border p-6 space-y-5 max-sm:p-5 max-sm:max-h-[calc(100dvh-2rem)] max-sm:overflow-y-auto"
        style={{ backgroundColor: 'var(--color-background-primary)', borderColor: 'var(--color-border-default)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-text-primary font-medium text-lg">Lägg till kompetens</h2>
            {cvName && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                I CV:t <span className="text-text-primary">{cvName}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Stäng" className="text-sm transition-colors tap-target max-sm:-my-3 max-sm:px-2 max-sm:-mx-2" style={{ color: 'var(--color-text-secondary)' }}
            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
          >✕</button>
        </div>

        <Field label="Namn *">
          <input
            type="text" autoFocus value={form.namn}
            onChange={(e) => update('namn', e.target.value)}
            placeholder="T.ex. Strategiskt ledarskap i offentlig sektor"
            className={inputClass} style={{ backgroundColor: 'var(--color-input-background)', borderColor: 'var(--color-input-border)' }}
          />
        </Field>
        <Field label="Kategori">
          <select
            value={form.kategori}
            onChange={(e) => update('kategori', e.target.value)}
            className={inputClass} style={{ backgroundColor: 'var(--color-input-background)', borderColor: 'var(--color-input-border)' }}
          >
            {CATEGORY_ENUM.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Beskrivning">
          <textarea
            value={form.beskrivning}
            onChange={(e) => update('beskrivning', e.target.value)}
            placeholder="Vad personen gjort och hur..."
            rows={3}
            className={inputClass + ' p-3'}
            style={{ backgroundColor: 'var(--color-input-background)', borderColor: 'var(--color-input-border)', resize: 'vertical' }}
          />
        </Field>
        <Field label="Taggar (kommaseparerade)">
          <input
            type="text" value={form.taggar}
            onChange={(e) => update('taggar', e.target.value)}
            placeholder="ledarskap, strategi, governance"
            className={inputClass} style={{ backgroundColor: 'var(--color-input-background)', borderColor: 'var(--color-input-border)' }}
          />
        </Field>

        {error && <p className="text-xs" style={{ color: 'var(--color-feedback-error)' }}>{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors max-sm:py-3"
            style={{ backgroundColor: 'var(--color-background-tertiary)', color: 'var(--color-text-secondary)' }}
          >
            Avbryt
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-action-primary-text transition-colors disabled:opacity-60 max-sm:py-3"
            style={{ backgroundColor: 'var(--color-action-primary-background)' }}
            onMouseOver={(e) => !saving && (e.currentTarget.style.backgroundColor = 'var(--color-action-primary-background-hover)')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-action-primary-background)')}
          >
            {saving ? 'Sparar...' : 'Spara kompetens'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-accent-purple)' }}>
        {label}
      </span>
      {children}
    </label>
  )
}
