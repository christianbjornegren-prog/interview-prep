import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { logger, CATEGORIES } from '../lib/logger'
import { analyzeInterviewFeedback } from '../lib/claude'

const VERCEL_WHISPER =
  'https://interview-prep-liard-three.vercel.app/api/whisper'
const VERCEL_TTS = 'https://interview-prep-liard-three.vercel.app/api/tts'

const INTERVIEWER_NAMES = [
  'Anna Lindström',
  'Erik Bergström',
  'Maria Karlsson',
  'Johan Svensson',
]

// TODO: Ta bort MAX_QUESTIONS_FOR_TESTING när testning är klar
const MAX_QUESTIONS_FOR_TESTING = 1

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
  const [isConnecting, setIsConnecting] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [logs, setLogs] = useState([])
  const addLog = (msg) =>
    setLogs((prev) => [
      ...prev,
      `${new Date().toLocaleTimeString()} ${msg}`,
    ])

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
    logger.info(CATEGORIES.APP, 'InterviewSimulatorTTS loaded', { jobId })
    let cancelled = false
    async function load() {
      try {
        const uid = auth.currentUser.uid
        const snap = await getDoc(doc(db, 'users', uid, 'jobs', jobId))
        if (cancelled) return
        if (!snap.exists()) {
          setLoadError('Hittade ingen jobbannons med det id:et.')
          logger.warn(CATEGORIES.APP, 'Job not found', { jobId })
        } else {
          setJob({ docId: snap.id, ...snap.data() })
          logger.info(CATEGORIES.APP, 'Job loaded', { 
            jobId, 
            jobTitle: snap.data().jobTitle,
            questionCount: snap.data().questions?.length || 0 
          })
        }
      } catch (err) {
        console.error('Kunde inte hämta jobbet:', err)
        logger.error(CATEGORIES.APP, 'Failed to load job', { jobId, error: err.message })
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

    addLog('🔄 Hämtar TTS...')
    try {
      const r = await fetch(VERCEL_TTS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'shimmer' }),
      })
      if (!r.ok) {
        const errText = await r.text()
        throw new Error('TTS fel: ' + errText)
      }

      const arrayBuffer = await r.arrayBuffer()
      const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      addLog('✓ TTS blob mottagen, storlek: ' + blob.size + ' type: ' + blob.type)

      const audio = new Audio()
      audio.src = url
      audioRef.current = audio

      addLog('▶ Spelar upp ljud...')
      await new Promise((resolve, reject) => {
        audio.oncanplaythrough = () => audio.play().then(resolve).catch(reject)
        audio.onerror = (e) => reject(new Error('Audio error: ' + e.type))
        audio.load()
      })

      await new Promise((resolve) => {
        audio.onended = resolve
      })
      addLog('✓ Uppspelning klar')
      URL.revokeObjectURL(url)
      audioRef.current = null
    } finally {
      setIsConnecting(false)
    }
  }

  async function startInterview() {
    const allQuestions = job?.questions ?? []
    if (allQuestions.length === 0) return

    // TODO: Ta bort MAX_QUESTIONS_FOR_TESTING när testning är klar
    const activeQuestions = allQuestions.slice(0, MAX_QUESTIONS_FOR_TESTING)

    logger.info(CATEGORIES.APP, 'Starting interview', {
      jobId,
      interviewer: interviewerName,
      questionCount: activeQuestions.length,
    })

    setErrorMsg('')
    setPhase('interviewing')
    setIsConnecting(true)
    setStatusMessage('Ansluter till intervjuaren...')

    const greeting =
      `Hej, jag heter ${interviewerName}. Välkommen till intervjun ` +
      `för rollen ${job.jobTitle} hos ${job.company}. ` +
      `Vi har ${activeQuestions.length} frågor. ` +
      `Fråga 1 av ${activeQuestions.length}: ${activeQuestions[0].question}`

    try {
      await speakText(greeting)
      addToTranscript('interviewer', greeting)
      setStatusMessage('Håll knappen för att svara')
      logger.info(CATEGORIES.APP, 'Interview started successfully')
    } catch (err) {
      console.error('TTS-fel:', err)
      logger.error(CATEGORIES.APP, 'Failed to start interview', { error: err.message })
      setErrorMsg(err.message ?? 'Kunde inte spela upp AI-rösten.')
      setStatusMessage('')
      setIsConnecting(false)
    }
  }

  async function startRecording() {
    if (isRecording || isProcessing || isConnecting) return
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
      addLog('🎤 Startar inspelning...')
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
    addLog('⏹ Inspelning stoppad')
  }

  async function processAnswer(audioBlob) {
    try {
      setStatusMessage('Transkriberar ditt svar...')
      addLog('🔄 Skickar till Whisper...')
      const whisperRes = await fetch(VERCEL_WHISPER, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/webm' },
        body: audioBlob,
      })
      const { text: userText } = await whisperRes.json()
      if (!userText) throw new Error('Inget tal detekterat')
      addLog('✓ Whisper svar: ' + userText)
      addToTranscript('candidate', userText)

      setStatusMessage('Förbereder svar...')
      const allQuestions = job?.questions ?? []
      // TODO: Ta bort MAX_QUESTIONS_FOR_TESTING när testning är klar
      const activeQuestions = allQuestions.slice(0, MAX_QUESTIONS_FOR_TESTING)
      const nextIndex = currentQuestionIndex + 1
      let aiText
      let finishing = false

      if (nextIndex < activeQuestions.length) {
        aiText =
          `Tack. Fråga ${nextIndex + 1} av ${activeQuestions.length}: ` +
          activeQuestions[nextIndex].question
        setCurrentQuestionIndex(nextIndex)
      } else {
        aiText =
          'Tack så mycket, det var alla mina frågor. ' +
          'Du har genomfört intervjun. Bra jobbat!'
        finishing = true
      }

      setStatusMessage('AI svarar...')
      setIsConnecting(true)
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
      addLog('FEL: ' + error.message)
      setErrorMsg(error.message)
      setStatusMessage('Fel: ' + error.message + ' – försök igen')
    } finally {
      setIsProcessing(false)
    }
  }

  async function saveSession(finalText) {
    try {
      logger.info(CATEGORIES.APP, 'Saving interview session', { jobId })
      setStatusMessage('Analyserar din intervju...')
      
      const uid = auth.currentUser.uid
      const finalTranscript = finalText
        ? [...transcriptRef.current, { role: 'interviewer', text: finalText }]
        : transcriptRef.current

      // Build transcript for Claude analysis
      const allQuestions = job?.questions ?? []
      const activeQuestions = allQuestions.slice(0, MAX_QUESTIONS_FOR_TESTING)
      const transcriptForAnalysis = []
      
      // Match questions with answers from transcript
      activeQuestions.forEach((q, index) => {
        const candidateEntry = finalTranscript.find(
          (t, i) => t.role === 'candidate' && i > index * 2
        )
        if (candidateEntry) {
          transcriptForAnalysis.push({
            question: q.question,
            answer: candidateEntry.text,
          })
        }
      })

      // Fetch user's competencies
      logger.info(CATEGORIES.APP, 'Fetching competencies for feedback analysis')
      const compSnap = await getDocs(collection(db, 'users', uid, 'competencies'))
      const competencies = compSnap.docs.map((d) => ({ 
        id: d.data().id,
        title: d.data().title,
        description: d.data().description,
        tags: d.data().tags ?? [],
      }))
      logger.info(CATEGORIES.APP, 'Competencies fetched', { count: competencies.length })

      // Get feedback from Claude
      logger.info(CATEGORIES.APP, 'Requesting feedback from Claude')
      const feedback = await analyzeInterviewFeedback(
        transcriptForAnalysis,
        job?.jobTitle ?? '',
        job?.company ?? '',
        competencies
      )
      logger.info(CATEGORIES.APP, 'Feedback received', { overallScore: feedback.overallScore })

      // Save feedback to Firestore
      setStatusMessage('Sparar feedback...')
      const feedbackRef = await addDoc(
        collection(db, 'users', uid, 'jobs', jobId, 'feedback'),
        {
          createdAt: serverTimestamp(),
          overallScore: feedback.overallScore,
          summary: feedback.summary,
          strengths: feedback.strengths,
          improvements: feedback.improvements,
          competencyGaps: feedback.competencyGaps ?? [],
          questionFeedback: feedback.questionFeedback,
          jobTitle: job?.jobTitle ?? '',
          company: job?.company ?? '',
          interviewer: interviewerName,
          transcript: transcriptForAnalysis,
        }
      )
      
      logger.info(CATEGORIES.APP, 'Feedback saved', { feedbackId: feedbackRef.id })
      navigate(`/feedback/${jobId}/${feedbackRef.id}`)
    } catch (err) {
      console.error('Kunde inte spara sessionen:', err)
      logger.error(CATEGORIES.APP, 'Failed to save session', { error: err.message })
      setErrorMsg(err.message ?? 'Kunde inte spara sessionen.')
      setStatusMessage('')
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
    navigate(`/jobb/${jobId}`)
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
          onClick={() => navigate(`/jobb/${jobId}`)}
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

  const allQuestions = job.questions ?? []
  // TODO: Ta bort MAX_QUESTIONS_FOR_TESTING när testning är klar
  const activeQuestions = allQuestions.slice(0, MAX_QUESTIONS_FOR_TESTING)
  const currentQuestion =
    activeQuestions[Math.min(currentQuestionIndex, Math.max(activeQuestions.length - 1, 0))]

  if (phase === 'preparing') {
    return (
      <>
      <div className="space-y-8">
        <button
          onClick={() => navigate(`/jobb/${jobId}`)}
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
            value={`${activeQuestions.length} ${
              activeQuestions.length === 1 ? 'fråga' : 'frågor'
            }`}
          />
        </div>

        <p className="text-xs text-center" style={{ color: '#6b7280' }}>
          Håll mikrofonknappen när du pratar, släpp när du är klar.
        </p>

        <button
          onClick={startInterview}
          disabled={activeQuestions.length === 0}
          className="w-full py-3 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ backgroundColor: '#2A9D8F' }}
          onMouseOver={(e) => {
            if (activeQuestions.length > 0)
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
      </>
    )
  }

  const circleState = isRecording
    ? 'recording'
    : isProcessing
    ? 'processing'
    : isConnecting
    ? 'speaking'
    : 'idle'

  // Show connecting view when starting interview
  if (isConnecting) {
    return (
      <>
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

        <div className="flex flex-col items-center gap-6 py-16">
          <div className="relative" style={{ width: 200, height: 200 }}>
            <span
              className="absolute inset-0 rounded-full"
              style={{
                border: '4px solid #4A6FA5',
                borderTopColor: 'transparent',
                animation: 'ttsSpin 1s linear infinite',
              }}
            />
            <span
              className="absolute inset-0 rounded-full transition-colors"
              style={{ backgroundColor: '#4A6FA5', opacity: 0.9 }}
            />
          </div>
          <div className="text-center space-y-2">
            <p className="text-base font-semibold text-white">
              Ansluter till intervjuaren...
            </p>
            <p className="text-sm" style={{ color: '#9ca3af' }}>
              {interviewerName} förbereder sig
            </p>
          </div>
        </div>

        {errorMsg && (
          <p className="text-sm text-center" style={{ color: '#f87171' }}>
            {errorMsg}
          </p>
        )}
      </div>
      </>
    )
  }

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

      {activeQuestions.length > 0 && currentQuestion && phase === 'interviewing' && (
        <div
          className="rounded-xl border p-5 space-y-2"
          style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: '#2A9D8F' }}
          >
            Fråga {Math.min(currentQuestionIndex + 1, activeQuestions.length)} av{' '}
            {activeQuestions.length}
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
            disabled={isProcessing || isConnecting}
            className="px-8 py-4 rounded-full text-white text-base font-semibold transition-colors select-none disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              backgroundColor: isRecording
                ? '#c0392b'
                : isProcessing || isConnecting
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
