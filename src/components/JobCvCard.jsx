import { coverageFromJob } from '../lib/gapAnalysis'
import { resolveJobCv } from '../lib/cvs'
import JobCvPicker from './JobCvPicker'

/**
 * Ett uppdrag i säljarens konsultvy (aktiv eller väntande profil): titel,
 * kund, matchning – och CV-kopplingen direkt under. Matchningen visas bara
 * när ett CV är kopplat; utan CV finns ingen meningsfull matchning.
 */
export default function JobCvCard({ job, cvs, loadingCvs, store, onChanged, onOpen }) {
  const linked = resolveJobCv(job, cvs).status === 'linked'
  const { covered, total } = coverageFromJob(job)
  const scoreRatio = linked && total > 0 ? covered / total : null
  const matchColor = scoreRatio === null ? 'var(--color-text-secondary)'
    : scoreRatio >= 0.7 ? 'var(--color-feedback-success)'
    : scoreRatio >= 0.4 ? 'var(--color-feedback-warning)'
    : 'var(--color-feedback-error)'

  return (
    <li className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: 'var(--color-background-primary)', borderColor: 'var(--color-border-default)', opacity: job.archived ? 0.7 : 1 }}>
      <button
        onClick={onOpen}
        disabled={!onOpen}
        className="w-full text-left group"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-text-primary font-medium text-base leading-snug group-hover:underline">
              {job.jobTitle || 'Namnlös jobbannons'}
            </h3>
            {job.company && <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{job.company}</p>}
          </div>
          {job.archived && (
            <span className="text-xs px-2 py-0.5 rounded shrink-0" style={{ backgroundColor: 'var(--color-tag-neutral-background)', color: 'var(--color-tag-neutral-text)' }}>
              Arkiverat
            </span>
          )}
        </div>
        {scoreRatio !== null && (
          <span
            className="inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `color-mix(in srgb, ${matchColor} 12%, transparent)`, color: matchColor, border: `1px solid color-mix(in srgb, ${matchColor} 25%, transparent)` }}
          >
            Matchning: {covered} av {total} krav
          </span>
        )}
      </button>

      {loadingCvs ? (
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Laddar CV:n...</p>
      ) : (
        <JobCvPicker job={job} cvs={cvs} store={store} onChanged={onChanged} />
      )}
    </li>
  )
}
