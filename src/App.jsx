import { HashRouter, Routes, Route } from 'react-router-dom'
import AuthGate from './components/AuthGate'
import Layout from './components/Layout'
import Home from './pages/Home'
import CompetencyBank from './pages/CompetencyBank'
import JobPage from './pages/JobPage'

export default function App() {
  return (
    <AuthGate>
      <HashRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/kompetensbank" element={<CompetencyBank />} />
            <Route path="/jobb" element={<JobPage />} />
          </Routes>
        </Layout>
      </HashRouter>
    </AuthGate>
  )
}
