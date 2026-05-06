import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { analyzeInterviewFeedback, sanitizeCompetencies } from '../lib/claude'

const VERCEL_WHISPER =
  'https://interview-prep-liard-three.vercel.app/api/whisper'
const VERCEL_TTS = 'https://interview-prep-liard-three.vercel.app/api/tts'

const FEMALE_VOICES = ['shimmer', 'nova', 'alloy']
const MALE_VOICES = ['onyx', 'echo', 'fable']
const FEMALE_NAMES = ['Maria Lindström', 'Anna Karlsson', 'Sara Bergström']
const MALE_NAMES = ['Erik Svensson', 'Johan Andersen', 'Anders Nilsson']

function pickVoiceAndName() {
  const useFemale = Math.random() < 0.5
  const voices = useFemale ? FEMALE_VOICES : MALE_VOICES
  const names = useFemale ? FEMALE_NAMES : MALE_NAMES
  const idx = Math.floor(Math.random() * voices.length)
  return { voice: voices[idx], name: names[idx] }
}

const FOCUS_TO_CATEGORY = {
  Erfarenhet: 'erfarenhet',
  Kompetens: 'kompetens',
  Situation: 'situation',
  Motivation: 'motivation',
}

const DEFAULT_CONFIG = {
  numQuestions: 5,
  focus: 'Mix',
  difficulty: 'Standard',
  selectedQuestions: null,
}

// ── State machine ─────────────────────────────────────────────────────────

const STATES = {
  CONNECTING:       'connecting',       // initial greeting only
  AI_SPEAKING:      'ai_speaking',
  WAITING_FOR_USER: 'waiting_for_user',
  RECORDING:        'recording',
  PROCESSING:       'processing',       // Whisper transcription
  PREPARING_NEXT:   'preparing_next',   // TTS fetch for next question
  FINISHED:         'finished',
}

function statusLabel(state, interviewerName) {
  switch (state) {
    case STATES.CONNECTING:       return 'Ansluter till intervjuaren...'
    case STATES.AI_SPEAKING:      return `${interviewerName} frågar...`
    case STATES.WAITING_FOR_USER: return 'Din tur'
    case STATES.RECORDING:        return 'Spelar in... klicka när du är klar'
    case STATES.PROCESSING:       return 'Transkriberar ditt svar...'
    case STATES.PREPARING_NEXT:   return 'Förbereder nästa fråga...'
    case STATES.FINISHED:         return 'Intervjun är klar – analyserar dina svar...'
    default:                      return ''
  }
}

// ── Component ─────────────────────────────────────────────────────────────

export default function InterviewSimulatorTTS() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const interviewConfig = { ...DEFAULT_CONFIG, ...(location.state ?? {}) }

  const [job, setJob] = useState(null)
  const [loadingJob, setLoadingJob] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [interviewState, setInterviewState] = useState(STATES.CONNECTING)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [transcript, setTranscript] = useState([])
  const [errorMsg, setErrorMsg] = useState('')

  const { voice: interviewerVoice, name: interviewerName } = useMemo(
    () => pickVoiceAndName(),
    []
  )
  const [showConfirmAbort, setShowConfirmAbort] = useState(false)

  const audioRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const audioChunksRef = useRef([])
  const transcriptRef = useRef(transcript)
  const currentQuestionIndexRef = useRef(0)
  const activeQuestionsRef = useRef([])
  const recordingStartRef = useRef(null)

  useEffect(() => {
    transcriptRef.current = transcript
  }, [transcript])

  useEffect(() => {
    currentQuestionIndexRef.current = currentQuestionIndex
  }, [currentQuestionIndex])

  // Load job
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
    return () => { cancelled = true }
  }, [jobId])

  // Auto-start interview when job loads
  useEffect(() => {
    if (!job) return
    startInterview() // eslint-disable-line react-hooks/exhaustive-deps
  }, [job]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        audio.src = ''
        audioRef.current = null
      }
      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop()
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function addToTranscript(role, text) {
    setTranscript((prev) => [...prev, { role, text }])
  }

  // speakText: fetches TTS, signals AI_SPEAKING when audio starts, resolves when done
  async function speakText(text) {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    const r = await fetch(VERCEL_TTS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: interviewerVoice }),
    })
    if (!r.ok) {
      const errText = await r.text()
      throw new Error('TTS fel: ' + errText)
    }

    const blob = new Blob([await r.arrayBuffer()], { type: 'audio/mpeg' })
    const url = URL.createObjectURL(blob)
    const audio = new Audio()
    audio.src = url
    audioRef.current = audio

    // Signal AI_SPEAKING the moment playback actually starts
    await new Promise((resolve, reject) => {
      audio.oncanplaythrough = () => {
        audio.play()
          .then(() => {
            setInterviewState(STATES.AI_SPEAKING)
            resolve()
          })
          .catch(reject)
      }
      audio.onerror = (e) => reject(new Error('Audio error: ' + e.type))
      audio.load()
    })

    await new Promise((resolve) => { audio.onended = resolve })
    URL.revokeObjectURL(url)
    audioRef.current = null
  }

  async function startInterview() {
    const allQuestions = job?.questions ?? []
    if (allQuestions.length === 0) {
      setLoadError('Inga frågor hittades för detta uppdrag.')
      return
    }

    const activeQuestions = interviewConfig.selectedQuestions ?? (() => {
      const categoryKey = FOCUS_TO_CATEGORY[interviewConfig.focus]
      const filtered = categoryKey
        ? allQuestions.filter((q) => q.category === categoryKey)
        : allQuestions
      const pool = filtered.length > 0 ? filtered : allQuestions
      return pool.slice(0, interviewConfig.numQuestions)
    })()

    activeQuestionsRef.current = activeQuestions
    setInterviewState(STATES.CONNECTING)

    const greeting =
      `Hej, jag heter ${interviewerName}. Välkommen till intervjun ` +
      `för rollen ${job.jobTitle} hos ${job.company}. ` +
      `Vi har ${activeQuestions.length} frågor. ` +
      `Fråga 1 av ${activeQuestions.length}: ${activeQuestions[0].question}`

    try {
      await speakText(greeting)
      addToTranscript('interviewer', greeting)
      setInterviewState(STATES.WAITING_FOR_USER)
    } catch (err) {
      console.error('TTS-fel:', err)
      setErrorMsg(err.message ?? 'Kunde inte spela upp AI-rösten.')
    }
  }

  // Click-toggle: WAITING_FOR_USER → RECORDING, RECORDING → PROCESSING (min 1s)
  function handleRecordingToggle() {
    if (interviewState === STATES.WAITING_FOR_USER) {
      startRecording()
    } else if (interviewState === STATES.RECORDING) {
      const elapsed = Date.now() - (recordingStartRef.current ?? 0)
      if (elapsed >= 1000) stopRecording()
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
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
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        await processAnswer(audioBlob)
      }
      recorder.start(100)
      recordingStartRef.current = Date.now()
      setInterviewState(STATES.RECORDING)
    } catch (err) {
      console.error('Kunde inte starta inspelning:', err)
      setErrorMsg(err.message ?? 'Kunde inte starta inspelning.')
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder) return
    recorder.stop()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    setInterviewState(STATES.PROCESSING)
  }

  async function processAnswer(audioBlob) {
    try {
      const whisperRes = await fetch(VERCEL_WHISPER, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/webm' },
        body: audioBlob,
      })
      const { text: userText } = await whisperRes.json()
      if (!userText) throw new Error('Inget tal detekterat')
      addToTranscript('candidate', userText)

      const activeQuestions = activeQuestionsRef.current
      const nextIndex = currentQuestionIndexRef.current + 1
      let aiText
      let finishing = false

      if (nextIndex < activeQuestions.length) {
        aiText =
          `Tack. Fråga ${nextIndex + 1} av ${activeQuestions.length}: ` +
          activeQuestions[nextIndex].question
        setCurrentQuestionIndex(nextIndex)
        currentQuestionIndexRef.current = nextIndex
      } else {
        aiText =
          'Tack så mycket, det var alla mina frågor. ' +
          'Du har genomfört intervjun. Bra jobbat!'
        finishing = true
      }

      setInterviewState(STATES.PREPARING_NEXT)
      await speakText(aiText)
      addToTranscript('interviewer', aiText)

      if (finishing) {
        setInterviewState(STATES.FINISHED)
        await saveSession()
      } else {
        setInterviewState(STATES.WAITING_FOR_USER)
      }
    } catch (error) {
      console.error(error)
      setErrorMsg(error.message)
      setInterviewState(STATES.WAITING_FOR_USER)
    }
  }

  async function saveSession() {
    try {
      const uid = auth.currentUser.uid
      const activeQuestions = activeQuestionsRef.current
      const finalTranscript = transcriptRef.current

      const transcriptForAnalysis = []
      activeQuestions.forEach((q, index) => {
        const candidateEntry = finalTranscript.find(
          (t, i) => t.role === 'candidate' && i > index * 2
        )
        if (candidateEntry) {
          transcriptForAnalysis.push({ question: q.question, answer: candidateEntry.text })
        }
      })

      const compSnap = await getDocs(collection(db, 'users', uid, 'competencies'))
      const rawCompetencies = compSnap.docs.map((d) => d.data())

      const feedback = await analyzeInterviewFeedback(
        transcriptForAnalysis,
        job?.jobTitle ?? '',
        job?.company ?? '',
        sanitizeCompetencies(rawCompetencies),
        { focus: interviewConfig.focus, difficulty: interviewConfig.difficulty }
      )

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

      navigate(`/feedback/${jobId}/${feedbackRef.id}`)
    } catch (err) {
      console.error('Kunde inte spara sessionen:', err)
      setErrorMsg(err.message ?? 'Kunde inte spara sessionen.')
    }
  }

  function endInterview() {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.src = ''
      audioRef.current = null
    }
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    navigate(-1)
  }

  // ── Render ──────────────────────────────────────────────────────────────

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
          onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
          onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
        >
          ← Tillbaka
        </button>
        <p className="text-sm" style={{ color: '#f87171' }}>
          {loadError || 'Hittade ingen jobbannons.'}
        </p>
      </div>
    )
  }

  const activeQuestions = activeQuestionsRef.current
  const totalQuestions = activeQuestions.length
  const currentQuestion = activeQuestions[currentQuestionIndex]

  const showQuestion =
    (interviewState === STATES.AI_SPEAKING ||
      interviewState === STATES.WAITING_FOR_USER ||
      interviewState === STATES.RECORDING ||
      interviewState === STATES.PROCESSING) &&
    currentQuestion != null

  const showButton =
    interviewState === STATES.WAITING_FOR_USER ||
    interviewState === STATES.RECORDING

  const showProgress = interviewState !== STATES.CONNECTING && totalQuestions > 0

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Intervju med {interviewerName}
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#9ca3af' }}>
            {job.jobTitle}
            {job.company ? ` · ${job.company}` : ''}
          </p>
        </div>

        {interviewState !== STATES.FINISHED && (
          <div className="shrink-0 pt-1">
            {showConfirmAbort ? (
              <div className="text-right space-y-2">
                <p className="text-xs" style={{ color: '#9ca3af' }}>
                  Avsluta intervjun? Ditt svar sparas inte.
                </p>
                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={() => setShowConfirmAbort(false)}
                    className="text-xs px-3 py-1.5 rounded-md transition-colors"
                    style={{ backgroundColor: '#404040', color: '#9ca3af' }}
                    onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
                    onMouseOut={(e) => (e.currentTarget.style.color = '#9ca3af')}
                  >
                    Fortsätt intervjun
                  </button>
                  <button
                    onClick={endInterview}
                    className="text-xs px-3 py-1.5 rounded-md font-semibold"
                    style={{ backgroundColor: '#7f1d1d', color: '#f87171' }}
                  >
                    Ja, avsluta
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowConfirmAbort(true)}
                className="text-xs font-medium transition-colors"
                style={{ color: '#ef4444' }}
                onMouseOver={(e) => (e.currentTarget.style.color = '#fca5a5')}
                onMouseOut={(e) => (e.currentTarget.style.color = '#ef4444')}
              >
                ✕ Avsluta intervju
              </button>
            )}
          </div>
        )}
      </div>

      {/* Progress bar */}
      {showProgress && (
        <ProgressBar
          current={currentQuestionIndex + 1}
          total={totalQuestions}
        />
      )}

      {/* Status circle + label */}
      <div className="flex flex-col items-center gap-6">
        <StatusCircle state={interviewState} />
        {interviewState === STATES.PROCESSING || interviewState === STATES.PREPARING_NEXT ? (
          <p
            className="text-lg font-semibold text-white text-center"
            style={{ animation: 'ttsTextPulse 1.4s ease-in-out infinite' }}
          >
            {statusLabel(interviewState, interviewerName)}
          </p>
        ) : (
          <p
            className="text-sm font-medium"
            style={{ color: interviewState === STATES.WAITING_FOR_USER ? '#22c55e' : '#9ca3af' }}
          >
            {statusLabel(interviewState, interviewerName)}
          </p>
        )}
      </div>

      {/* Current question */}
      {showQuestion && (
        <div
          className="rounded-xl border p-5 space-y-2"
          style={{ backgroundColor: '#1d1d1d', borderColor: '#404040' }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: '#8064ad' }}
          >
            Fråga {currentQuestionIndex + 1} av {totalQuestions}
          </p>
          <p className="text-sm leading-relaxed text-white">
            {currentQuestion.question}
          </p>
        </div>
      )}

      {/* Finished screen */}
      {interviewState === STATES.FINISHED && <FinishedScreen />}

      {/* Recording button */}
      {showButton && (
        <div className="flex flex-col items-center">
          <button
            onClick={handleRecordingToggle}
            className="px-8 py-4 rounded-full text-white text-base font-semibold transition-colors select-none"
            style={{
              backgroundColor:
                interviewState === STATES.RECORDING ? '#c0392b' : '#22c55e',
              minWidth: '240px',
            }}
          >
            {interviewState === STATES.RECORDING ? '⏹ Klar' : '🎙 Klicka för att svara'}
          </button>
        </div>
      )}

      {/* Error */}
      {errorMsg && (
        <p className="text-sm text-center" style={{ color: '#f87171' }}>
          {errorMsg}
          {(interviewState === STATES.WAITING_FOR_USER) && (
            <button
              onClick={() => setErrorMsg('')}
              className="ml-2 underline"
            >
              Stäng
            </button>
          )}
        </p>
      )}
    </div>
  )
}

// ── FinishedScreen ────────────────────────────────────────────────────────

const FINISHED_STEPS = [
  'Intervju genomförd',
  'Svar transkriberade',
  'Analyserar mot kompetensbank',
  'Genererar feedback...',
]

function FinishedScreen() {
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    if (visibleCount >= FINISHED_STEPS.length) return
    const timer = setTimeout(() => setVisibleCount((v) => v + 1), 800)
    return () => clearTimeout(timer)
  }, [visibleCount])

  const allVisible = visibleCount >= FINISHED_STEPS.length

  return (
    <div className="flex flex-col items-center gap-8 py-4">
      <ul className="space-y-4 w-full max-w-xs">
        {FINISHED_STEPS.map((step, i) => (
          <li
            key={i}
            className="flex items-center gap-3"
            style={{
              opacity: i < visibleCount ? 1 : 0,
              transition: 'opacity 0.5s ease',
            }}
          >
            <span
              className="flex items-center justify-center rounded-full shrink-0"
              style={{
                width: 28,
                height: 28,
                backgroundColor: '#22c55e20',
                border: '2px solid #22c55e',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span className="text-sm font-medium text-white">{step}</span>
          </li>
        ))}
      </ul>

      {allVisible && (
        <div
          className="flex items-center gap-3 mt-2"
          style={{ animation: 'ttsTextPulse 1.4s ease-in-out infinite' }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 18,
              height: 18,
              border: '2px solid #ffffff',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'ttsSpin 0.9s linear infinite',
              flexShrink: 0,
            }}
          />
          <span className="text-sm font-semibold text-white">
            Skapar din feedbackrapport...
          </span>
        </div>
      )}
    </div>
  )
}

// ── StatusCircle ──────────────────────────────────────────────────────────

function StatusCircle({ state }) {
  const config = {
    [STATES.CONNECTING]:       { color: '#6b7280', pulse: false, spin: true },
    [STATES.AI_SPEAKING]:      { color: '#8064ad', pulse: 'slow', spin: false },
    [STATES.WAITING_FOR_USER]: { color: '#22c55e', pulse: false, spin: false },
    [STATES.RECORDING]:        { color: '#c0392b', pulse: 'fast', spin: false },
    [STATES.PROCESSING]:       { color: '#ffffff', pulse: false, spin: true },
    [STATES.PREPARING_NEXT]:   { color: '#ffffff', pulse: false, spin: true },
    [STATES.FINISHED]:         { color: '#2a9d8f', pulse: false, spin: false },
  }[state] ?? { color: '#3a3d48', pulse: false, spin: false }

  return (
    <div className="relative" style={{ width: 160, height: 160 }}>
      {/* Pulse ring */}
      {config.pulse === 'fast' && (
        <span
          className="absolute inset-0 rounded-full"
          style={{
            backgroundColor: config.color,
            opacity: 0.35,
            animation: 'ttsPulseFast 1s ease-out infinite',
          }}
        />
      )}
      {config.pulse === 'slow' && (
        <span
          className="absolute inset-0 rounded-full"
          style={{
            backgroundColor: config.color,
            opacity: 0.35,
            animation: 'ttsPulseSlow 2.4s ease-out infinite',
          }}
        />
      )}
      {/* Spinning border (CONNECTING + PROCESSING) */}
      {config.spin && (
        <span
          className="absolute inset-0 rounded-full"
          style={{
            border: `4px solid ${config.color}`,
            borderTopColor: 'transparent',
            animation: 'ttsSpin 1s linear infinite',
          }}
        />
      )}
      {/* Filled circle */}
      <span
        className="absolute inset-0 rounded-full transition-colors"
        style={{ backgroundColor: config.color, opacity: 0.9 }}
      />
      <style>{`
        @keyframes ttsPulseFast {
          0%   { transform: scale(1);    opacity: 0.35; }
          100% { transform: scale(1.45); opacity: 0; }
        }
        @keyframes ttsPulseSlow {
          0%   { transform: scale(1);   opacity: 0.3; }
          100% { transform: scale(1.3); opacity: 0; }
        }
        @keyframes ttsSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes ttsTextPulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}

// ── ProgressBar ───────────────────────────────────────────────────────────

function ProgressBar({ current, total }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8064ad' }}>
          Fråga {current} av {total}
        </p>
        <p className="text-xs" style={{ color: '#6b7280' }}>
          {pct}%
        </p>
      </div>
      <div className="w-full rounded-full h-1.5" style={{ backgroundColor: '#404040' }}>
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: '#8064ad' }}
        />
      </div>
    </div>
  )
}
