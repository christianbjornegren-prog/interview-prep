import { Link, useLocation } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { useAuth, useUser } from './AuthGate'
import { auth } from '../lib/firebase'
import logo from '../assets/logo.svg'

// NavLink uses useLocation which works correctly inside HashRouter

export default function Layout({ children }) {
  const location = useLocation()
  const user = useAuth()
  const { role } = useUser()

  async function handleSignOut() {
    await signOut(auth)
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#000000' }}>
      {/* Navbar */}
      <header className="border-b" style={{ borderColor: '#404040' }}>
        <nav className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <Link to="/">
            <img src={logo} alt="Boulder" style={{ height: 28 }} />
          </Link>

          {/* Nav links + user info */}
          <div className="flex items-center gap-1">
            {user && (
              <>
                <NavLink to="/" active={location.pathname === '/'} nowrap>
                  Mina uppdrag
                </NavLink>
                <NavLink to="/kompetensbank" active={location.pathname === '/kompetensbank'}>
                  Kompetensbank
                </NavLink>
                {(role === 'admin' || role === 'saljare') && (
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
                {role === 'admin' && (
                  <NavLink to="/admin/drift" active={location.pathname === '/admin/drift'}>
                    Driftöversikt
                  </NavLink>
                )}
                <NavLink to="/om" active={location.pathname === '/om'}>
                  Om
                </NavLink>

                {/* Divider */}
                <span
                  className="mx-2 h-4 w-px"
                  style={{ backgroundColor: '#404040' }}
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
                      style={{ backgroundColor: '#8064ad' }}
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
        style={{ borderColor: '#404040', color: '#6b7280' }}
      >
        Intervjucoach &mdash; ditt trygga utrymme för intervjuförberedelse
      </footer>
    </div>
  )
}

function NavLink({ to, active, nowrap, children }) {
  return (
    <Link
      to={to}
      className={`px-4 py-2 text-sm font-medium transition-colors${nowrap ? ' whitespace-nowrap' : ''}`}
      style={{ color: active ? '#fff' : '#6b7280' }}
      onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
      onMouseOut={(e) => (e.currentTarget.style.color = active ? '#fff' : '#6b7280')}
    >
      {children}
    </Link>
  )
}
