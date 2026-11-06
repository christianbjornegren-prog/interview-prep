import { useMemo, useState } from 'react'
import FileUpload from './FileUpload'
import CompetencyList from './CompetencyList'
import AddCompetencyModal from './AddCompetencyModal'
import { cvDisplayName, cvCompetencies, cvUsageMap, describeCvError, toMillis } from '../lib/cvs'

/**
 * Överblick över en konsults CV:n. Ersätter den gamla samlade kompetensbanken:
 * här finns inga aggregerade kompetenser – varje CV visar SINA kompetenser och
 * vilka uppdrag som använder det. Kopplingen görs från uppdragen.
 *
 * Samma komponent för konsultens "Mina CV", säljarens konsultprofil och
 * väntande profiler – skillnaden ligger helt i vilket CV-lager som skickas in.
 *
 * @param {object}   store         – CV-lager (lib/cvStore.js)
 * @param {object[]} cvs           – från useCvs(store)
 * @param {object[]} jobs          – konsultens uppdrag (för "Används i")
 * @param {() => void} onChanged   – ladda om efter en ändring
 * @param {(job) => void} [onOpenJob]
 * @param {boolean}  [showNextStep]
 * @param {string}   [uploadLabel]
 */
export default function CvLibrary({
  store, cvs, jobs = [], loading, error, onChanged, onOpenJob,
  showNextStep = false, uploadLabel = '+ Ladda upp CV',
}) {
  const [showUpload, setShowUpload] = useState(false)
  const usage = useMemo(() => cvUsageMap(cvs, jobs), [cvs, jobs])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8064ad' }}>
          {cvs.length} CV
        </p>
        <button
          onClick={() => setShowUpload((v) => !v)}
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          style={{ backgroundColor: '#8064ad1f', border: '1px solid #8064ad', color: '#e4dbf2' }}
          onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
          onMouseOut={(e) => (e.currentTarget.style.color = '#9ca3af')}
          aria-expanded={showUpload}
        >
          {showUpload ? 'Stäng uppladdning' : uploadLabel}
        </button>
      </div>

      {showUpload && (
        <div className="rounded-xl border p-5" style={{ backgroundColor: '#1d1d1d', borderColor: '#404040' }}>
          <FileUpload store={store} showNextStep={showNextStep} onSuccess={() => onChanged?.()} />
        </div>
      )}

      {error && <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>}

      {loading ? (
        <p className="text-sm" style={{ color: '#6b7280' }}>Laddar CV:n...</p>
      ) : cvs.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed p-10 text-center space-y-2" style={{ borderColor: '#404040' }}>
          <p className="text-sm text-white">Inga CV:n uppladdade än.</p>
          <p className="text-sm" style={{ color: '#6b7280' }}>
            Ladda upp ett CV per profil du vill använda – t.ex. ett för arkitektroller och ett för
            projektledning. Sedan kopplar du rätt CV till varje uppdrag.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {cvs.map((cv) => (
            <CvCard
              key={cv.id}
              cv={cv}
              store={store}
              usedBy={usage[cv.id] ?? []}
              onChanged={onChanged}
              onOpenJob={onOpenJob}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function formatDate(value) {
  const ms = toMillis(value)
  if (!ms) return null
  return new Date(ms).toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' })
}

function CvCard({ cv, store, usedBy, onChanged, onOpenJob }) {
  const [expanded, setExpanded] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [label, setLabel] = useState(cvDisplayName(cv))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const name = cvDisplayName(cv)
  const competencies = cvCompetencies(cv)
  const date = formatDate(cv.createdAt)

  async function run(fn) {
    setBusy(true)
    setErr('')
    try {
      await fn()
      await onChanged?.()
    } catch (e) {
      console.error(e)
      setErr(describeCvError(e))
    } finally {
      setBusy(false)
    }
  }

  async function saveName() {
    if (label.trim() === name) { setRenaming(false); return }
    await run(() => store.rename(cv.id, label))
    setRenaming(false)
  }

  return (
    <li className="rounded-xl border" style={{ backgroundColor: '#1d1d1d', borderColor: '#404040' }}>
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {renaming ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => { e.preventDefault(); saveName() }}
              >
                <input
                  autoFocus
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && (setLabel(name), setRenaming(false))}
                  aria-label="CV:ts namn"
                  className="flex-1 min-w-0 rounded-lg border px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#8064ad]"
                  style={{ backgroundColor: '#141414', borderColor: '#404040' }}
                />
                <button type="submit" disabled={busy || !label.trim()} className="text-xs font-semibold disabled:opacity-50" style={{ color: '#b19ae0' }}>
                  Spara
                </button>
                <button type="button" onClick={() => { setLabel(name); setRenaming(false) }} className="text-xs" style={{ color: '#6b7280' }}>
                  Avbryt
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <DocIcon />
                <h3 className="text-white font-semibold text-base leading-snug break-words">{name}</h3>
                <button
                  onClick={() => setRenaming(true)}
                  className="text-xs transition-colors"
                  style={{ color: '#6b7280' }}
                  onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
                  onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
                >
                  Byt namn
                </button>
              </div>
            )}
            <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
              {[
                cv.fileName && cv.fileName !== name ? cv.fileName : null,
                date ? `Uppladdat ${date}` : null,
                `${competencies.length} kompetens${competencies.length === 1 ? '' : 'er'}`,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>

          {!confirmDelete && (
            <button
              onClick={() => { setConfirmDelete(true); setErr('') }}
              className="text-xs transition-colors shrink-0"
              style={{ color: '#6b7280' }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#f87171')}
              onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
            >
              Radera
            </button>
          )}
        </div>

        {/* Används i */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs" style={{ color: '#9ca3af' }}>Används i:</span>
          {usedBy.length === 0 ? (
            <span className="text-xs" style={{ color: '#6b7280' }}>Inget uppdrag än</span>
          ) : (
            usedBy.map((job) => (
              <button
                key={job.docId ?? job.id}
                onClick={() => onOpenJob?.(job)}
                disabled={!onOpenJob}
                className="text-xs font-medium px-2 py-0.5 rounded-full transition-colors disabled:cursor-default"
                style={{ backgroundColor: '#8064ad20', color: '#b9a5d6', border: '1px solid #8064ad40' }}
              >
                {job.jobTitle || 'Namnlöst uppdrag'}{job.company ? ` · ${job.company}` : ''}
              </button>
            ))
          )}
        </div>

        {confirmDelete && (
          <div className="rounded-lg border p-3 space-y-2" style={{ backgroundColor: '#2b0d0d', borderColor: '#4d1a1a' }}>
            <p className="text-sm" style={{ color: '#f0a085' }}>
              Radera "{name}" och dess {competencies.length} kompetenser? Det går inte att ångra.
            </p>
            {usedBy.length > 0 && (
              <p className="text-xs" style={{ color: '#d1d5db' }}>
                CV:t används av {usedBy.length} uppdrag ({usedBy.map((j) => j.jobTitle || 'Namnlöst').join(', ')}).
                De behåller sin historik men behöver ett nytt CV innan träning kan starta.
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2.5 py-1 rounded text-xs font-medium"
                style={{ backgroundColor: '#404040', color: '#9ca3af' }}
              >
                Avbryt
              </button>
              <button
                onClick={() => run(() => store.remove(cv.id))}
                disabled={busy}
                className="px-2.5 py-1 rounded text-xs font-medium disabled:opacity-60"
                style={{ backgroundColor: '#5b1a1a', color: '#f87171' }}
              >
                {busy ? 'Raderar...' : 'Ja, radera CV:t'}
              </button>
            </div>
          </div>
        )}

        {err && <p className="text-xs" style={{ color: '#f87171' }}>{err}</p>}

        <div className="flex items-center gap-4">
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="text-xs font-semibold transition-colors"
            style={{ color: '#8064ad' }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#b19ae0')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#8064ad')}
          >
            {expanded ? 'Dölj kompetenser' : 'Visa kompetenser'}
          </button>
          {expanded && (
            <button
              onClick={() => setShowAdd(true)}
              className="text-xs transition-colors"
              style={{ color: '#6b7280' }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
              onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
            >
              + Lägg till kompetens
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t p-4" style={{ borderColor: '#323232' }}>
          <CompetencyList
            competencies={competencies}
            onDelete={(index) => run(() => store.removeCompetency(cv.id, index))}
          />
        </div>
      )}

      {showAdd && (
        <AddCompetencyModal
          cvName={name}
          onClose={() => setShowAdd(false)}
          onSave={async (comp) => {
            await store.addCompetency(cv.id, comp)
            await onChanged?.()
          }}
        />
      )}
    </li>
  )
}

function DocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8064ad"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}
