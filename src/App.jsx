import { HashRouter, Routes, Route } from 'react-router-dom'
import AuthGate, { RequireAuth } from './components/AuthGate'
import Layout from './components/Layout'
import DebugPanel from './components/DebugPanel'
import Home from './pages/Home'
import CompetencyBank from './pages/CompetencyBank'
import JobCreate from './pages/JobCreate'
import JobPage from './pages/JobPage'
import InterviewSimulator from './pages/InterviewSimulator'
import InterviewSimulatorTTS from './pages/InterviewSimulatorTTS'
import FeedbackPage from './pages/FeedbackPage'

export default function App() {
  return (
    <AuthGate>
      <HashRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route
              path="/kompetensbank"
              element={<RequireAuth><CompetencyBank /></RequireAuth>}
            />
            <Route
              path="/jobb/ny"
              element={<RequireAuth><JobCreate /></RequireAuth>}
            />
            <Route
              path="/jobb/:jobId"
              element={<RequireAuth><JobPage /></RequireAuth>}
            />
            <Route
              path="/intervju/:jobId"
              element={<RequireAuth><InterviewSimulator /></RequireAuth>}
            />
            <Route
              path="/intervju-tts/:jobId"
              element={<RequireAuth><InterviewSimulatorTTS /></RequireAuth>}
            />
            <Route
              path="/feedback/:jobId/:feedbackId"
              element={<RequireAuth><FeedbackPage /></RequireAuth>}
            />
          </Routes>
        </Layout>
        <DebugPanel />
      </HashRouter>
    </AuthGate>
  )
}
