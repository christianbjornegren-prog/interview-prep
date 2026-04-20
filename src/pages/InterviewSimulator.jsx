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
import DebugPanel from '../components/DebugPanel'

const TOKEN_ENDPOINT =
  'https://interview-prep-liard-three.vercel.app/api/getRealtimeToken'

const REALTIME_MODEL = 'gpt-4o-realtime-preview-2024-12-17'

const FALLBACK_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

const INTERVIEWER_NAMES = [
  'Anna Lindström',
  'Erik Bergström',
  'Maria Karlsson',
  'Johan Svensson',
]

function pickInterviewer() {
  return INTERVIEWER_NAMES[Math.floor(Math.random() * INTERVIEWER_NAMES.length)]
}

export default function InterviewSimulator() {
  const { jobId } = useParams()
  const navigate = useNavigate()

  const [job, setJob] = useState(null)
  const [loadingJob, setLoadingJob] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [phase, setPhase] = useState('prep') // prep | connecting | active | ending
  const [startError, setStartError] = useState('')

  const interviewerName = useMemo(() => pickInterviewer(), [])
  const [speaker, setSpeaker] = useState('silent') // ai | user | silent
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0)
  const [transcript, setTranscript] = useState([]) // { role, text }
  const [logs, setLogs] = useState([])

  const addLog = (msg) =>
    setLogs((prev) => [...prev, `${new Date().toLocaleTimeString()} ${msg}`])

  // WebRTC refs
  const pcRef = useRef(null)
  const dcRef = useRef(null)
  const localStreamRef = useRef(null)
  const audioRef = useRef(null)
  const aiDeltaRef = useRef('')

  // ── Load job ─────────────────────────────────────────────────────────────
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

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      teardownConnection()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function teardownConnection() {
    try {
      dcRef.current?.close()
    } catch {}
    try {
      pcRef.current?.close()
    } catch {}
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    dcRef.current = null
    pcRef.current = null
    localStreamRef.current = null
  }

  // ── Start the interview ──────────────────────────────────────────────────
  async function startInterview() {
    setStartError('')
    setPhase('connecting')
    try {
      const jobTitle = job?.jobTitle || 'rollen'
      const company = job?.company || 'företaget'
      const questions = job?.questions ?? []

      addLog('✓ Startar intervju...')

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      addLog('✓ Mikrofon hämtad')
      localStreamRef.current = stream

      const pc = new RTCPeerConnection()
      pcRef.current = pc

      pc.ontrack = (e) => {
        audioRef.current.srcObject = e.streams[0]
        audioRef.current.play()
        addLog('✓ Remote audio kopplad')
      }

      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      addLog('✓ Track tillagd')

      const dc = pc.createDataChannel('oai-events')
      addLog('✓ DataChannel skapad')
      dcRef.current = dc

      dc.onopen = () => {
        addLog('✓ DataChannel ÖPPEN')
        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            type: 'realtime',
            instructions: `Du är ${interviewerName}, en erfaren rekryterare
            som genomför en jobbintervju på svenska för rollen ${jobTitle} på ${company}.
            Börja med att hälsa och presentera dig kort på svenska.
            Ställ sedan frågorna i ordning, en i taget.
            Vänta på svar. Bekräfta kort och gå vidare.
            Frågorna:
            ${questions.map((q, i) => `${i + 1}. ${q.question}`).join('\n')}`,
            voice: 'shimmer',
            turn_detection: { type: 'server_vad' },
            modalities: ['audio', 'text'],
          },
        }))
        setTimeout(() => {
          dc.send(JSON.stringify({
            type: 'response.create',
            response: {
              modalities: ['audio', 'text'],
              instructions: 'Hälsa och presentera dig nu på svenska.',
            },
          }))
          addLog('✓ response.create skickat')
        }, 500)
      }

      dc.onmessage = (e) => {
        addLog('MSG: ' + e.data.slice(0, 100))
        onDataChannelMessage(e)
      }
      dc.onerror = (e) => addLog('FEL DC: ' + e.message)
      dc.onclose = () => addLog('DC stängd')

      pc.onicecandidate = (e) =>
        addLog('ICE: ' + (e.candidate ? e.candidate.type : 'done'))
      pc.oniceconnectionstatechange = () =>
        addLog('ICE state: ' + pc.iceConnectionState)
      pc.onconnectionstatechange = () =>
        addLog('Connection: ' + pc.connectionState)

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      addLog('✓ Local description satt – skickar SDP till proxy...')

      const instructions = `Du är ${interviewerName} på ${company}.`
      const sdpRes = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
          'x-instructions': instructions,
        },
        body: pc.localDescription.sdp,
      })

      const answerSdp = await sdpRes.text()
      addLog('✓ SDP answer mottagen, längd: ' + answerSdp.length)
      addLog('Kandidater i svar: ' + (answerSdp.match(/a=candidate/g)?.length || 0))

      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })
      addLog('✓ Remote description satt – väntar på anslutning...')

      setPhase('active')
    } catch (err) {
      console.error('Kunde inte starta intervjun:', err)
      addLog('FEL: ' + (err.message ?? 'okänt fel'))
      setStartError(err.message ?? 'Något gick fel vid start.')
      teardownConnection()
      setPhase('prep')
    }
  }

  function buildInstructions() {
    const questions = job?.questions ?? []
    const questionLines = questions
      .map((q, i) => `${i + 1}. ${q.question}`)
      .join('\n')

    return [
      `Du är ${interviewerName}, en erfaren och vänlig intervjuare från ${job?.company || 'företaget'}.`,
      `Du genomför en jobbintervju för rollen "${job?.jobTitle || 'rollen'}" på svenska.`,
      '',
      'Regler:',
      '- Tala alltid svenska.',
      '- Presentera dig själv kort i början och berätta hur intervjun kommer gå till.',
      '- Ställ frågorna nedan en i taget, i ordningen de står.',
      '- Lyssna på kandidatens svar och ställ korta följdfrågor om något är oklart.',
      '- Gå vidare till nästa fråga när du fått ett rimligt svar.',
      '- Var trevlig, professionell och håll tempot naturligt.',
      '- Avsluta vänligt när alla frågor är besvarade.',
      '',
      'Frågor att gå igenom i ordning:',
      questionLines,
    ].join('\n')
  }

  function onDataChannelMessage(evt) {
    let msg
    try {
      msg = JSON.parse(evt.data)
    } catch {
      return
    }

    switch (msg.type) {
      case 'input_audio_buffer.speech_started':
        setSpeaker('user')
        break
      case 'input_audio_buffer.speech_stopped':
        setSpeaker('silent')
        break
      case 'response.audio.delta':
      case 'response.output_audio.delta':
        setSpeaker('ai')
        break
      case 'response.audio_transcript.delta':
      case 'response.output_audio_transcript.delta':
        if (typeof msg.delta === 'string') aiDeltaRef.current += msg.delta
        break
      case 'response.audio_transcript.done':
      case 'response.output_audio_transcript.done': {
        const text = msg.transcript ?? aiDeltaRef.current
        aiDeltaRef.current = ''
        if (text?.trim()) {
          setTranscript((prev) => [...prev, { role: 'assistant', text: text.trim() }])
          setCurrentQuestionIdx((idx) => {
            const total = job?.questions?.length ?? 0
            return Math.min(idx + 1, Math.max(total - 1, 0))
          })
        }
        break
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const text = msg.transcript
        if (text?.trim()) {
          setTranscript((prev) => [...prev, { role: 'user', text: text.trim() }])
        }
        break
      }
      case 'response.done':
        setSpeaker('silent')
        break
      case 'error':
        addLog('FEL från OpenAI: ' + (msg.error?.message ?? JSON.stringify(msg.error)))
        break
      default:
        break
    }
  }

  // ── End the interview ────────────────────────────────────────────────────
  async function endInterview() {
    if (phase === 'ending') return
    setPhase('ending')
    try {
      const uid = auth.currentUser.uid
      const docRef = await addDoc(
        collection(db, 'users', uid, 'sessions'),
        {
          jobId,
          jobTitle: job?.jobTitle ?? '',
          company: job?.company ?? '',
          interviewer: interviewerName,
          questions: job?.questions ?? [],
          transcript,
          createdAt: serverTimestamp(),
        }
      )
      teardownConnection()
      navigate(`/feedback/${docRef.id}`)
    } catch (err) {
      console.error('Kunde inte spara sessionen:', err)
      teardownConnection()
      setStartError(err.message ?? 'Kunde inte spara sessionen.')
      setPhase('active')
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const debugPanel = <DebugPanel logs={logs} onClear={() => setLogs([])} />

  if (loadingJob) {
    return (
      <>
        <p className="text-sm py-8" style={{ color: '#6b7280' }}>
          Laddar jobbannons...
        </p>
        {debugPanel}
      </>
    )
  }

  if (loadError || !job) {
    return (
      <>
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
        {debugPanel}
      </>
    )
  }

  const questions = job.questions ?? []
  const currentQuestion = questions[Math.min(currentQuestionIdx, questions.length - 1)]

  if (phase === 'active' || phase === 'ending' || phase === 'connecting') {
    return (
      <>
        <div className="space-y-10">
          <audio ref={audioRef} autoPlay />
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
            <SpeakerCircle speaker={speaker} connecting={phase === 'connecting'} />
            <p className="text-xs uppercase tracking-widest" style={{ color: '#6b7280' }}>
              {phase === 'connecting'
                ? 'Ansluter...'
                : speaker === 'ai'
                ? `${interviewerName} pratar`
                : speaker === 'user'
                ? 'Du pratar'
                : 'Tyst'}
            </p>
          </div>

          {questions.length > 0 && currentQuestion && (
            <div
              className="rounded-xl border p-5 space-y-2"
              style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
            >
              <p
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: '#4A6FA5' }}
              >
                Fråga {Math.min(currentQuestionIdx + 1, questions.length)} av {questions.length}
              </p>
              <p className="text-sm leading-relaxed text-white">
                {currentQuestion.question}
              </p>
            </div>
          )}

          <div className="flex justify-center">
            <button
              onClick={endInterview}
              disabled={phase === 'ending'}
              className="px-6 py-3 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-60"
              style={{ backgroundColor: '#c0392b' }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#e04a3a')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#c0392b')}
            >
              {phase === 'ending' ? 'Sparar...' : 'Avsluta intervju'}
            </button>
          </div>

          {startError && (
            <p className="text-sm text-center" style={{ color: '#f87171' }}>
              {startError}
            </p>
          )}
        </div>
        {debugPanel}
      </>
    )
  }

  // phase === 'prep'
  return (
    <>
      <div className="space-y-8">
        <div>
          <button
            onClick={() => navigate('/jobb')}
            className="text-sm transition-colors"
            style={{ color: '#6b7280' }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
          >
            ← Tillbaka
          </button>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Intervjusimulering
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#9ca3af' }}>
            Träna på att svara på frågorna i en realistisk röstintervju.
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
            value={`${questions.length} ${questions.length === 1 ? 'fråga' : 'frågor'}`}
          />
        </div>

        <button
          onClick={startInterview}
          disabled={questions.length === 0}
          className="w-full py-3 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ backgroundColor: '#4A6FA5' }}
          onMouseOver={(e) => {
            if (questions.length > 0) e.currentTarget.style.backgroundColor = '#5a82bc'
          }}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#4A6FA5')}
        >
          Starta intervju
        </button>

        {startError && (
          <p className="text-sm" style={{ color: '#f87171' }}>
            {startError}
          </p>
        )}
      </div>
      {debugPanel}
    </>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span
        className="text-xs uppercase tracking-widest font-semibold"
        style={{ color: '#4A6FA5' }}
      >
        {label}
      </span>
      <span className="text-sm text-white text-right">{value}</span>
    </div>
  )
}

function SpeakerCircle({ speaker, connecting }) {
  const color =
    connecting ? '#6b7280' :
    speaker === 'ai' ? '#4A6FA5' :
    speaker === 'user' ? '#2A9D8F' :
    '#3a3d48'

  const pulse = !connecting && (speaker === 'ai' || speaker === 'user')

  return (
    <div className="relative" style={{ width: 160, height: 160 }}>
      {pulse && (
        <span
          className="absolute inset-0 rounded-full"
          style={{
            backgroundColor: color,
            opacity: 0.35,
            animation: 'interviewPulse 1.6s ease-out infinite',
          }}
        />
      )}
      <span
        className="absolute inset-0 rounded-full transition-colors"
        style={{ backgroundColor: color, opacity: 0.9 }}
      />
      <style>{`
        @keyframes interviewPulse {
          0% { transform: scale(1); opacity: 0.35; }
          100% { transform: scale(1.45); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
