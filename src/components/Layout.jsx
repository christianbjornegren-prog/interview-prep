import { Link, useLocation } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { useAuth, useUser } from './AuthGate'
import { auth } from '../lib/firebase'

// NavLink uses useLocation which works correctly inside HashRouter

export default function Layout({ children }) {
  const location = useLocation()
  const user = useAuth()
  const { role } = useUser()

  async function handleSignOut() {
    await signOut(auth)
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0f1117' }}>
      {/* Navbar */}
      <header className="border-b" style={{ borderColor: '#2a2d3a' }}>
        <nav className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
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

          {/* Nav links + user info */}
          <div className="flex items-center gap-1">
            {user && (
              <>
                <NavLink to="/" active={location.pathname === '/'}>
                  Mina uppdrag
                </NavLink>
                <NavLink to="/kompetensbank" active={location.pathname === '/kompetensbank'}>
                  Kompetensbank
                </NavLink>
                {(role === 'admin' || role === 'säljare') && (
                  <NavLink
                    to="/konsulter"
                    active={location.pathname.startsWith('/konsulter')}
                  >
                    Konsulter
                  </NavLink>
                )}
                {role === 'admin' && (
                  <NavLink to="/admin" active={location.pathname === '/admin'}>
                    Användarhantering
                  </NavLink>
                )}

                {/* Divider */}
                <span
                  className="mx-2 h-4 w-px"
                  style={{ backgroundColor: '#2a2d3a' }}
                />

                {/* Avatar + name */}
                <div className="flex items-center gap-2">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName ?? ''}
                      className="w-7 h-7 rounded-full"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: '#4A6FA5' }}
                    >
                      {(user.displayName ?? user.email ?? '?')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm hidden sm:block" style={{ color: '#9ca3af' }}>
                    {user.displayName ?? user.email}
                  </span>
                </div>

                {/* Sign-out */}
                <button
                  onClick={handleSignOut}
                  className="ml-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                  style={{ color: '#6b7280' }}
                  onMouseOver={(e) => (e.currentTarget.style.color = '#f87171')}
                  onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
                  title="Logga ut"
                >
                  Logga ut
                </button>
              </>
            )}
          </div>
        </nav>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-10">
        {children}
      </main>

      <footer
        className="border-t py-6 text-center text-sm"
        style={{ borderColor: '#2a2d3a', color: '#6b7280' }}
      >
        Intervjucoach &mdash; ditt trygga utrymme för intervjuförberedelse
      </footer>
    </div>
  )
}

function NavLink({ to, active, children }) {
  return (
    <Link
      to={to}
      className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
      style={{
        color: active ? '#fff' : '#6b7280',
        backgroundColor: active ? '#1a1d27' : 'transparent',
      }}
      onMouseOver={(e) => !active && (e.currentTarget.style.color = '#fff')}
      onMouseOut={(e) => !active && (e.currentTarget.style.color = '#6b7280')}
    >
      {children}
    </Link>
  )
}
