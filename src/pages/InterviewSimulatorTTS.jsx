import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

const VERCEL_WHISPER =
  'https://interview-prep-liard-three.vercel.app/api/whisper'
const VERCEL_TTS = 'https://interview-prep-liard-three.vercel.app/api/tts'

const INTERVIEWER_NAMES = [
  'Anna Lindström',
  'Erik Bergström',
  'Maria Karlsson',
  'Johan Svensson',
]

function pickInterviewer() {
  return INTERVIEWER_NAMES[Math.floor(Math.random() * INTERVIEWER_NAMES.length)]
}

export default function InterviewSimulatorTTS() {
  const { jobId } = useParams()
  const navigate = useNavigate()

  const [job, setJob] = useState(null)
  const [loadingJob, setLoadingJob] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [phase, setPhase] = useState('preparing') // preparing | interviewing | finished
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [transcript, setTranscript] = useState([])
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const interviewerName = useMemo(() => pickInterviewer(), [])
  const audioRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const phaseRef = useRef(phase)
  const transcriptRef = useRef(transcript)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  useEffect(() => {
    transcriptRef.current = transcript
  }, [transcript])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const uid = auth.currentUser.uid
        const snap = await getDoc(doc(db, 'users', uid, 'jobs', jobId))
        if (cancelled) return
        if (!snap.exists()) {
          setLoadError('Hittade ingen jobbannons med det id:et.')
        } else {
          setJob({ docId: snap.id, ...snap.data() })
        }
      } catch (err) {
        console.error('Kunde inte hämta jobbet:', err)
        if (!cancelled) setLoadError(err.message ?? 'Kunde inte hämta jobbet.')
      } finally {
        if (!cancelled) setLoadingJob(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [jobId])

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      if (mediaRecorderRef.current?.stream) {
        mediaRecorderRef.current.stream
          .getTracks()
          .forEach((t) => t.stop())
      }
    }
  }, [])

  function addToTranscript(role, text) {
    setTranscript((prev) => [...prev, { role, text }])
  }

  async function speakText(text) {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    setIsSpeaking(true)
    try {
      const r = await fetch(VERCEL_TTS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'shimmer' }),
      })
      if (!r.ok) throw new Error('TTS misslyckades')

      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio

      await audio.play()
      await new Promise((resolve, reject) => {
        audio.onended = resolve
        audio.onerror = reject
      })
      URL.revokeObjectURL(url)
      audioRef.current = null
    } finally {
      setIsSpeaking(false)
    }
  }

  async function startInterview() {
    const questions = job?.questions ?? []
    if (questions.length === 0) return

    setErrorMsg('')
    setPhase('interviewing')
    setStatusMessage('AI pratar...')

    const greeting =
      `Hej, jag heter ${interviewerName}. Välkommen till intervjun ` +
      `för rollen ${job.jobTitle} hos ${job.company}. ` +
      `Vi har ${questions.length} frågor. ` +
      `Fråga 1 av ${questions.length}: ${questions[0].question}`

    try {
      await speakText(greeting)
      addToTranscript('interviewer', greeting)
      setStatusMessage('Håll knappen för att svara')
    } catch (err) {
      console.error('TTS-fel:', err)
      setErrorMsg(err.message ?? 'Kunde inte spela upp AI-rösten.')
      setStatusMessage('')
    }
  }

  async function startRecording() {
    if (isRecording || isProcessing || isSpeaking) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: 'audio/webm',
        })
        await processAnswer(audioBlob)
      }
      recorder.start(100)
      setIsRecording(true)
      setStatusMessage('Spelar in – släpp när du är klar')
    } catch (err) {
      console.error('Kunde inte starta inspelning:', err)
      setErrorMsg(err.message ?? 'Kunde inte starta inspelning.')
    }
  }

  function stopRecording() {
    if (!isRecording) return
    const recorder = mediaRecorderRef.current
    if (!recorder) return
    recorder.stop()
    recorder.stream.getTracks().forEach((t) => t.stop())
    setIsRecording(false)
    setIsProcessing(true)
  }

  async function processAnswer(audioBlob) {
    try {
      setStatusMessage('Transkriberar ditt svar...')
      const whisperRes = await fetch(VERCEL_WHISPER, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/webm' },
        body: audioBlob,
      })
      const { text: userText } = await whisperRes.json()
      if (!userText) throw new Error('Inget tal detekterat')
      addToTranscript('candidate', userText)

      setStatusMessage('Förbereder svar...')
      const questions = job?.questions ?? []
      const nextIndex = currentQuestionIndex + 1
      let aiText
      let finishing = false

      if (nextIndex < questions.length) {
        aiText =
          `Tack. Fråga ${nextIndex + 1} av ${questions.length}: ` +
          questions[nextIndex].question
        setCurrentQuestionIndex(nextIndex)
      } else {
        aiText =
          'Tack så mycket, det var alla mina frågor. ' +
          'Du har genomfört intervjun. Bra jobbat!'
        finishing = true
      }

      setStatusMessage('AI svarar...')
      await speakText(aiText)
      addToTranscript('interviewer', aiText)

      if (finishing) {
        setPhase('finished')
        setStatusMessage('Sparar intervjun...')
        await saveSession(aiText)
      } else {
        setStatusMessage('Håll knappen för att svara')
      }
    } catch (error) {
      console.error(error)
      setErrorMsg(error.message)
      setStatusMessage('Fel: ' + error.message + ' – försök igen')
    } finally {
      setIsProcessing(false)
    }
  }

  async function saveSession(finalText) {
    try {
      const uid = auth.currentUser.uid
      const finalTranscript = finalText
        ? [...transcriptRef.current, { role: 'interviewer', text: finalText }]
        : transcriptRef.current
      const mapped = finalTranscript.map((t) => ({
        role: t.role === 'interviewer' ? 'assistant' : 'user',
        text: t.text,
      }))
      const sessionRef = await addDoc(
        collection(db, 'users', uid, 'sessions'),
        {
          jobId,
          jobTitle: job?.jobTitle ?? '',
          company: job?.company ?? '',
          interviewer: interviewerName,
          transcript: mapped,
          questions: job?.questions ?? [],
          createdAt: serverTimestamp(),
          status: 'completed',
          type: 'tts',
        }
      )
      navigate(`/feedback/${sessionRef.id}`)
    } catch (err) {
      console.error('Kunde inte spara sessionen:', err)
      setErrorMsg(err.message ?? 'Kunde inte spara sessionen.')
    }
  }

  function endInterview() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (mediaRecorderRef.current?.stream) {
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop())
    }
    navigate('/jobb')
  }

  if (loadingJob) {
    return (
      <p className="text-sm py-8" style={{ color: '#6b7280' }}>
        Laddar jobbannons...
      </p>
    )
  }

  if (loadError || !job) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/jobb')}
          className="text-sm transition-colors"
          style={{ color: '#6b7280' }}
        >
          ← Tillbaka till jobbannonser
        </button>
        <p className="text-sm" style={{ color: '#f87171' }}>
          {loadError || 'Hittade ingen jobbannons.'}
        </p>
      </div>
    )
  }

  const questions = job.questions ?? []
  const currentQuestion =
    questions[Math.min(currentQuestionIndex, Math.max(questions.length - 1, 0))]

  if (phase === 'preparing') {
    return (
      <div className="space-y-8">
        <button
          onClick={() => navigate('/jobb')}
          className="text-sm transition-colors"
          style={{ color: '#6b7280' }}
          onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
          onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
        >
          ← Tillbaka
        </button>

        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Intervju med röst & text
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#9ca3af' }}>
            Push-to-talk med Whisper-transkription och TTS-röstsvar.
          </p>
        </div>

        <div
          className="rounded-xl border p-6 space-y-5"
          style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
        >
          <InfoRow label="Roll" value={job.jobTitle || '—'} />
          <InfoRow label="Företag" value={job.company || '—'} />
          <InfoRow label="Intervjuare" value={interviewerName} />
          <InfoRow
            label="Antal frågor"
            value={`${questions.length} ${
              questions.length === 1 ? 'fråga' : 'frågor'
            }`}
          />
        </div>

        <p className="text-xs text-center" style={{ color: '#6b7280' }}>
          Håll mikrofonknappen när du pratar, släpp när du är klar.
        </p>

        <button
          onClick={startInterview}
          disabled={questions.length === 0}
          className="w-full py-3 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ backgroundColor: '#2A9D8F' }}
          onMouseOver={(e) => {
            if (questions.length > 0)
              e.currentTarget.style.backgroundColor = '#34b8a8'
          }}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#2A9D8F')}
        >
          Starta intervju
        </button>

        {errorMsg && (
          <p className="text-sm" style={{ color: '#f87171' }}>
            {errorMsg}
          </p>
        )}
      </div>
    )
  }

  const circleState = isRecording
    ? 'recording'
    : isProcessing
    ? 'processing'
    : isSpeaking
    ? 'speaking'
    : 'idle'

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Intervju med {interviewerName}
        </h1>
        <p className="mt-1 text-sm" style={{ color: '#9ca3af' }}>
          {job.jobTitle}
          {job.company ? ` · ${job.company}` : ''}
        </p>
      </div>

      <div className="flex flex-col items-center gap-6">
        <StatusCircle state={circleState} />
        <p
          className="text-xs uppercase tracking-widest"
          style={{ color: '#6b7280' }}
        >
          {statusMessage}
        </p>
      </div>

      {questions.length > 0 && currentQuestion && phase === 'interviewing' && (
        <div
          className="rounded-xl border p-5 space-y-2"
          style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: '#2A9D8F' }}
          >
            Fråga {Math.min(currentQuestionIndex + 1, questions.length)} av{' '}
            {questions.length}
          </p>
          <p className="text-sm leading-relaxed text-white">
            {currentQuestion.question}
          </p>
        </div>
      )}

      {phase === 'interviewing' && (
        <div className="flex flex-col items-center gap-4">
          <button
            onPointerDown={startRecording}
            onPointerUp={stopRecording}
            onPointerLeave={() => {
              if (isRecording) stopRecording()
            }}
            onContextMenu={(e) => e.preventDefault()}
            disabled={isProcessing || isSpeaking}
            className="px-8 py-4 rounded-full text-white text-base font-semibold transition-colors select-none disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              backgroundColor: isRecording
                ? '#c0392b'
                : isProcessing || isSpeaking
                ? '#3a3d48'
                : '#4A6FA5',
              minWidth: '240px',
              userSelect: 'none',
              touchAction: 'none',
            }}
          >
            {isProcessing ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner /> Bearbetar...
              </span>
            ) : isRecording ? (
              '⏹ Släpp när klar'
            ) : (
              '🎤 Håll för att svara'
            )}
          </button>

          <button
            onClick={endInterview}
            className="text-xs transition-colors"
            style={{ color: '#6b7280' }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#f87171')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
          >
            Avsluta intervju
          </button>
        </div>
      )}

      {errorMsg && (
        <p className="text-sm text-center" style={{ color: '#f87171' }}>
          {errorMsg}
        </p>
      )}
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span
        className="text-xs uppercase tracking-widest font-semibold"
        style={{ color: '#2A9D8F' }}
      >
        {label}
      </span>
      <span className="text-sm text-white text-right">{value}</span>
    </div>
  )
}

function StatusCircle({ state }) {
  const color =
    state === 'recording'
      ? '#c0392b'
      : state === 'processing'
      ? '#E9C46A'
      : state === 'speaking'
      ? '#4A6FA5'
      : '#3a3d48'

  return (
    <div className="relative" style={{ width: 200, height: 200 }}>
      {state === 'recording' && (
        <span
          className="absolute inset-0 rounded-full"
          style={{
            backgroundColor: color,
            opacity: 0.35,
            animation: 'ttsPulseFast 1s ease-out infinite',
          }}
        />
      )}
      {state === 'speaking' && (
        <span
          className="absolute inset-0 rounded-full"
          style={{
            backgroundColor: color,
            opacity: 0.35,
            animation: 'ttsPulseSlow 2.4s ease-out infinite',
          }}
        />
      )}
      {state === 'processing' && (
        <span
          className="absolute inset-0 rounded-full"
          style={{
            border: `4px solid ${color}`,
            borderTopColor: 'transparent',
            animation: 'ttsSpin 1s linear infinite',
          }}
        />
      )}
      <span
        className="absolute inset-0 rounded-full transition-colors"
        style={{ backgroundColor: color, opacity: 0.9 }}
      />
      <style>{`
        @keyframes ttsPulseFast {
          0% { transform: scale(1); opacity: 0.35; }
          100% { transform: scale(1.45); opacity: 0; }
        }
        @keyframes ttsPulseSlow {
          0% { transform: scale(1); opacity: 0.3; }
          100% { transform: scale(1.3); opacity: 0; }
        }
        @keyframes ttsSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

function Spinner() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 14,
        height: 14,
        border: '2px solid #ffffff',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'ttsSpin 0.9s linear infinite',
      }}
    />
  )
}
