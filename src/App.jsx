import { HashRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import CompetencyBank from './pages/CompetencyBank'

// HashRouter is used instead of BrowserRouter so that GitHub Pages
// (which serves all paths from the same index.html) handles deep links
// correctly without a custom 404 redirect.
export default function App() {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/kompetensbank" element={<CompetencyBank />} />
        </Routes>
      </Layout>
    </HashRouter>
  )
}
