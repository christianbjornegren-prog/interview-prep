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
import { createSessionTrail, isAbortError } from '../lib/diagnostics'
import { getSharedAudio, isAudioUnlocked, markAudioUnlocked, unlockAudio } from '../lib/audioUnlock'
import { baseMimeType, micErrorCopyKey, pickRecordingMimeType } from '../lib/recording'
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
/** Så länge väntar vi på att en hämtad replik faktiskt börjar låta. */
const PLAY_START_TIMEOUT_MS = 20000

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
  // Webbläsaren nekade ljudet och väntar på ett tryck (Safari/iPhone).
  const [needsTap, setNeedsTap] = useState(false)
  // Hälsningen gick inte att hämta/spela – visa "Försök igen" i stället för
  // en snurra som aldrig tar slut.
  const [startFailed, setStartFailed] = useState(false)

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

  // ── Felsökningsunderlag (lib/diagnostics.js) ──────────────────────────────
  // Spåret är sessionens färdskrivare: korta tekniska noteringar som skickas
  // med när något loggas, så man ser vägen fram till ett fel. Aldrig innehåll.
  const trailRef = useRef(null)
  if (!trailRef.current) trailRef.current = createSessionTrail()
  const phaseRef = useRef(STATES.CONNECTING)
  const recorderMimeRef = useRef('')
  const tapResolverRef = useRef(null)
  const sessionLoggedRef = useRef(false)   // session_started är loggad
  const sessionClosedRef = useRef(false)   // slutförd eller avbruten är loggad
  const audioBlockedLoggedRef = useRef(false)

  /** Byter läge och noterar det i spåret. ENDA stället som sätter läget. */
  function setPhase(next) {
    if (phaseRef.current !== next) {
      phaseRef.current = next
      trailRef.current.mark(`läge:${next}`)
    }
    setInterviewState(next)
  }

  function sessionContext(extra = {}) {
    const trail = trailRef.current
    return {
      sessionId: trail.id,
      phase: phaseRef.current,
      questionIndex: currentQuestionIndexRef.current,
      totalQuestions: activeQuestionsRef.current.length,
      elapsedMs: trail.elapsedMs(),
      language,
      voice: interviewerVoice,
      audioUnlocked: isAudioUnlocked(),
      recorderMime: recorderMimeRef.current,
      trail: trail.entries(),
      ...extra,
    }
  }

  /** Ett fel i kedjan – med allt som behövs för att hitta rotorsaken. */
  function logPipelineError(step, err, extra = {}) {
    trailRef.current.mark(`FEL ${step}: ${err?.name ?? 'Error'}`)
    logSystemEvent({
      type: 'pipeline_error',
      severity: 'error',
      step,
      message: err?.message ?? String(err),
      context: sessionContext({
        errorName: err?.name,
        httpStatus: err?.httpStatus,
        detail: err?.detail,
        ...extra,
      }),
    })
  }

  /** En driftsignal som INTE är ett fel (start, slut, avbrott, nekat ljud). */
  function logSessionInfo(type, step, message, extra = {}) {
    logSystemEvent({ type, severity: 'info', step, message, context: sessionContext(extra) })
  }

  /** Användaren lämnade innan intervjun blev klar. Loggas högst en gång. */
  function logSessionAborted(how) {
    if (!sessionLoggedRef.current || sessionClosedRef.current) return
    sessionClosedRef.current = true
    logSessionInfo('session_aborted', phaseRef.current, how)
  }

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
      logPipelineError('recorder', new Error(
        `Inget svar från inspelningen inom ${PROCESSING_WATCHDOG_MS / 1000} s`
      ))
      setErrorMsg(copy.processingStalled)
      setPhase(STATES.WAITING_FOR_USER)
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
      // Lämnade sidan mitt i intervjun (bakåtknapp, menyval). Ett avbrott –
      // inte ett fel. Loggas FÖRE flaggan nedan så läget följer med.
      logSessionAborted('Lämnade sidan')
      abortedRef.current = true
      // Avbryt en pågående TTS-hämtning INNAN ljudet hinner skapas.
      ttsAbortRef.current?.abort()
      stopCurrentAudio()
      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop()
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // Miljön under intervjun: noteras i spåret (doldes sidan? föll nätet bort?)
  // och skärmen hålls vaken – en telefon som släcker skärmen mitt i ett svar
  // pausar både ljud och inspelning.
  useEffect(() => {
    const trail = trailRef.current
    let wakeLock = null
    let unmounted = false

    async function keepAwake() {
      try {
        if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return
        const lock = await navigator.wakeLock.request('screen')
        if (unmounted) lock.release().catch(() => {})
        else wakeLock = lock
      } catch { /* stöds inte eller nekades – intervjun fungerar ändå */ }
    }

    const onVisibility = () => {
      trail.mark(`sida:${document.visibilityState === 'visible' ? 'synlig' : 'dold'}`)
      // Webbläsaren släpper låset när sidan döljs – ta det igen när den syns.
      if (document.visibilityState === 'visible') keepAwake()
    }
    const onOnline = () => trail.mark('nät:tillbaka')
    const onOffline = () => trail.mark('nät:borta')

    keepAwake()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      unmounted = true
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      wakeLock?.release().catch(() => {})
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

  /**
   * Tystar ljudet och släpper en väntande "tryck för att starta".
   * Ljudelementet är DELAT (lib/audioUnlock.js) och får inte kastas – det är
   * elementet som bär upplåsningen från användarens tryck. Det töms i stället.
   */
  function stopCurrentAudio() {
    const pendingTap = tapResolverRef.current
    if (pendingTap) {
      tapResolverRef.current = null
      pendingTap.resolve()
    }
    const audio = audioRef.current
    if (audio) {
      audio.onended = null
      audio.onerror = null
      try {
        audio.pause()
        // Töm källan, så en pausad replik inte kan dras igång från låsskärmen
        // eller hörlurarna. removeAttribute + load() ger inget error-event
        // (det gör src = '').
        audio.removeAttribute('src')
        audio.load()
      } catch { /* städning får aldrig kasta */ }
      audioRef.current = null
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }
  }

  /**
   * Startar uppspelningen. Nekar webbläsaren (Safari/iPhone kräver ett tryck)
   * visas en knapp, och funktionen väntar tills användaren tryckt på den –
   * ett nekat ljud är alltså en fråga till användaren, inte ett fel.
   */
  async function startPlayback(audio) {
    const trail = trailRef.current
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          audio.pause()
          reject(new Error('Ljudet kunde inte spelas upp.'))
        }, PLAY_START_TIMEOUT_MS)
        // play() direkt – ingen väntan på canplaythrough, som på iPhone inte
        // alltid kommer förrän uppspelningen redan har begärts.
        audio.play().then(
          () => { clearTimeout(timer); resolve() },
          (err) => { clearTimeout(timer); reject(err) }
        )
      })
      markAudioUnlocked()
      trail.mark('ljud:spelar')
    } catch (err) {
      if (err?.name !== 'NotAllowedError' || abortedRef.current) throw err
      trail.mark('ljud:nekat – väntar på tryck')
      if (!audioBlockedLoggedRef.current) {
        audioBlockedLoggedRef.current = true
        logSessionInfo('audio_blocked', 'tts', err.message, { errorName: err.name })
      }
      try {
        await new Promise((resolve, reject) => {
          tapResolverRef.current = { resolve, reject }
          setNeedsTap(true)
        })
      } finally {
        setNeedsTap(false)
      }
    }
  }

  // Körs I trycket: play() måste anropas synkront här för att räknas.
  function handleTapToStart() {
    const pending = tapResolverRef.current
    if (!pending) return
    tapResolverRef.current = null
    getSharedAudio().play().then(
      () => {
        markAudioUnlocked()
        trailRef.current.mark('ljud:spelar efter tryck')
        pending.resolve()
      },
      (err) => pending.reject(err)
    )
  }

  // speakText: fetches TTS, signals AI_SPEAKING when audio starts, resolves when done
  async function speakText(text) {
    stopCurrentAudio()
    const trail = trailRef.current

    // TTS-hämtningen måste gå att avbryta. Utan detta kan komponenten hinna
    // avmonteras (Vite HMR, navigering, StrictMode) medan hämtningen pågår –
    // och ljudet börjar då spela i en komponent som inte längre finns.
    // Det var så två röster kunde prata samtidigt.
    ttsAbortRef.current?.abort()
    const controller = new AbortController()
    ttsAbortRef.current = controller

    const fetchStarted = Date.now()
    trail.mark(`tts:hämtar ${text.length} tecken`)
    const r = await fetch(VERCEL_TTS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: interviewerVoice, language }),
      signal: controller.signal,
    })
    if (abortedRef.current || controller.signal.aborted) return
    if (!r.ok) {
      const errText = await r.text()
      const err = new Error('TTS fel: ' + errText)
      err.httpStatus = r.status
      throw err
    }

    const audioData = await r.arrayBuffer()
    // Sista kontrollen innan vi skapar något som kan låta.
    if (abortedRef.current || controller.signal.aborted) return
    trail.mark(`tts:klar ${Date.now() - fetchStarted} ms, ${audioData.byteLength} byte`)

    const blob = new Blob([audioData], { type: 'audio/mpeg' })
    const url = URL.createObjectURL(blob)
    audioUrlRef.current = url
    // Appens DELADE ljudelement – upplåst av klicket på Starta. Ett nytt
    // new Audio() per replik nekas av Safari och iPhone (se lib/audioUnlock.js).
    const audio = getSharedAudio()
    audio.onended = null
    audio.onerror = null
    audio.src = url
    audioRef.current = audio

    await startPlayback(audio)
    if (abortedRef.current || controller.signal.aborted) return
    // Signal AI_SPEAKING the moment playback actually starts.
    setPhase(STATES.AI_SPEAKING)

    // Wait for playback to finish, but NEVER hang forever: resolve on ended,
    // on a mid-playback error, or after a duration-based safety timeout.
    await new Promise((resolve) => {
      let settled = false
      const finish = (how) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        audio.onended = null
        audio.onerror = null
        if (how !== 'slut') trail.mark(`ljud:${how}`)
        resolve()
      }
      audio.onended = () => finish('slut')
      audio.onerror = () => finish('avbröts av fel')
      // Okänd längd (händer på iPhone): uppskatta från textens längd i stället
      // för att släppa fram mikrofonknappen mitt i frågan.
      const durationMs = Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration * 1000
        : Math.max(30000, text.length * 120)
      const timer = setTimeout(() => finish('tog för lång tid'), durationMs + 8000)
      // Redan slut? (Mycket korta repliker kan hinna före.)
      if (audio.ended) finish('slut')
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
    setStartFailed(false)
    setPhase(STATES.CONNECTING)
    if (!sessionLoggedRef.current) {
      sessionLoggedRef.current = true
      logSessionInfo('session_started', 'start', `${activeQuestions.length} frågor`)
    }

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
      if (abortedRef.current) return
      addToTranscript('interviewer', greeting)
      setPhase(STATES.WAITING_FOR_USER)
    } catch (err) {
      // Lämnade användaren sidan avbryts hämtningen med flit – inget fel.
      if (abortedRef.current || isAbortError(err)) return
      console.error('TTS-fel:', err)
      logPipelineError('tts', err)
      setStartFailed(true)
      setErrorMsg(copy.startFailed)
    }
  }

  // "Försök igen" efter en misslyckad start. Klicket låser samtidigt upp ljudet.
  function retryStart() {
    unlockAudio()
    setErrorMsg('')
    startInterview()
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
    const trail = trailRef.current
    let stream
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        // Inbäddade webbläsare (länk öppnad inuti en annan app) saknar ofta stöd.
        const unsupported = new Error('Webbläsaren saknar stöd för inspelning')
        unsupported.name = 'NotSupportedError'
        throw unsupported
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (abortedRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream
      // WebM i Chrome/Edge/Firefox, MP4 i Safari och på iPhone – se lib/recording.js.
      const mimeType = pickRecordingMimeType((type) => MediaRecorder.isTypeSupported(type))
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []
      const recordedType = baseMimeType(recorder.mimeType || mimeType)
      recorderMimeRef.current = recorder.mimeType || mimeType || 'webbläsarens val'

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.onerror = (e) => {
        logPipelineError('recorder', e.error ?? new Error('Inspelningen avbröts av webbläsaren'))
      }
      recorder.onstop = async () => {
        // Mikrofonen släpps FÖRST här – se kommentaren i stopRecording().
        streamRef.current?.getTracks().forEach((t) => t.stop())
        // If the interview was aborted/unmounted, don't process a stray answer.
        if (abortedRef.current) return
        const audioBlob = new Blob(audioChunksRef.current, { type: recordedType })
        trail.mark(`inspelning:klar ${audioBlob.size} byte`)
        await processAnswer(audioBlob)
      }
      // WebM delas i småbitar som förut. MP4 spelas in i ETT stycke: Safaris
      // MP4 i bitar blir en fragmenterad fil som transkriberingen kan avvisa.
      if (recordedType === 'audio/webm') recorder.start(100)
      else recorder.start()
      recordingStartRef.current = Date.now()
      trail.mark(`inspelning:start ${recorderMimeRef.current}`)
      setErrorMsg('')
      setPhase(STATES.RECORDING)
    } catch (err) {
      stream?.getTracks().forEach((t) => t.stop())
      if (abortedRef.current) return
      console.error('Kunde inte starta inspelning:', err)
      logPipelineError('mic', err)
      // En förklaring användaren kan agera på – inte webbläsarens råa feltext.
      setErrorMsg(copy[micErrorCopyKey(err)])
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
    setPhase(STATES.PROCESSING)
  }

  async function processAnswer(audioBlob) {
    let step = 'whisper'
    const trail = trailRef.current
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
      const whisperStarted = Date.now()
      trail.mark('transkribering:skickar')
      try {
        whisperRes = await fetch(
          `${VERCEL_WHISPER}?language=${encodeURIComponent(language)}`,
          {
            method: 'POST',
            // Formatet följer inspelningen (WebM eller MP4) – proxyn läser det.
            headers: { 'Content-Type': baseMimeType(audioBlob.type) },
            body: audioBlob,
            signal: whisperAbort.signal,
          }
        )
      } catch (err) {
        if (err.name === 'AbortError') {
          const timeout = new Error(copy.transcriptionTimeout)
          timeout.name = 'TimeoutError'
          throw timeout
        }
        throw err
      } finally {
        clearTimeout(whisperTimer)
      }
      if (!whisperRes.ok) {
        // Tjänstens egen förklaring sparas som felsökningsunderlag; användaren
        // får en begriplig uppmaning i stället för statuskoden.
        const httpError = new Error(`Whisper HTTP ${whisperRes.status}`)
        httpError.httpStatus = whisperRes.status
        httpError.detail = await whisperRes.text().catch(() => '')
        throw httpError
      }
      const { text: userText } = await whisperRes.json()
      trail.mark(`transkribering:klar ${Date.now() - whisperStarted} ms`)
      if (!userText) {
        const noSpeech = new Error('Inget tal detekterat')
        noSpeech.name = 'NoSpeechError'
        throw noSpeech
      }
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
      setPhase(STATES.PREPARING_NEXT)
      await speakText(aiText)
      if (abortedRef.current) return
      addToTranscript('interviewer', aiText)

      if (finishing) {
        setPhase(STATES.FINISHED)
        await saveSession()
      } else {
        setPhase(STATES.WAITING_FOR_USER)
      }
    } catch (error) {
      // Lämnade användaren sidan avbryts hämtningen med flit – inget fel.
      if (abortedRef.current) return
      // If we advanced the question but never got it spoken, roll the index
      // back so the user re-answers the correct (current) question.
      if (advanced) {
        setCurrentQuestionIndex(prevIndex)
        currentQuestionIndexRef.current = prevIndex
      }
      console.error(error)
      logPipelineError(step, error, { audioBytes: audioBlob.size })
      // Det tekniska felet loggas ovan; användaren får veta vad hen kan göra.
      setErrorMsg(
        step === 'tts' ? copy.speechFailed
          : error.name === 'TimeoutError' ? error.message
          : error.name === 'NoSpeechError' ? copy.noSpeech
          : copy.answerFailed
      )
      setPhase(STATES.WAITING_FOR_USER)
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
        logPipelineError('claude', err)
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
        logPipelineError('firestore', err)
        throw err
      }

      // Teknisk driftsignal – inga betyg, bara att en session slutfördes.
      sessionClosedRef.current = true
      logSessionInfo('session_completed', 'complete', `${activeQuestions.length} frågor`)

      navigate(`/feedback/${jobId}/${feedbackRef.id}`)
    } catch (err) {
      console.error('Kunde inte spara sessionen:', err)
      setErrorMsg(err.message ?? 'Kunde inte spara sessionen.')
    }
  }

  function endInterview() {
    logSessionAborted('Avslutade intervjun')
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
      <p className="text-sm py-8" style={{ color: 'var(--color-text-secondary)' }}>
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
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseOver={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
          onMouseOut={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
        >
          {copy.back}
        </button>
        {loadError === copy.cvRequired ? (
          // Ingen krasch – en vägledning. Neutral inforuta, coach-ton.
          <div
            className="rounded-xl border p-5 space-y-3 max-w-xl"
            style={{ backgroundColor: 'var(--color-action-secondary-background-hover)', borderColor: 'var(--color-action-secondary-border)' }}
          >
            <p className="text-sm text-text-primary">{copy.cvRequired}</p>
            <button
              onClick={() => navigate(`/jobb/${jobId}`)}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={{ backgroundColor: 'var(--color-action-secondary-background)', border: '1px solid var(--color-action-secondary-border)', color: 'var(--color-action-secondary-text)' }}
            >
              {copy.backToJob}
            </button>
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--color-feedback-error)' }}>
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
    <div className="space-y-6 sm:space-y-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-medium text-text-primary tracking-tight">
            {copy.title(interviewerName)}
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {(isEnglish(language) && job.jobTitleEn) || job.jobTitle}
            {job.company ? ` · ${job.company}` : ''}
          </p>
        </div>

        {interviewState !== STATES.FINISHED && (
          <div className="shrink-0 pt-1 ml-auto">
            {showConfirmAbort ? (
              <div className="text-right space-y-2">
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {copy.confirmAbort}
                </p>
                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={() => setShowConfirmAbort(false)}
                    className="text-xs px-3 py-2.5 sm:py-1.5 rounded-md transition-colors"
                    style={{ backgroundColor: 'var(--color-background-tertiary)', color: 'var(--color-text-secondary)' }}
                    onMouseOver={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                    onMouseOut={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
                  >
                    {copy.continueInterview}
                  </button>
                  <button
                    onClick={endInterview}
                    className="text-xs px-3 py-2.5 sm:py-1.5 rounded-md font-semibold"
                    style={{ backgroundColor: 'var(--color-feedback-error-background)', color: 'var(--color-feedback-error)' }}
                  >
                    {copy.confirmEnd}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowConfirmAbort(true)}
                className="text-xs font-medium transition-colors py-2.5 sm:py-0 -my-2.5 sm:my-0"
                style={{ color: 'var(--color-feedback-error)' }}
                onMouseOver={(e) => (e.currentTarget.style.color = 'var(--color-action-danger-background-hover)')}
                onMouseOut={(e) => (e.currentTarget.style.color = 'var(--color-feedback-error)')}
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
        {needsTap || startFailed ? null : btnState.showSpinner ? (
          <p
            className="text-lg font-semibold text-text-primary text-center"
            style={{ animation: 'ttsTextPulse 1.4s ease-in-out infinite' }}
          >
            {btnState.subLabel}
          </p>
        ) : (
          <p
            className="text-sm font-medium text-center"
            style={{ color: interviewState === STATES.WAITING_FOR_USER ? 'var(--color-feedback-success)' : 'var(--color-text-secondary)' }}
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
          style={{ backgroundColor: 'var(--color-background-tertiary)', borderColor: 'var(--color-border-default)' }}
        >
          <p className="flex-1 text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="font-semibold text-text-primary">{copy.introLead}</span>
            {copy.introBody}
          </p>
          <button
            onClick={dismissIntroHint}
            aria-label={copy.closeHint}
            className="shrink-0 mt-0.5 text-xs transition-colors"
            style={{ color: 'var(--color-text-secondary)' }}
            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
          >
            ✕
          </button>
        </div>
      )}

      {/* Current question */}
      {showQuestion && (
        <div
          className="rounded-xl border p-5 space-y-2"
          style={{ backgroundColor: 'var(--color-background-primary)', borderColor: 'var(--color-border-default)' }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-accent-purple)' }}
          >
            {copy.questionCounter(currentQuestionIndex + 1, totalQuestions)}
          </p>
          <p className="text-sm leading-relaxed text-text-primary">
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
          style={{ backgroundColor: 'var(--color-background-primary)', borderColor: 'var(--color-border-default)' }}
        >
          <p className="text-sm font-semibold text-text-primary">
            {copy.saveFailed}
          </p>
          <p className="text-sm" style={{ color: 'var(--color-feedback-error)' }}>
            {errorMsg}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={retrySaveSession}
              className="px-4 py-2 rounded-lg text-action-primary-text text-sm font-semibold transition-colors"
              style={{ backgroundColor: 'var(--color-action-primary-background)' }}
            >
              {copy.retry}
            </button>
            <button
              onClick={() => navigate(`/jobb/${jobId}`)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ backgroundColor: 'var(--color-background-tertiary)', color: 'var(--color-text-primary)' }}
            >
              {copy.backToJob}
            </button>
          </div>
        </div>
      )}

      {/* Webbläsaren kräver ett tryck innan rösten får höras (Safari/iPhone) */}
      {needsTap && (
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleTapToStart}
            className="px-8 py-4 rounded-full text-action-primary-text text-base font-semibold select-none transition-colors"
            style={{
              backgroundColor: 'var(--color-feedback-success)',
              minWidth: 'min(260px, 100%)',
              animation: 'waitingPulse 2s ease-in-out infinite',
            }}
          >
            {copy.tapToStart}
          </button>
          <p className="text-sm text-center" style={{ color: 'var(--color-text-secondary)' }}>
            {copy.tapToStartHint}
          </p>
        </div>
      )}

      {/* Starten misslyckades – ge en väg framåt i stället för en evig snurra */}
      {startFailed && !needsTap && (
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={retryStart}
            className="px-8 py-4 rounded-full text-action-primary-text text-base font-semibold select-none transition-colors"
            style={{
              backgroundColor: 'var(--color-action-primary-background)',
              minWidth: 'min(260px, 100%)',
            }}
          >
            {copy.retry}
          </button>
        </div>
      )}

      {/* Action button */}
      {btnState.label && (
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleRecordingToggle}
            disabled={!btnState.enabled}
            aria-label={buttonLabel}
            className="px-8 py-4 rounded-full text-action-primary-text text-base font-semibold select-none transition-colors disabled:opacity-50"
            style={{
              backgroundColor: btnState.recording ? 'var(--color-action-danger-background)' : 'var(--color-feedback-success)',
              minWidth: 'min(260px, 100%)',
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
        <p className="text-sm text-center" style={{ color: 'var(--color-feedback-error)' }}>
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
                backgroundColor: 'var(--color-feedback-success-background)',
                border: '2px solid var(--color-feedback-success)',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-feedback-success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span className="text-sm font-medium text-text-primary">{step}</span>
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
              border: '2px solid var(--color-text-secondary)',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'ttsSpin 0.9s linear infinite',
              flexShrink: 0,
            }}
          />
          <span className="text-sm font-semibold text-text-primary">
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
    [STATES.CONNECTING]:       { color: 'var(--color-border-strong)', pulse: false, spin: true },
    [STATES.AI_SPEAKING]:      { color: 'var(--color-feedback-info)', pulse: 'slow', spin: false },
    [STATES.WAITING_FOR_USER]: { color: 'var(--color-feedback-success)', pulse: false, spin: false },
    [STATES.RECORDING]:        { color: 'var(--color-feedback-error)', pulse: 'fast', spin: false },
    [STATES.PROCESSING]:       { color: 'var(--color-text-secondary)', pulse: false, spin: true },
    [STATES.PREPARING_NEXT]:   { color: 'var(--color-text-secondary)', pulse: false, spin: true },
    [STATES.FINISHED]:         { color: 'var(--color-tag-teal-1)', pulse: false, spin: false },
  }[state] ?? { color: 'var(--color-border-default)', pulse: false, spin: false }

  return (
    <div className="relative" style={{ width: 'clamp(112px, 34vw, 160px)', aspectRatio: '1 / 1' }}>
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
          0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-feedback-success) 50%, transparent); }
          60%      { box-shadow: 0 0 0 14px color-mix(in srgb, var(--color-feedback-success) 0%, transparent); }
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
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-accent-purple)' }}>
          {copy.questionCounter(current, total)}
        </p>
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {pct}%
        </p>
      </div>
      <div className="w-full rounded-full h-1.5" style={{ backgroundColor: 'var(--color-background-tertiary)' }}>
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: 'var(--color-accent-purple)' }}
        />
      </div>
    </div>
  )
}
