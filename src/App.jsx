import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import AuthGate, { RequireAuth, useUser } from './components/AuthGate'
import Layout from './components/Layout'
import Home from './pages/Home'
import CompetencyBank from './pages/CompetencyBank'
import JobCreate from './pages/JobCreate'
import JobPage from './pages/JobPage'
import InterviewSimulatorTTS from './pages/InterviewSimulatorTTS'
import FeedbackPage from './pages/FeedbackPage'
import AdminPage from './pages/AdminPage'
import DriftPage from './pages/DriftPage'
import SäljarePage from './pages/SäljarePage'
import KonsultProfilPage from './pages/KonsultProfilPage'
import PendingProfilPage from './pages/PendingProfilPage'
import OmPage from './pages/OmPage'
import Settings from './pages/Settings'

function RequireAdmin({ children }) {
  const { role } = useUser()
  if (role !== 'admin') return <Navigate to="/" replace />
  return children
}

function RequireSäljarOrAdmin({ children }) {
  const { role } = useUser()
  if (role !== 'admin' && role !== 'saljare') return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <AuthGate>
      <HashRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/om" element={<RequireAuth><OmPage /></RequireAuth>} />
            <Route
              path="/installningar"
              element={<RequireAuth><Settings /></RequireAuth>}
            />
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
            {/* Legacy WebRTC route kept working by pointing at the active
                TTS flow (the old flow saved to the wrong path and navigated
                to a broken URL). Nothing links here; only old bookmarks. */}
            <Route
              path="/intervju/:jobId"
              element={<RequireAuth><InterviewSimulatorTTS /></RequireAuth>}
            />
            <Route
              path="/intervju-tts/:jobId"
              element={<RequireAuth><InterviewSimulatorTTS /></RequireAuth>}
            />
            <Route
              path="/feedback/:jobId/:feedbackId"
              element={<RequireAuth><FeedbackPage /></RequireAuth>}
            />
            <Route
              path="/admin"
              element={<RequireAuth><RequireAdmin><AdminPage /></RequireAdmin></RequireAuth>}
            />
            <Route
              path="/admin/drift"
              element={<RequireAuth><RequireAdmin><DriftPage /></RequireAdmin></RequireAuth>}
            />
            <Route
              path="/konsulter"
              element={<RequireAuth><RequireSäljarOrAdmin><SäljarePage /></RequireSäljarOrAdmin></RequireAuth>}
            />
            <Route
              path="/konsulter/pending/:email"
              element={<RequireAuth><RequireSäljarOrAdmin><PendingProfilPage /></RequireSäljarOrAdmin></RequireAuth>}
            />
            <Route
              path="/konsulter/:uid"
              element={<RequireAuth><RequireSäljarOrAdmin><KonsultProfilPage /></RequireSäljarOrAdmin></RequireAuth>}
            />
          </Routes>
        </Layout>
      </HashRouter>
    </AuthGate>
  )
}
