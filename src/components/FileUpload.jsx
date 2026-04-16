import { useRef, useState } from 'react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { extractCompetencies, extractCompetenciesFromPDF } from '../lib/claude'

const ACCEPTED_TYPES = '.pdf,.docx'

export default function FileUpload() {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [message, setMessage] = useState('')

  async function handleFile(file) {
    if (!file) return

    const isPDF = file.type === 'application/pdf'
    const isDOCX =
      file.type ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.name.endsWith('.docx')

    if (!isPDF && !isDOCX) {
      setStatus('error')
      setMessage('Otillåtet filformat. Ladda upp en PDF- eller DOCX-fil.')
      return
    }

    setStatus('loading')
    setMessage('')

    try {
      let competencies

      if (isPDF) {
        const base64 = await fileToBase64(file)
        competencies = await extractCompetenciesFromPDF(base64)
      } else {
        const mammoth = (await import('mammoth')).default
        const arrayBuffer = await file.arrayBuffer()
        const result = await mammoth.extractRawText({ arrayBuffer })
        competencies = await extractCompetencies(result.value)
      }

      // Persist each competency as its own Firestore document
      const col = collection(db, 'competencies')
      await Promise.all(
        competencies.map((c) =>
          addDoc(col, {
            ...c,
            createdAt: serverTimestamp(),
          })
        )
      )

      setStatus('success')
      setMessage(
        `${competencies.length} kompetens${competencies.length === 1 ? '' : 'er'} extraherade och sparade.`
      )
    } catch (err) {
      console.error(err)
      setStatus('error')
      setMessage(err.message ?? 'Något gick fel. Försök igen.')
    }
  }

  function onInputChange(e) {
    handleFile(e.target.files?.[0])
    // Reset so the same file can be re-uploaded
    e.target.value = ''
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center gap-3
          border-2 border-dashed rounded-xl p-12 cursor-pointer
          transition-colors select-none
          ${dragging ? 'border-brand-accent bg-brand-accent/5' : 'border-brand-border hover:border-brand-accent/60'}
        `}
        style={{ borderColor: dragging ? '#4A6FA5' : undefined }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={onInputChange}
        />

        {status === 'loading' ? (
          <>
            <Spinner />
            <p className="text-white text-sm font-medium">Analyserar dokument...</p>
            <p className="text-brand-muted text-xs">Det kan ta några sekunder</p>
          </>
        ) : (
          <>
            <UploadIcon />
            <div className="text-center">
              <p className="text-white text-sm font-medium">
                Dra och släpp ditt CV här
              </p>
              <p className="text-brand-muted text-xs mt-1">
                eller klicka för att välja fil &mdash; PDF eller DOCX
              </p>
            </div>
          </>
        )}
      </div>

      {/* Feedback message */}
      {status === 'success' && (
        <div
          className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm"
          style={{ backgroundColor: '#0d2b1a', border: '1px solid #1a4d2e', color: '#4ade80' }}
        >
          <CheckIcon />
          <span>{message}</span>
        </div>
      )}

      {status === 'error' && (
        <div
          className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm"
          style={{ backgroundColor: '#2b0d0d', border: '1px solid #4d1a1a', color: '#f87171' }}
        >
          <ErrorIcon />
          <span>{message}</span>
        </div>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // result is "data:<mime>;base64,<data>" – strip the prefix
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ── Icons ──────────────────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#4A6FA5"
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

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#4A6FA5"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}
