import { HashRouter, Routes, Route } from 'react-router-dom'
import AuthGate from './components/AuthGate'
import Layout from './components/Layout'
import Home from './pages/Home'
import CompetencyBank from './pages/CompetencyBank'

export default function App() {
  return (
    <AuthGate>
      <HashRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/kompetensbank" element={<CompetencyBank />} />
          </Routes>
        </Layout>
      </HashRouter>
    </AuthGate>
  )
}
