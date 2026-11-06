import { useState } from 'react'
import FileUpload from './FileUpload'
import { LINK_CV_STEPS } from '../lib/progressSteps'
import { useProgressSteps } from '../lib/useProgressSteps'
import { analyzeJobPosting } from '../lib/claude'
import {
  describeCvError,
  cvCompetencies,
  cvDisplayName,
  findCv,
  linkCvToJob,
  resolveJobCv,
  toMillis,
} from '../lib/cvs'

/**
 * Pekar ut vilket CV som gäller för ETT uppdrag. Uppdraget styr: det har
 * exakt ett CV, och ett CV kan användas av flera uppdrag.
 *
 * Att koppla (eller byta) CV kör om analysen – kravmatchning och frågor – mot
 * just det CV:t. Kopplingen sparas först när analysen lyckats, så uppdraget
 * pekar aldrig på ett CV som analysen inte bygger på (se linkCvToJob).
 *
 * Används av säljaren (konsultprofilens Uppdrag-flik, väntande profil) och av
 * konsulten själv (uppdragssidan). Båda får koppla och byta.
 *
 * @param {object}   job       – uppdraget ({ docId, cvId, rawJobText, ... })
 * @param {object[]} cvs       – konsultens CV:n
 * @param {object}   store     – CV-lagret (create + saveJob)
 * @param {() => void} onChanged – ladda om uppdrag/CV:n efter en ändring
 * @param {'card'|'banner'} [variant]
 */
export default function JobCvPicker({ job, cvs, store, onChanged, variant = 'card' }) {
  const { status, cv: current } = resolveJobCv(job, cvs)
  const [pendingCvId, setPendingCvId] = useState('') // väntar på bekräftelse av byte
  const [linking, setLinking] = useState(null)        // CV som analyseras just nu
  const [error, setError] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const progress = useProgressSteps(LINK_CV_STEPS)

  async function link(cv) {
    setError('')
    setPendingCvId('')
    setLinking(cv)
    try {
      await linkCvToJob({
        job,
        cv,
        analyze: (text, info, comps) => analyzeJobPosting(text, info, comps),
        save: (jobId, update) => store.saveJob(jobId, update),
        onPhase: progress.enterPhase,
      })
      await onChanged?.()
    } catch (err) {
      console.error('Kunde inte koppla CV:', err)
      setError(`Kunde inte koppla CV:t: ${describeCvError(err)} Uppdraget är oförändrat.`)
    } finally {
      setLinking(null)
      progress.reset()
    }
  }

  function handleSelect(cvId) {
    if (!cvId || cvId === current?.id) return
    const cv = findCv(cvs, cvId)
    if (!cv) return
    // Byte från ett befintligt CV bekräftas – frågorna och analysen görs om.
    if (status === 'linked') setPendingCvId(cvId)
    else link(cv)
  }

  async function handleUploaded(cv) {
    setShowUpload(false)
    await onChanged?.()
    await link(cv)
  }

  const pendingCv = findCv(cvs, pendingCvId)
  const needsCv = status !== 'linked'
  const isBanner = variant === 'banner'

  // Ingen-CV-läget är en tydlig men NEUTRAL inforuta (lila kant). Amber är
  // reserverat för "Prioritera dessa".
  const containerStyle = needsCv
    ? { backgroundColor: '#1a1626', borderColor: '#8064ad80' }
    : { backgroundColor: isBanner ? '#1d1d1d' : '#141414', borderColor: '#323232' }

  return (
    <div className="rounded-xl border p-4 space-y-3" style={containerStyle}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8064ad' }}>
            CV för uppdraget
          </p>
          {status === 'linked' ? (
            <p className="text-sm text-white mt-1 break-words">
              {cvDisplayName(current)}
              <span style={{ color: '#6b7280' }}>
                {' '}· {cvCompetencies(current).length} kompetenser
              </span>
            </p>
          ) : (
            <>
              <p className="text-sm font-semibold text-white mt-1">
                {status === 'missing' ? 'Det kopplade CV:t finns inte längre' : 'Inget CV kopplat än'}
              </p>
              <p className="text-sm mt-1 max-w-xl" style={{ color: '#9ca3af' }}>
                {status === 'missing'
                  ? 'Välj ett annat CV för att kunna träna.'
                  : cvs.length === 0
                  ? 'Ladda upp det CV som gäller för uppdraget – frågorna och feedbacken bygger på det.'
                  : 'Välj vilket CV som gäller för uppdraget – frågorna och feedbacken bygger på det.'}
              </p>
            </>
          )}
        </div>

        {!linking && (
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {cvs.length > 0 && (
              <label className="flex items-center">
                <span className="sr-only">Välj CV för uppdraget</span>
                <select
                  value={pendingCvId || current?.id || ''}
                  onChange={(e) => handleSelect(e.target.value)}
                  className="rounded-lg border px-3 py-2 text-sm text-white focus:outline-none focus:border-[#8064ad] max-w-[18rem]"
                  style={{ backgroundColor: '#141414', borderColor: needsCv ? '#8064ad' : '#404040' }}
                >
                  {!current && <option value="">Välj CV…</option>}
                  {cvs.map((cv) => (
                    <option key={cv.id} value={cv.id}>{optionLabel(cv)}</option>
                  ))}
                </select>
              </label>
            )}
            <UploadButton
              open={showUpload}
              onClick={() => setShowUpload((v) => !v)}
              // Utan CV:n är uppladdning DEN åtgärden som gäller – tydlig
              // kontur i accentfärg. Annars en diskret sekundär knapp.
              emphasized={needsCv && cvs.length === 0}
              label={cvs.length === 0 ? 'Ladda upp CV' : 'Ladda upp nytt'}
            />
          </div>
        )}
      </div>

      {pendingCv && !linking && (
        <div className="rounded-lg border p-3 space-y-2" style={{ backgroundColor: '#141414', borderColor: '#404040' }}>
          <p className="text-sm text-white">
            Byta till "{cvDisplayName(pendingCv)}"?
          </p>
          <p className="text-xs" style={{ color: '#9ca3af' }}>
            Kravmatchningen och intervjufrågorna görs om mot det nya CV:t. Tidigare
            träningar och feedback finns kvar.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPendingCvId('')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ backgroundColor: '#404040', color: '#d1d5db' }}
            >
              Avbryt
            </button>
            <button
              onClick={() => link(pendingCv)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: 'transparent', border: '1px solid #8064ad', color: '#d8ccec' }}
            >
              Byt CV
            </button>
          </div>
        </div>
      )}

      {linking && (
        <LinkProgress cvName={cvDisplayName(linking)} index={progress.index} />
      )}

      {error && !linking && (
        <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>
      )}

      {showUpload && !linking && (
        <div className="pt-1">
          <p className="text-xs mb-2" style={{ color: '#9ca3af' }}>
            CV:t sparas hos konsulten och kopplas direkt till det här uppdraget.
          </p>
          <FileUpload store={store} onSuccess={handleUploaded} />
        </div>
      )}
    </div>
  )
}

function UploadButton({ open, onClick, emphasized, label }) {
  const base = emphasized
    ? { backgroundColor: '#8064ad1f', border: '1px solid #8064ad', color: '#e4dbf2' }
    : { backgroundColor: 'transparent', border: '1px solid #404040', color: '#d1d5db' }
  return (
    <button
      onClick={onClick}
      aria-expanded={open}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
      style={base}
      onMouseOver={(e) => { e.currentTarget.style.borderColor = '#9781be'; e.currentTarget.style.color = '#fff' }}
      onMouseOut={(e) => { e.currentTarget.style.borderColor = base.border.split(' ').pop(); e.currentTarget.style.color = base.color }}
    >
      {open ? <CloseIcon /> : <UploadIcon />}
      {open ? 'Stäng' : label}
    </button>
  )
}

function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

/**
 * Kompakt stegvisning inne i uppdragskortet: aktuellt steg med förklaring,
 * plus en stegrad så man ser att det rör sig framåt.
 */
function LinkProgress({ cvName, index }) {
  const step = LINK_CV_STEPS[Math.min(index, LINK_CV_STEPS.length - 1)]
  const done = index >= LINK_CV_STEPS.length
  return (
    <div className="rounded-lg border p-3 space-y-2" role="status" aria-live="polite"
      style={{ backgroundColor: '#141414', borderColor: '#323232' }}>
      <div className="flex items-center gap-3">
        <Spinner />
        <div className="min-w-0">
          <p className="text-sm text-white">
            {done ? 'Klart!' : step.label}
            <span style={{ color: '#6b7280' }}> · {cvName}</span>
          </p>
          {!done && <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>{step.subtext}</p>}
        </div>
      </div>
      <div className="flex gap-1" aria-hidden="true">
        {LINK_CV_STEPS.map((s, i) => (
          <span
            key={s.label}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{ backgroundColor: i < index || done ? '#22c55e' : i === index ? '#8064ad' : '#323232' }}
          />
        ))}
      </div>
      <p className="text-xs" style={{ color: '#6b7280' }}>
        Steg {Math.min(index + 1, LINK_CV_STEPS.length)} av {LINK_CV_STEPS.length} – tar oftast runt en minut, ibland längre.
      </p>
    </div>
  )
}

function optionLabel(cv) {
  const ms = toMillis(cv.createdAt)
  const date = ms
    ? new Date(ms).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' })
    : null
  return [cvDisplayName(cv), date].filter(Boolean).join(' · ')
}

function Spinner() {
  return (
    <span
      className="inline-block shrink-0 animate-spin rounded-full"
      style={{ width: 16, height: 16, border: '2px solid #8064ad', borderTopColor: 'transparent' }}
      aria-hidden="true"
    />
  )
}
