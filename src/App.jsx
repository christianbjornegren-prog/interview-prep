import { HashRouter, Routes, Route } from 'react-router-dom'
import AuthGate from './components/AuthGate'
import Layout from './components/Layout'
import Home from './pages/Home'
import CompetencyBank from './pages/CompetencyBank'
import JobPage from './pages/JobPage'
import InterviewSimulator from './pages/InterviewSimulator'
import InterviewSimulatorTTS from './pages/InterviewSimulatorTTS'

export default function App() {
  return (
    <AuthGate>
      <HashRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/kompetensbank" element={<CompetencyBank />} />
            <Route path="/jobb" element={<JobPage />} />
            <Route path="/intervju/:jobId" element={<InterviewSimulator />} />
            <Route path="/intervju-tts/:jobId" element={<InterviewSimulatorTTS />} />
          </Routes>
        </Layout>
      </HashRouter>
    </AuthGate>
  )
}
