import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { analyzeInterviewFeedback, sanitizeCompetencies } from '../lib/claude'
import { logSystemEvent } from '../lib/systemEvents'
import { cvCompetencies, cvDisplayName, trainingReadiness } from '../lib/cvs'
import {
  buttonStateForPhase,
  shouldShowIntroHint,
  buildRecordingLabel,
  PHASE_STATES as STATES,
} from '../lib/interviewPhase'
import { DEFAULT_LANGUAGE, isEnglish, normalizeLanguage } from '../lib/language'
import {
  buildGreeting,
  buildBridge,
  buildClosing,
  pickVoiceAndName,
  screenCopy,
} from '../lib/interviewScript'

const VERCEL_WHISPER =
  'https://interview-prep-liard-three.vercel.app/api/whisper'
const VERCEL_TTS = 'https://interview-prep-liard-three.vercel.app/api/tts'

/** Tak för ett enskilt transkriberingsanrop (normalt ~3 s). */
const WHISPER_TIMEOUT_MS = 45000
/** Yttersta skyddsnät: PROCESSING får aldrig bli permanent. */
const PROCESSING_WATCHDOG_MS = 75000

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
  language: DEFAULT_LANGUAGE,
  selectedQuestions: null,
}

// STATES is imported from ../lib/interviewPhase as PHASE_STATES

// ── Component ─────────────────────────────────────────────────────────────

export default function InterviewSimulatorTTS() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const rawConfig = { ...DEFAULT_CONFIG, ...(location.state ?? {}) }
  // Språket normaliseras EN gång här och används sedan genomgående – ett
  // trasigt värde i navigationsstaten ska aldrig kunna välta intervjun.
  const interviewConfig = {
    ...rawConfig,
    language: normalizeLanguage(rawConfig.language),
  }
  const language = interviewConfig.language
  const copy = screenCopy(language)

  const [job, setJob] = useState(null)
  // Uppdragets kopplade CV – feedbacken bedöms mot ENBART det.
  const cvRef = useRef(null)
  const [loadingJob, setLoadingJob] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [interviewState, setInterviewState] = useState(STATES.CONNECTING)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [transcript, setTranscript] = useState([])
  const [errorMsg, setErrorMsg] = useState('')
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [showIntroHint, setShowIntroHint] = useState(false)

  // Röst och namn väljs EN gång per session. useState med lazy initializer,
  // inte useMemo: useMemo är en prestandaoptimering utan semantisk garanti –
  // React får slänga cachen och räkna om, vilket skulle byta intervjuarens
  // röst och namn mitt i en pågående intervju.
  const [{ voice: interviewerVoice, name: interviewerName }] = useState(() =>
    pickVoiceAndName(language)
  )
  const [showConfirmAbort, setShowConfirmAbort] = useState(false)

  const audioRef = useRef(null)
  const audioUrlRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const audioChunksRef = useRef([])
  const transcriptRef = useRef(transcript)
  const currentQuestionIndexRef = useRef(0)
  const activeQuestionsRef = useRef([])
  const recordingStartRef = useRef(null)
  const abortedRef = useRef(false)
  const ttsAbortRef = useRef(null)
  const startedRef = useRef(false)

  useEffect(() => {
    transcriptRef.current = transcript
  }, [transcript])

  useEffect(() => {
    currentQuestionIndexRef.current = currentQuestionIndex
  }, [currentQuestionIndex])

  // Recording timer
  useEffect(() => {
    if (interviewState !== STATES.RECORDING) { setRecordingSeconds(0); return }
    const id = setInterval(() => setRecordingSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [interviewState])

  // Skyddsnät: om PROCESSING aldrig tar slut – t.ex. för att MediaRecorder
  // inte levererade sitt stop-event – släpper vi tillbaka användaren med ett
  // felmeddelande i stället för att låta vyn hänga tyst. Användaren kan då
  // svara om i stället för att tvingas starta hela intervjun på nytt.
  useEffect(() => {
    if (interviewState !== STATES.PROCESSING) return
    const id = setTimeout(() => {
      setErrorMsg(copy.processingStalled)
      setInterviewState(STATES.WAITING_FOR_USER)
    }, PROCESSING_WATCHDOG_MS)
    return () => clearTimeout(id)
  }, [interviewState, copy])

  // Load intro-hint flag once on mount
  useEffect(() => {
    async function loadHintFlag() {
      try {
        const uid = auth.currentUser?.uid
        if (!uid) return
        const snap = await getDoc(doc(db, 'users', uid))
        if (snap.exists() && shouldShowIntroHint(snap.data().hasSeenInterviewIntro)) {
          setShowIntroHint(true)
        }
      } catch { /* non-critical */ }
    }
    loadHintFlag()
  }, [])

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
          return
        }
        const loadedJob = { docId: snap.id, ...snap.data() }
        // Spärr även här (inte bara på uppdragssidan): en direktlänk eller ett
        // bokmärke ska inte kunna starta en träning utan kopplat CV.
        const cvSnap = loadedJob.cvId
          ? await getDoc(doc(db, 'users', uid, 'cvs', loadedJob.cvId))
          : null
        if (cancelled) return
        const cv = cvSnap?.exists() ? { id: cvSnap.id, ...cvSnap.data() } : null
        const readiness = trainingReadiness(loadedJob, cv ? [cv] : [])
        if (readiness.reason === 'no-cv' || readiness.reason === 'cv-missing') {
          setLoadError(copy.cvRequired)
          return
        }
        cvRef.current = cv
        setJob(loadedJob)
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

  // Auto-start interview when job loads.
  // startedRef spärrar mot DUBBELSTART. StrictMode kör medvetet effekter två
  // gånger i utvecklingsläge, och utan spärren startas intervjun två gånger –
  // två hälsningar spelas upp ovanpå varandra.
  useEffect(() => {
    if (!job || startedRef.current) return
    startedRef.current = true
    startInterview() // eslint-disable-line react-hooks/exhaustive-deps
  }, [job]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    // MÅSTE nollställas vid montering. Städfunktionen nedan sätter flaggan till
    // true, och StrictMode kör medvetet setup → cleanup → setup i
    // utvecklingsläge. Utan den här raden blir flaggan kvar som true på en
    // levande komponent, och då tystnar allt: speakText avbryter direkt efter
    // hämtningen (ingen röst) och recorder.onstop hoppar över processAnswer
    // (svaret behandlas aldrig – vyn står kvar i PROCESSING).
    abortedRef.current = false

    return () => {
      abortedRef.current = true
      // Avbryt en pågående TTS-hämtning INNAN ljudet hinner skapas.
      ttsAbortRef.current?.abort()
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        audio.src = ''
        audioRef.current = null
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current)
        audioUrlRef.current = null
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

  async function dismissIntroHint() {
    setShowIntroHint(false)
    try {
      const uid = auth.currentUser?.uid
      if (!uid) return
      await updateDoc(doc(db, 'users', uid), { hasSeenInterviewIntro: true })
    } catch { /* non-critical */ }
  }

  /** Stoppar och frigör ljud som eventuellt fortfarande hänger kvar. */
  function stopCurrentAudio() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }
  }

  // speakText: fetches TTS, signals AI_SPEAKING when audio starts, resolves when done
  async function speakText(text) {
    stopCurrentAudio()

    // TTS-hämtningen måste gå att avbryta. Utan detta kan komponenten hinna
    // avmonteras (Vite HMR, navigering, StrictMode) medan hämtningen pågår –
    // och eftersom audioRef sätts FÖRST efteråt hittar städningen ingenting
    // att stoppa. Ljudet börjar då spela i en komponent som inte längre finns
    // och kan aldrig tystas. Det var så två röster kunde prata samtidigt.
    ttsAbortRef.current?.abort()
    const controller = new AbortController()
    ttsAbortRef.current = controller

    const r = await fetch(VERCEL_TTS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: interviewerVoice, language }),
      signal: controller.signal,
    })
    if (abortedRef.current || controller.signal.aborted) return
    if (!r.ok) {
      const errText = await r.text()
      throw new Error('TTS fel: ' + errText)
    }

    const audioData = await r.arrayBuffer()
    // Sista kontrollen innan vi skapar något som kan låta.
    if (abortedRef.current || controller.signal.aborted) return

    const blob = new Blob([audioData], { type: 'audio/mpeg' })
    const url = URL.createObjectURL(blob)
    audioUrlRef.current = url
    const audio = new Audio()
    audio.src = url
    audioRef.current = audio

    // Signal AI_SPEAKING the moment playback actually starts.
    await new Promise((resolve, reject) => {
      audio.oncanplaythrough = () => {
        audio.play()
          .then(() => {
            setInterviewState(STATES.AI_SPEAKING)
            resolve()
          })
          .catch(reject)
      }
      audio.onerror = () => reject(new Error('Ljudet kunde inte spelas upp.'))
      audio.load()
    })

    // Wait for playback to finish, but NEVER hang forever: resolve on ended,
    // on a mid-playback error, or after a duration-based safety timeout.
    await new Promise((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        audio.onended = null
        audio.onerror = null
        resolve()
      }
      audio.onended = finish
      audio.onerror = finish
      const durationMs = Number.isFinite(audio.duration) ? audio.duration * 1000 : 0
      const timer = setTimeout(finish, durationMs + 8000)
    })

    if (audioUrlRef.current === url) {
      URL.revokeObjectURL(url)
      audioUrlRef.current = null
    }
    if (audioRef.current === audio) audioRef.current = null
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

    const greeting = buildGreeting({
      interviewerName,
      // Engelsk rolltitel när den finns – annars läser den engelska rösten en
      // svensk titel mitt i en engelsk mening, vilket låter fel.
      jobTitle: (isEnglish(language) && job.jobTitleEn) || job.jobTitle,
      company: job.company,
      total: activeQuestions.length,
      firstQuestion: activeQuestions[0].question,
      language,
    })

    try {
      await speakText(greeting)
      addToTranscript('interviewer', greeting)
      setInterviewState(STATES.WAITING_FOR_USER)
    } catch (err) {
      console.error('TTS-fel:', err)
      logSystemEvent({ type: 'pipeline_error', severity: 'error', step: 'tts', message: err.message })
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
        // Mikrofonen släpps FÖRST här – se kommentaren i stopRecording().
        streamRef.current?.getTracks().forEach((t) => t.stop())
        // If the interview was aborted/unmounted, don't process a stray answer.
        if (abortedRef.current) return
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
    // VIKTIGT: mikrofonspåren stoppas INTE här. MediaRecorder behöver källan
    // levande tills den spolat ut sista ljudbiten. Dödas spåren direkt efter
    // stop() kan 'stop'-eventet utebli helt – då anropas processAnswer aldrig
    // och vyn fastnar i PROCESSING för alltid ("Analyserar ditt svar...").
    // Spåren släpps i recorder.onstop i stället.
    recorder.stop()
    setInterviewState(STATES.PROCESSING)
  }

  async function processAnswer(audioBlob) {
    let step = 'whisper'
    const prevIndex = currentQuestionIndexRef.current
    let advanced = false
    try {
      // Språket skickas som query eftersom kroppen är rå ljuddata. Proxyn
      // validerar mot en vitlista och faller tillbaka på svenska.
      // Hårt tak på transkriberingen. Utan detta kan ett hängande nätverksanrop
      // låsa vyn i PROCESSING utan att något felmeddelande någonsin visas.
      const whisperAbort = new AbortController()
      const whisperTimer = setTimeout(() => whisperAbort.abort(), WHISPER_TIMEOUT_MS)
      let whisperRes
      try {
        whisperRes = await fetch(
          `${VERCEL_WHISPER}?language=${encodeURIComponent(language)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'audio/webm' },
            body: audioBlob,
            signal: whisperAbort.signal,
          }
        )
      } catch (err) {
        if (err.name === 'AbortError') throw new Error(copy.transcriptionTimeout)
        throw err
      } finally {
        clearTimeout(whisperTimer)
      }
      if (!whisperRes.ok) throw new Error(`Whisper HTTP ${whisperRes.status}`)
      const { text: userText } = await whisperRes.json()
      if (!userText) throw new Error('Inget tal detekterat')
      addToTranscript('candidate', userText)

      const activeQuestions = activeQuestionsRef.current
      const nextIndex = prevIndex + 1
      let aiText
      let finishing = false

      if (nextIndex < activeQuestions.length) {
        aiText = buildBridge({
          number: nextIndex + 1,
          total: activeQuestions.length,
          question: activeQuestions[nextIndex].question,
          language,
        })
        setCurrentQuestionIndex(nextIndex)
        currentQuestionIndexRef.current = nextIndex
        advanced = true
      } else {
        aiText = buildClosing({ language })
        finishing = true
      }

      step = 'tts'
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
      // If we advanced the question but never got it spoken, roll the index
      // back so the user re-answers the correct (current) question.
      if (advanced) {
        setCurrentQuestionIndex(prevIndex)
        currentQuestionIndexRef.current = prevIndex
      }
      console.error(error)
      logSystemEvent({ type: 'pipeline_error', severity: 'error', step, message: error.message })
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

      const rawCompetencies = cvCompetencies(cvRef.current)

      let feedback
      try {
        feedback = await analyzeInterviewFeedback(
          transcriptForAnalysis,
          job?.jobTitle ?? '',
          job?.company ?? '',
          sanitizeCompetencies(rawCompetencies),
          {
            focus: interviewConfig.focus,
            difficulty: interviewConfig.difficulty,
            language,
          }
        )
      } catch (err) {
        logSystemEvent({ type: 'pipeline_error', severity: 'error', step: 'claude', message: err.message })
        throw err
      }

      let feedbackRef
      try {
        feedbackRef = await addDoc(
          collection(db, 'users', uid, 'jobs', jobId, 'feedback'),
          {
            createdAt: serverTimestamp(),
            overallScore: feedback.overallScore,
            summary: feedback.summary,
            strengths: feedback.strengths,
            improvements: feedback.improvements,
            competencyGaps: feedback.competencyGaps ?? [],
            questionFeedback: feedback.questionFeedback,
            // Rolltiteln på sessionens språk – feedbacksidan visar den rakt av,
            // och "Interim IT-chef" i en engelsk rubrik ser ofärdigt ut.
            jobTitle: (isEnglish(language) && job?.jobTitleEn) || job?.jobTitle || '',
            company: job?.company ?? '',
            // Vilket CV sessionen bedömdes mot – historiken behåller det även
            // om uppdraget senare kopplas till ett annat CV.
            cvId: cvRef.current?.id ?? null,
            cvLabel: cvRef.current ? cvDisplayName(cvRef.current) : '',
            interviewer: interviewerName,
            // Språket sparas så historiken och säljarens vy kan märka upp
            // engelska sessioner. Äldre feedback saknar fältet och behandlas
            // överallt som svensk.
            language,
            transcript: transcriptForAnalysis,
            // Delning är opt-in: ny feedback är privat tills konsulten själv delar.
            sharedWithSeller: false,
            sharedAt: null,
          }
        )
      } catch (err) {
        logSystemEvent({ type: 'pipeline_error', severity: 'error', step: 'firestore', message: err.message })
        throw err
      }

      // Teknisk driftsignal – inga betyg, bara att en session slutfördes.
      logSystemEvent({
        type: 'session_completed',
        severity: 'info',
        step: 'complete',
        message: `${activeQuestions.length} frågor`,
      })

      navigate(`/feedback/${jobId}/${feedbackRef.id}`)
    } catch (err) {
      console.error('Kunde inte spara sessionen:', err)
      setErrorMsg(err.message ?? 'Kunde inte spara sessionen.')
    }
  }

  function endInterview() {
    abortedRef.current = true
    ttsAbortRef.current?.abort()
    stopCurrentAudio()
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    navigate(-1)
  }

  // Retry saving after a failed feedback save (Claude/Firestore hiccup) so the
  // user is never stranded on the finished screen with their session lost.
  async function retrySaveSession() {
    setErrorMsg('')
    await saveSession()
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (loadingJob) {
    return (
      <p className="text-sm py-8" style={{ color: '#6b7280' }}>
        {copy.loadingJob}
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
          {copy.back}
        </button>
        {loadError === copy.cvRequired ? (
          // Ingen krasch – en vägledning. Neutral inforuta, coach-ton.
          <div
            className="rounded-xl border p-5 space-y-3 max-w-xl"
            style={{ backgroundColor: '#1a1626', borderColor: '#8064ad80' }}
          >
            <p className="text-sm text-white">{copy.cvRequired}</p>
            <button
              onClick={() => navigate(`/jobb/${jobId}`)}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={{ backgroundColor: 'transparent', border: '1px solid #8064ad', color: '#d8ccec' }}
            >
              {copy.backToJob}
            </button>
          </div>
        ) : (
          <p className="text-sm" style={{ color: '#f87171' }}>
            {loadError || copy.notFound}
          </p>
        )}
      </div>
    )
  }

  const activeQuestions = activeQuestionsRef.current
  const totalQuestions  = activeQuestions.length
  const currentQuestion = activeQuestions[currentQuestionIndex]

  const showQuestion =
    (interviewState === STATES.AI_SPEAKING ||
      interviewState === STATES.WAITING_FOR_USER ||
      interviewState === STATES.RECORDING ||
      interviewState === STATES.PROCESSING) &&
    currentQuestion != null

  const showProgress = interviewState !== STATES.CONNECTING && totalQuestions > 0

  const btnState = buttonStateForPhase(interviewState, { interviewerName, language })

  // Build button label: append live timer when recording
  // Ingen emoji-prefix: läget bärs redan av knappens färg (grön/röd), av
  // pulsanimationen och av texten själv. Emoji renderas dessutom olika per
  // plattform och bryter appens streckade ikonspråk.
  const buttonLabel = btnState.recording
    ? buildRecordingLabel(recordingSeconds, language)
    : btnState.label

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {copy.title(interviewerName)}
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#9ca3af' }}>
            {(isEnglish(language) && job.jobTitleEn) || job.jobTitle}
            {job.company ? ` · ${job.company}` : ''}
          </p>
        </div>

        {interviewState !== STATES.FINISHED && (
          <div className="shrink-0 pt-1">
            {showConfirmAbort ? (
              <div className="text-right space-y-2">
                <p className="text-xs" style={{ color: '#9ca3af' }}>
                  {copy.confirmAbort}
                </p>
                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={() => setShowConfirmAbort(false)}
                    className="text-xs px-3 py-1.5 rounded-md transition-colors"
                    style={{ backgroundColor: '#404040', color: '#9ca3af' }}
                    onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
                    onMouseOut={(e) => (e.currentTarget.style.color = '#9ca3af')}
                  >
                    {copy.continueInterview}
                  </button>
                  <button
                    onClick={endInterview}
                    className="text-xs px-3 py-1.5 rounded-md font-semibold"
                    style={{ backgroundColor: '#7f1d1d', color: '#f87171' }}
                  >
                    {copy.confirmEnd}
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
                {copy.endInterview}
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
          copy={copy}
        />
      )}

      {/* Status circle + label */}
      <div className="flex flex-col items-center gap-6">
        <StatusCircle state={interviewState} />
        {btnState.showSpinner ? (
          <p
            className="text-lg font-semibold text-white text-center"
            style={{ animation: 'ttsTextPulse 1.4s ease-in-out infinite' }}
          >
            {btnState.subLabel}
          </p>
        ) : (
          <p
            className="text-sm font-medium"
            style={{ color: interviewState === STATES.WAITING_FOR_USER ? '#22c55e' : '#9ca3af' }}
          >
            {btnState.subLabel}
          </p>
        )}
      </div>

      {/* One-time intro hint: shown before the first answer */}
      {showIntroHint &&
        interviewState === STATES.WAITING_FOR_USER &&
        currentQuestionIndex === 0 && (
        <div
          className="flex items-start gap-3 rounded-xl border px-5 py-4"
          style={{ backgroundColor: '#141414', borderColor: '#323232' }}
        >
          <p className="flex-1 text-sm leading-relaxed" style={{ color: '#d1d5db' }}>
            <span className="font-semibold text-white">{copy.introLead}</span>
            {copy.introBody}
          </p>
          <button
            onClick={dismissIntroHint}
            aria-label={copy.closeHint}
            className="shrink-0 mt-0.5 text-xs transition-colors"
            style={{ color: '#6b7280' }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
          >
            ✕
          </button>
        </div>
      )}

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
            {copy.questionCounter(currentQuestionIndex + 1, totalQuestions)}
          </p>
          <p className="text-sm leading-relaxed text-white">
            {currentQuestion.question}
          </p>
        </div>
      )}

      {/* Finished screen (hidden once a save error needs the user's attention) */}
      {interviewState === STATES.FINISHED && !errorMsg && <FinishedScreen copy={copy} />}

      {/* Recovery when the final save failed – never strand the user here */}
      {interviewState === STATES.FINISHED && errorMsg && (
        <div
          className="rounded-xl border p-5 space-y-3"
          style={{ backgroundColor: '#1d1d1d', borderColor: '#404040' }}
        >
          <p className="text-sm font-semibold text-white">
            {copy.saveFailed}
          </p>
          <p className="text-sm" style={{ color: '#f87171' }}>
            {errorMsg}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={retrySaveSession}
              className="px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors"
              style={{ backgroundColor: '#8064ad' }}
            >
              {copy.retry}
            </button>
            <button
              onClick={() => navigate(`/jobb/${jobId}`)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ backgroundColor: '#404040', color: '#d1d5db' }}
            >
              {copy.backToJob}
            </button>
          </div>
        </div>
      )}

      {/* Action button */}
      {btnState.label && (
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleRecordingToggle}
            disabled={!btnState.enabled}
            aria-label={buttonLabel}
            className="px-8 py-4 rounded-full text-white text-base font-semibold select-none transition-colors disabled:opacity-50"
            style={{
              backgroundColor: btnState.recording ? '#c0392b' : '#22c55e',
              minWidth: '260px',
              animation: btnState.enabled && !btnState.recording
                ? 'waitingPulse 2s ease-in-out infinite'
                : 'none',
            }}
          >
            {buttonLabel}
          </button>
        </div>
      )}

      {/* Error (the FINISHED state has its own recovery card above) */}
      {errorMsg && interviewState !== STATES.FINISHED && (
        <p className="text-sm text-center" style={{ color: '#f87171' }}>
          {errorMsg}
          {(interviewState === STATES.WAITING_FOR_USER) && (
            <button
              onClick={() => setErrorMsg('')}
              className="ml-2 underline"
            >
              {copy.dismiss}
            </button>
          )}
        </p>
      )}
    </div>
  )
}

// ── FinishedScreen ────────────────────────────────────────────────────────

function FinishedScreen({ copy }) {
  const [visibleCount, setVisibleCount] = useState(0)
  const steps = copy.finishedSteps

  useEffect(() => {
    if (visibleCount >= steps.length) return
    const timer = setTimeout(() => setVisibleCount((v) => v + 1), 800)
    return () => clearTimeout(timer)
  }, [visibleCount, steps.length])

  const allVisible = visibleCount >= steps.length

  return (
    <div className="flex flex-col items-center gap-8 py-4">
      <ul className="space-y-4 w-full max-w-xs">
        {steps.map((step, i) => (
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
            {copy.creatingReport}
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
        @keyframes waitingPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5); }
          60%      { box-shadow: 0 0 0 14px rgba(34, 197, 94, 0); }
        }
      `}</style>
    </div>
  )
}

// ── ProgressBar ───────────────────────────────────────────────────────────

function ProgressBar({ current, total, copy }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8064ad' }}>
          {copy.questionCounter(current, total)}
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
