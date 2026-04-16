import { useRef, useState } from 'react'
import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore'
import { db, auth } from '../lib/firebase'
import { extractCompetencies } from '../lib/claude'
import LoadingState from './LoadingState'

const LOADING_MESSAGES = [
  'Identifierar erfarenheter och projekt...',
  'Kopplar ihop kompetenser och resultat...',
  'Strukturerar din kompetensbank...',
  'Nästan klart – sista finjusteringarna...',
]

const ACCEPTED_TYPES = '.pdf,.docx'

function getFileType(file) {
  if (file.type === 'application/pdf') return 'pdf'
  if (
    file.type ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.name.endsWith('.docx')
  )
    return 'docx'
  return null
}

export default function FileUpload() {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [message, setMessage] = useState('')

  function handleFileSelect(file) {
    if (!file) return
    if (!getFileType(file)) {
      setStatus('error')
      setMessage('Otillåtet filformat. Ladda upp en PDF- eller DOCX-fil.')
      setSelectedFile(null)
      return
    }
    setSelectedFile(file)
    setStatus('idle')
    setMessage('')
  }

  async function handleAnalyze() {
    if (!selectedFile) return
    const fileType = getFileType(selectedFile)

    setStatus('loading')
    setMessage('')

    try {
      const competencies = await extractCompetencies(selectedFile, fileType)

      // Duplicate check against existing Firestore titles
      const uid = auth.currentUser.uid
      const colRef = collection(db, 'users', uid, 'competencies')
      const existingSnap = await getDocs(colRef)
      const existingTitles = new Set(
        existingSnap.docs.map((d) => (d.data().title ?? '').toLowerCase())
      )

      const toSave = competencies.filter(
        (c) => !existingTitles.has((c.title ?? '').toLowerCase())
      )

      await Promise.all(
        toSave.map((c) =>
          addDoc(colRef, {
            ...c,
            createdAt: serverTimestamp(),
            sourceFile: selectedFile.name,
          })
        )
      )

      const skipped = competencies.length - toSave.length
      let msg = `${toSave.length} kompetens${toSave.length === 1 ? '' : 'er'} extraherade och sparade.`
      if (skipped > 0)
        msg += ` ${skipped} dubblett${skipped === 1 ? '' : 'er'} hoppades över.`

      setStatus('success')
      setMessage(msg)
      setSelectedFile(null)
    } catch (err) {
      console.error(err)
      setStatus('error')
      setMessage(err.message ?? 'Något gick fel. Försök igen.')
    }
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
      {/* Loading state replaces the drop zone while Claude is working */}
      {isLoading && (
        <LoadingState
          title="Claude läser ditt CV..."
          messages={LOADING_MESSAGES}
        />
      )}

      {/* Drop zone – hidden while loading */}
      {!isLoading && (
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
          'border-2 border-dashed rounded-xl p-10 transition-colors select-none cursor-pointer',
          dragging
            ? 'border-[#4A6FA5] bg-[#4A6FA5]/5'
            : 'border-[#2a2d3a] hover:border-[#4A6FA5]/50',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={onInputChange}
        />

        {selectedFile ? (
          <>
            <FileIcon />
            <div className="text-center">
              <p className="text-white text-sm font-semibold">{selectedFile.name}</p>
              <p className="text-[#6b7280] text-xs mt-1">
                Klicka för att välja en annan fil
              </p>
            </div>
          </>
        ) : (
          <>
            <UploadIcon />
            <div className="text-center">
              <p className="text-white text-sm font-medium">
                Dra och släpp ditt CV här
              </p>
              <p className="text-[#6b7280] text-xs mt-1">
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
          className="w-full py-3 rounded-lg text-white text-sm font-semibold transition-colors"
          style={{ backgroundColor: '#4A6FA5' }}
          onMouseOver={(e) =>
            (e.currentTarget.style.backgroundColor = '#5a82bc')
          }
          onMouseOut={(e) =>
            (e.currentTarget.style.backgroundColor = '#4A6FA5')
          }
        >
          Analysera dokument
        </button>
      )}

      {/* Success feedback */}
      {status === 'success' && (
        <div
          className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor: '#0d2b1a',
            border: '1px solid #1a4d2e',
            color: '#4ade80',
          }}
        >
          <CheckIcon />
          <span>{message}</span>
        </div>
      )}

      {/* Error feedback */}
      {status === 'error' && (
        <div
          className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor: '#2b0d0d',
            border: '1px solid #4d1a1a',
            color: '#f87171',
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

function FileIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#4A6FA5"
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
