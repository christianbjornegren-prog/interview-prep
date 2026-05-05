import { createContext, useContext, useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import {
  auth, db, doc, collection,
  getDoc, getDocs, setDoc, addDoc, deleteDoc,
  serverTimestamp,
} from '../lib/firebase'

// ── IAM config ────────────────────────────────────────────────────────────

const ALLOWED_DOMAIN = 'boulder.se'
const ADMIN_WHITELIST = ['christian.bjornegren@gmail.com']
const SÄLJARE_WHITELIST = ['filip.almstrom@boulder.se', 'johanna@boulder.se']

function isAllowed(email) {
  if (ADMIN_WHITELIST.includes(email)) return true
  if (email.endsWith('@' + ALLOWED_DOMAIN)) return true
  return false
}

// ── Auth context ──────────────────────────────────────────────────────────

const AuthContext = createContext(null)
const UserContext = createContext({ user: null, role: null, profileActivated: false, clearProfileActivated: () => {} })

/** Returns the currently signed-in Firebase User object, or null. */
export function useAuth() {
  return useContext(AuthContext)
}

/** Returns { user, role } where role is the Firestore role string. */
export function useUser() {
  return useContext(UserContext)
}

export { auth }

/**
 * Signs in with Google popup, then checks domain/whitelist.
 * Throws with message 'ACCESS_DENIED' if the email is not allowed.
 */
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider()
  const result = await signInWithPopup(auth, provider)
  if (!isAllowed(result.user.email)) {
    await signOut(auth)
    throw new Error('ACCESS_DENIED')
  }
}

// ── AuthGate ──────────────────────────────────────────────────────────────

/**
 * Auth context provider. isInitializing stays true until the first
 * onAuthStateChanged event resolves (prevents flash on page refresh).
 * Domain check lives in signInWithGoogle – never here.
 */
export default function AuthGate({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [profileActivated, setProfileActivated] = useState(false)

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null)
        setRole(null)
        setIsInitializing(false)
        return
      }

      // Fetch or create user profile; default to 'konsult' on any error
      try {
        const userRef = doc(db, 'users', u.uid)
        const snap = await getDoc(userRef)
        let userRole
        if (!snap.exists()) {
          userRole = ADMIN_WHITELIST.includes(u.email) ? 'admin'
                   : SÄLJARE_WHITELIST.includes(u.email) ? 'säljare'
                   : 'konsult'

          // Copy any pending profile prepared by a säljare
          try {
            const pendingRef = doc(db, 'pendingProfiles', u.email)
            const pendingSnap = await getDoc(pendingRef)
            if (pendingSnap.exists()) {
              const pending = pendingSnap.data()
              const compCol = collection(db, 'users', u.uid, 'competencies')
              const jobCol  = collection(db, 'users', u.uid, 'jobs')
              for (const { createdAt: _ct, ...comp } of (pending.competencies ?? [])) {
                await addDoc(compCol, { ...comp, createdAt: serverTimestamp() })
              }
              for (const { createdAt: _ct, id: _id, ...job } of (pending.jobs ?? [])) {
                await addDoc(jobCol, { ...job, createdAt: serverTimestamp() })
              }
              await deleteDoc(pendingRef)
              setProfileActivated(true)
            }
          } catch (err) {
            console.warn('Kunde inte kopiera pending-profil:', err)
          }

          await setDoc(userRef, {
            email: u.email,
            name: u.displayName,
            role: userRole,
            createdAt: serverTimestamp(),
          })
        } else {
          userRole = snap.data().role ?? 'konsult'
        }
        setRole(userRole)
      } catch (err) {
        console.error('Kunde inte hämta användarroll:', err)
        setRole('konsult')
      }

      setUser(u)
      setIsInitializing(false)
    })
  }, [])

  if (isInitializing) return <CheckingScreen />

  return (
    <AuthContext.Provider value={user}>
      <UserContext.Provider value={{ user, role, profileActivated, clearProfileActivated: () => setProfileActivated(false) }}>
        {children}
      </UserContext.Provider>
    </AuthContext.Provider>
  )
}

// ── RequireAuth ───────────────────────────────────────────────────────────

/** Renders children for authenticated users, sign-in screen otherwise. */
export function RequireAuth({ children }) {
  const user = useAuth()
  if (!user) return <SignInScreen />
  return children
}

// ── Sign-in screen ────────────────────────────────────────────────────────

export function SignInScreen() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSignIn() {
    setLoading(true)
    setError('')
    try {
      await signInWithGoogle()
    } catch (err) {
      if (err.message === 'ACCESS_DENIED') {
        setError(
          'Åtkomst nekad. Endast Boulder-konton (@boulder.se) är tillåtna att logga in.'
        )
      } else {
        console.error(err)
        setError('Inloggning misslyckades. Försök igen.')
      }
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-8 px-6"
      style={{ backgroundColor: '#0f1117' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold text-white"
          style={{ backgroundColor: '#4A6FA5' }}
        >
          I
        </div>
        <span className="text-white text-2xl font-bold tracking-tight">
          Intervjucoach
        </span>
      </div>

      <div
        className="w-full max-w-sm rounded-2xl border p-8 flex flex-col items-center gap-6"
        style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
      >
        <div className="text-center space-y-2">
          <h1 className="text-white text-xl font-semibold">Välkommen</h1>
          <p className="text-sm" style={{ color: '#6b7280' }}>
            Logga in för att komma igång
          </p>
        </div>

        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold border transition-colors disabled:opacity-60"
          style={{
            backgroundColor: '#fff',
            color: '#111',
            borderColor: '#e5e7eb',
          }}
          onMouseOver={(e) => !loading && (e.currentTarget.style.backgroundColor = '#f3f4f6')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#fff')}
        >
          <GoogleIcon />
          {loading ? 'Loggar in...' : 'Logga in med Google'}
        </button>

        {error && (
          <p className="text-xs text-center leading-relaxed" style={{ color: '#f87171' }}>
            {error}
          </p>
        )}
      </div>

      <p className="text-xs" style={{ color: '#4b5563' }}>
        Ditt trygga utrymme för intervjuförberedelse
      </p>
    </div>
  )
}

// ── Screens ───────────────────────────────────────────────────────────────

function CheckingScreen() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: '#0f1117' }}
    >
      <div className="flex items-center gap-3" style={{ color: '#6b7280' }}>
        <MiniSpinner />
        <span className="text-sm">Kontrollerar inloggning...</span>
      </div>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  )
}

function MiniSpinner() {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  )
}
