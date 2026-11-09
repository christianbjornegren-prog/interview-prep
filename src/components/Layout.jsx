import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { useAuth, useUser } from './AuthGate'
import { auth } from '../lib/firebase'
import logo from '../assets/logo.svg'

// NavLink uses useLocation which works correctly inside HashRouter

// Boulder designsystem: "arbetsyta med flera sidor" → mörk sidomeny (240 px,
// data-theme="dark" oavsett appens tema) + ljus arbetsyta. Under desktop-
// brytpunkten ersätts sidomenyn av en app bar (56 px) med utfällbar meny.
// Menyvalen, deras villkor och utloggningen är oförändrade.
export default function Layout({ children }) {
  const location = useLocation()
  const user = useAuth()
  const { role } = useUser()
  const [menuOpen, setMenuOpen] = useState(false)

  // Stäng mobilmenyn när man navigerar
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  async function handleSignOut() {
    await signOut(auth)
  }

  const brand = (
    <Link to="/" className="flex items-center gap-md">
      <img src={logo} alt="Boulder" style={{ height: 28 }} />
      <span className="text-label-m text-text-primary">Intervjucoach</span>
    </Link>
  )

  // Utloggad: enkel tool header, inget menyinnehåll. Startsidan för utloggade
  // är mörk (data-theme="dark" på hela ytan) – inloggat läge är ljust.
  if (!user) {
    return (
      <div data-theme="dark" className="min-h-screen flex flex-col bg-background-secondary">
        <header
          data-theme="dark"
          className="h-14 flex items-center px-page bg-background-secondary border-b border-border-default"
        >
          {brand}
        </header>
        <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-10">{children}</main>
        <Footer />
      </div>
    )
  }

  const nav = (
    <nav aria-label="Huvudmeny" className="flex flex-col gap-3xs">
      <NavLink to="/" active={location.pathname === '/'} nowrap>
        Mina uppdrag
      </NavLink>
      <NavLink to="/kompetensbank" active={location.pathname === '/kompetensbank'}>
        Mina CV
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
      <NavLink to="/installningar" active={location.pathname === '/installningar'}>
        Inställningar
      </NavLink>
    </nav>
  )

  const account = (
    <div className="flex items-center justify-between gap-sm">
      {/* Avatar + name */}
      <div className="flex items-center gap-sm min-w-0">
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName ?? ''}
            className="w-7 h-7 rounded-full shrink-0"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-medium bg-tag-neutral-background text-tag-neutral-text">
            {(user.displayName ?? user.email ?? '?')[0].toUpperCase()}
          </div>
        )}
        <span className="text-body-s text-text-secondary truncate">
          {user.displayName ?? user.email}
        </span>
      </div>

      {/* Sign-out – nås utan att öppna en meny */}
      <button
        onClick={handleSignOut}
        className="shrink-0 px-sm py-xs rounded-md text-label-s text-text-secondary hover:text-text-primary hover:bg-action-ghost-background-hover transition-colors"
        title="Logga ut"
      >
        Logga ut
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-background-secondary">
      {/* Sidomeny – desktop */}
      <aside
        data-theme="dark"
        className="hidden desktop:flex fixed inset-y-0 left-0 z-40 w-60 flex-col bg-background-secondary border-r border-border-default"
      >
        <div className="px-xl pt-2xl pb-3xl">{brand}</div>
        <div className="flex-1 overflow-y-auto px-md">{nav}</div>
        <div className="px-xl py-lg border-t border-border-default">{account}</div>
      </aside>

      {/* App bar + utfällbar meny – mobil/tablet */}
      <div data-theme="dark" className="desktop:hidden sticky top-0 z-40">
        <header className="h-14 flex items-center justify-between px-lg bg-background-secondary border-b border-border-default">
          {brand}
          <button
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Stäng meny' : 'Öppna meny'}
            aria-expanded={menuOpen}
            className="w-11 h-11 flex items-center justify-center rounded-md text-icon-primary hover:bg-action-ghost-background-hover"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {menuOpen ? (
                <path d="M18 6 6 18M6 6l12 12" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </header>
        {menuOpen && (
          <div className="bg-background-secondary border-b border-border-default px-md py-lg space-y-lg">
            {nav}
            <div className="px-md pt-lg border-t border-border-default">{account}</div>
          </div>
        )}
      </div>

      {/* Arbetsyta */}
      <div className="desktop:pl-60 min-h-screen flex flex-col">
        <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-10">
          {children}
        </main>
        <Footer />
      </div>
    </div>
  )
}

function Footer() {
  return (
    <footer className="border-t border-border-default py-6 text-center text-body-s text-text-secondary">
      Intervjucoach &mdash; ditt trygga utrymme för intervjuförberedelse
    </footer>
  )
}

function NavLink({ to, active, nowrap, children }) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center h-10 px-md rounded-lg text-label-m transition-colors${nowrap ? ' whitespace-nowrap' : ''} ${
        active
          ? 'bg-action-secondary-background-pressed text-link-text'
          : 'text-text-secondary hover:text-text-primary hover:bg-action-ghost-background-hover'
      }`}
    >
      {children}
    </Link>
  )
}
