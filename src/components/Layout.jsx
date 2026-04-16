import { Link, useLocation } from 'react-router-dom'

export default function Layout({ children }) {
  const location = useLocation()

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0f1117' }}>
      {/* Navbar */}
      <header className="border-b border-brand-border">
        <nav className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold text-white"
              style={{ backgroundColor: '#4A6FA5' }}
            >
              I
            </div>
            <span className="text-white font-semibold tracking-tight text-lg">
              Intervjucoach
            </span>
          </Link>

          <div className="flex items-center gap-1">
            <NavLink to="/kompetensbank" active={location.pathname === '/kompetensbank'}>
              Kompetensbank
            </NavLink>
          </div>
        </nav>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-10">
        {children}
      </main>

      <footer className="border-t border-brand-border py-6 text-center text-brand-muted text-sm">
        Intervjucoach &mdash; ditt trygga utrymme för intervjuförberedelse
      </footer>
    </div>
  )
}

function NavLink({ to, active, children }) {
  return (
    <Link
      to={to}
      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
        active
          ? 'text-white'
          : 'text-brand-muted hover:text-white'
      }`}
      style={active ? { backgroundColor: '#1a1d27' } : {}}
    >
      {children}
    </Link>
  )
}
