import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { extractCompetencies } from '../lib/claude'
import { cvDisplayName, describeCvError } from '../lib/cvs'
import StepIndicator from './StepIndicator'
import { getCvFileType, validateCvFile } from '../lib/jobCreation'
import { CV_UPLOAD_STEPS } from '../lib/progressSteps'
import { useProgressSteps } from '../lib/useProgressSteps'

/**
 * Laddar upp ETT CV: extraherar kompetenserna och sparar dem som ett eget CV
 * via CV-lagret (lib/cvStore.js). Varje uppladdning blir ett nytt CV – ingen
 * sammanslagning eller dubblettkoll mot andra CV:n, eftersom varje CV är en
 * egen, medvetet förfinad version av profilen.
 *
 * @param {object}   store          – createUserCvStore(uid) / createPendingCvStore(email)
 * @param {(cv) => void} [onSuccess] – anropas med det sparade CV:t
 * @param {boolean}  [showNextStep] – visa "lägg till uppdrag"-länken (konsultens egen vy)
 * @param {(busy: boolean) => void} [onBusyChange] – true medan CV:t analyseras/sparas
 */
export default function FileUpload({ store, onSuccess, showNextStep = false, onBusyChange } = {}) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [message, setMessage] = useState('')
  const progress = useProgressSteps(CV_UPLOAD_STEPS)
  const [savedCv, setSavedCv] = useState(null)

  function handleFileSelect(file) {
    if (!file) return
    const invalid = validateCvFile(file)
    if (invalid) {
      setStatus('error')
      setMessage(invalid)
      setSelectedFile(null)
      return
    }
    setSelectedFile(file)
    setStatus('idle')
    setMessage('')
  }

  async function handleAnalyze() {
    if (!selectedFile) return
    const fileType = getCvFileType(selectedFile)

    setStatus('loading')
    setMessage('')
    progress.enterPhase('cv')
    onBusyChange?.(true)

    try {
      const competencies = await extractCompetencies(selectedFile, fileType)

      progress.enterPhase('cv-save')
      const cv = await store.create({
        fileName: selectedFile.name,
        competencies,
        source: 'upload',
      })

      // Visa "allt klart" en kort stund innan kvittensen
      progress.enterPhase('done')
      await new Promise((r) => setTimeout(r, 800))
      setSavedCv(cv)
      setStatus('success')
      setSelectedFile(null)
      onSuccess?.(cv)
    } catch (err) {
      console.error(err)
      setStatus('error')
      setMessage(describeCvError(err))
    } finally {
      onBusyChange?.(false)
    }
  }

  function resetForAnotherUpload() {
    setStatus('idle')
    setMessage('')
    setSelectedFile(null)
    setSavedCv(null)
    progress.reset()
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    handleFileSelect(e.dataTransfer.files?.[0])
  }

  function onInputChange(e) {
    handleFileSelect(e.target.files?.[0])
    e.target.value = ''
  }

  const isLoading = status === 'loading'

  return (
    <div className="space-y-3">
      {/* Step indicator while Claude is working */}
      {isLoading && (
        <StepIndicator steps={CV_UPLOAD_STEPS} currentStep={progress.index} />
      )}

      {/* Drop zone – hidden while loading and after a successful upload */}
      {!isLoading && status !== 'success' && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={[
            'flex flex-col items-center justify-center gap-3',
            'border-2 border-dashed rounded-xl p-10 max-sm:p-6 transition-colors select-none cursor-pointer',
            dragging
              ? 'border-link-text bg-action-secondary-background-hover'
              : 'border-border-default hover:border-action-secondary-border',
          ].join(' ')}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx"
            className="hidden"
            onChange={onInputChange}
          />

          {selectedFile ? (
            <>
              <FileIcon />
              <div className="text-center">
                <p className="text-text-primary text-sm font-semibold">{selectedFile.name}</p>
                <p className="text-text-secondary text-xs mt-1">
                  Klicka för att välja en annan fil
                </p>
              </div>
            </>
          ) : (
            <>
              <UploadIcon />
              <div className="text-center">
                <p className="text-text-primary text-sm font-medium">
                  Dra och släpp ditt CV här
                </p>
                <p className="text-text-secondary text-xs mt-1">
                  eller klicka för att välja fil &mdash; PDF eller DOCX
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Analyse button – only visible when a file is selected */}
      {selectedFile && !isLoading && (
        <button
          onClick={handleAnalyze}
          className="w-full py-3 rounded-lg text-action-primary-text text-sm font-semibold transition-colors"
          style={{ backgroundColor: 'var(--color-action-primary-background)' }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-action-primary-background-hover)')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-action-primary-background)')}
        >
          Analysera dokument
        </button>
      )}

      {/* Success state – replaces the upload form until user chooses to upload again */}
      {status === 'success' && (
        <div
          className="rounded-xl p-5 space-y-3"
          style={{ backgroundColor: 'var(--color-feedback-success-background)', border: '1px solid var(--color-feedback-success)' }}
        >
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--color-feedback-success)' }}><CheckIcon /></span>
            <p className="text-base font-semibold" style={{ color: 'var(--color-feedback-success)' }}>
              CV:t "{cvDisplayName(savedCv)}" är sparat
            </p>
          </div>
          <p className="text-xs" style={{ color: 'var(--color-feedback-success)' }}>
            {savedCv?.competencyCount ?? 0} kompetens{savedCv?.competencyCount === 1 ? '' : 'er'} hittades.
            Koppla CV:t till de uppdrag det är skrivet för.
          </p>

          {/* Nästa steg – endast för konsultens egen uppladdning (ej säljare) */}
          {showNextStep && (
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-sm font-semibold transition-colors max-sm:min-h-11"
              style={{ color: 'var(--color-link-text)' }}
              onMouseOver={(e) => (e.currentTarget.style.color = 'var(--color-link-text-hover)')}
              onMouseOut={(e) => (e.currentTarget.style.color = 'var(--color-link-text)')}
            >
              Nästa steg: koppla CV:t till ett uppdrag →
            </Link>
          )}

          <div>
            <button
              onClick={resetForAnotherUpload}
              className="text-xs transition-colors tap-target"
              style={{ color: 'var(--color-text-secondary)' }}
              onMouseOver={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
              onMouseOut={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
            >
              Ladda upp ett till CV
            </button>
          </div>
        </div>
      )}

      {/* Error feedback */}
      {status === 'error' && (
        <div
          className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor: 'var(--color-feedback-error-background)',
            border: '1px solid var(--color-feedback-error)',
            color: 'var(--color-feedback-error)',
          }}
        >
          <ErrorIcon />
          <span>{message}</span>
        </div>
      )}
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-accent-purple)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function FileIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-accent-purple)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 mt-0.5"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 mt-0.5"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}
