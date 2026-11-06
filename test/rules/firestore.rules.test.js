import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, query, where,
} from 'firebase/firestore'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rules = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8')

const [host, portStr] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')

let testEnv

// Identities (the uid must own a users/{uid} doc whose role the rules read).
const KONSULT = 'konsult1'
const SALJARE = 'saljare1'
const ADMIN = 'admin1'

function fb(db, fbId) {
  return doc(db, 'users', KONSULT, 'jobs', 'job1', 'feedback', fbId)
}
function fbCollection(db) {
  return collection(db, 'users', KONSULT, 'jobs', 'job1', 'feedback')
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-intervjucoach',
    firestore: { rules, host, port: Number(portStr) },
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users', KONSULT), { role: 'konsult', email: 'k@boulder.se' })
    await setDoc(doc(db, 'users', SALJARE), { role: 'saljare', email: 's@boulder.se' })
    await setDoc(doc(db, 'users', ADMIN), { role: 'admin', email: 'a@boulder.se' })

    await setDoc(fb(db, 'fbShared'), {
      overallScore: 8, sharedWithSeller: true, sharedAt: new Date(), jobTitle: 'Roll',
    })
    await setDoc(fb(db, 'fbPrivate'), {
      overallScore: 7, sharedWithSeller: false, sharedAt: null, jobTitle: 'Roll',
    })

    await setDoc(doc(db, 'systemEvents', 'ev1'), {
      type: 'session_completed', severity: 'info', step: 'complete',
      message: '5 frågor', uid: KONSULT, createdAt: new Date(),
    })

    // Pending profiles keyed by email (as SäljarePage stores them, lowercased)
    await setDoc(doc(db, 'pendingProfiles', 'k@boulder.se'), {
      name: 'K', email: 'k@boulder.se', competencies: [], jobs: [],
    })
    await setDoc(doc(db, 'pendingProfiles', 'other@boulder.se'), {
      name: 'Other', email: 'other@boulder.se', competencies: [], jobs: [],
    })
  })
})

function ctxFor(uid) {
  return testEnv.authenticatedContext(uid).firestore()
}

// Authenticated context that also carries an email token claim, matching how
// Firebase Auth populates request.auth.token.email for Google sign-in.
function ctxForEmail(uid, email) {
  return testEnv.authenticatedContext(uid, { email }).firestore()
}

describe('feedback consent gating', () => {
  it('konsult can read its OWN shared feedback', async () => {
    await assertSucceeds(getDoc(fb(ctxFor(KONSULT), 'fbShared')))
  })

  it('konsult can read its OWN unshared feedback', async () => {
    await assertSucceeds(getDoc(fb(ctxFor(KONSULT), 'fbPrivate')))
  })

  it('säljare CANNOT read unshared feedback', async () => {
    await assertFails(getDoc(fb(ctxFor(SALJARE), 'fbPrivate')))
  })

  it('säljare CAN read shared feedback', async () => {
    await assertSucceeds(getDoc(fb(ctxFor(SALJARE), 'fbShared')))
  })

  it('admin CANNOT read unshared feedback', async () => {
    await assertFails(getDoc(fb(ctxFor(ADMIN), 'fbPrivate')))
  })

  it('admin CAN read shared feedback', async () => {
    await assertSucceeds(getDoc(fb(ctxFor(ADMIN), 'fbShared')))
  })
})

describe('feedback list queries (per-job)', () => {
  it('säljare CAN list feedback when filtering sharedWithSeller==true', async () => {
    const q = query(fbCollection(ctxFor(SALJARE)), where('sharedWithSeller', '==', true))
    await assertSucceeds(getDocs(q))
  })

  it('säljare CANNOT list feedback unfiltered', async () => {
    await assertFails(getDocs(fbCollection(ctxFor(SALJARE))))
  })
})

describe('feedback writes', () => {
  it('konsult can toggle sharedWithSeller on its own feedback', async () => {
    await assertSucceeds(
      updateDoc(fb(ctxFor(KONSULT), 'fbPrivate'), { sharedWithSeller: true, sharedAt: new Date() })
    )
  })

  it('säljare cannot update feedback', async () => {
    await assertFails(
      updateDoc(fb(ctxFor(SALJARE), 'fbShared'), { sharedWithSeller: false })
    )
  })

  it('konsult can create feedback under its own tree', async () => {
    await assertSucceeds(
      setDoc(fb(ctxFor(KONSULT), 'fbNew'), { overallScore: 9, sharedWithSeller: false, sharedAt: null })
    )
  })

  it('säljare cannot create feedback', async () => {
    await assertFails(
      setDoc(fb(ctxFor(SALJARE), 'fbNew2'), { overallScore: 9, sharedWithSeller: false })
    )
  })
})

describe('systemEvents technical log', () => {
  it('admin CAN read systemEvents', async () => {
    await assertSucceeds(getDoc(doc(ctxFor(ADMIN), 'systemEvents', 'ev1')))
  })

  it('säljare CANNOT read systemEvents', async () => {
    await assertFails(getDoc(doc(ctxFor(SALJARE), 'systemEvents', 'ev1')))
  })

  it('konsult CANNOT read systemEvents', async () => {
    await assertFails(getDoc(doc(ctxFor(KONSULT), 'systemEvents', 'ev1')))
  })

  it('a signed-in user CAN create an event with its own uid', async () => {
    await assertSucceeds(
      setDoc(doc(ctxFor(KONSULT), 'systemEvents', 'evNew'), {
        type: 'pipeline_error', severity: 'error', step: 'whisper',
        message: 'boom', uid: KONSULT, createdAt: new Date(),
      })
    )
  })

  it('a user CANNOT create an event impersonating another uid', async () => {
    await assertFails(
      setDoc(doc(ctxFor(KONSULT), 'systemEvents', 'evSpoof'), {
        type: 'pipeline_error', severity: 'error', uid: SALJARE, createdAt: new Date(),
      })
    )
  })

  it('systemEvents are immutable (no update, no delete)', async () => {
    await assertFails(updateDoc(doc(ctxFor(ADMIN), 'systemEvents', 'ev1'), { message: 'tampered' }))
    await assertFails(deleteDoc(doc(ctxFor(ADMIN), 'systemEvents', 'ev1')))
  })
})

describe('pendingProfiles migration (first-login self-cleanup)', () => {
  it('konsult CAN read its OWN pending profile (doc id == token email)', async () => {
    await assertSucceeds(
      getDoc(doc(ctxForEmail(KONSULT, 'k@boulder.se'), 'pendingProfiles', 'k@boulder.se'))
    )
  })

  it('konsult CAN delete its OWN pending profile (migration cleanup)', async () => {
    await assertSucceeds(
      deleteDoc(doc(ctxForEmail(KONSULT, 'k@boulder.se'), 'pendingProfiles', 'k@boulder.se'))
    )
  })

  it('konsult CANNOT read SOMEONE ELSE\'s pending profile', async () => {
    await assertFails(
      getDoc(doc(ctxForEmail(KONSULT, 'k@boulder.se'), 'pendingProfiles', 'other@boulder.se'))
    )
  })

  it('konsult CANNOT create or update a pending profile', async () => {
    await assertFails(
      setDoc(doc(ctxForEmail(KONSULT, 'new@boulder.se'), 'pendingProfiles', 'new@boulder.se'), {
        name: 'X', email: 'new@boulder.se', competencies: [], jobs: [],
      })
    )
    await assertFails(
      updateDoc(doc(ctxForEmail(KONSULT, 'k@boulder.se'), 'pendingProfiles', 'k@boulder.se'), {
        competencies: [{ title: 'injected' }],
      })
    )
  })

  it('säljare CAN read and write pending profiles', async () => {
    await assertSucceeds(getDoc(doc(ctxFor(SALJARE), 'pendingProfiles', 'k@boulder.se')))
    await assertSucceeds(
      setDoc(doc(ctxFor(SALJARE), 'pendingProfiles', 'fresh@boulder.se'), {
        name: 'Fresh', email: 'fresh@boulder.se', competencies: [], jobs: [],
      })
    )
  })
})

// Reproduktion av säljarens FAKTISKA sekvens, operation för operation, så som
// SäljarePage och NewKonsultModal kör den. Anledningen: testet ovan bevisar
// bara `get` på ETT dokument, men sidan gör `getDocs` på hela kollektionen –
// en LIST-operation, som är en annan rättighet. Nekas listningen laddar sidan
// aldrig och säljaren når aldrig dialogen för att lägga till en konsult.
describe('säljarvyn – reproduktion av "lägg till konsult"', () => {
  // SäljarePage.load() rad 25-28
  it('steg 1: säljare CAN lista users filtrerat på role==konsult', async () => {
    const q = query(collection(ctxFor(SALJARE), 'users'), where('role', '==', 'konsult'))
    await assertSucceeds(getDocs(q))
  })

  it('steg 2: säljare CAN lista hela pendingProfiles-kollektionen', async () => {
    await assertSucceeds(getDocs(collection(ctxFor(SALJARE), 'pendingProfiles')))
  })

  // SäljarePage.load() rad 36-37 – räknare per konsult
  it('steg 3: säljare CAN lista en konsults kompetenser och uppdrag', async () => {
    await assertSucceeds(getDocs(collection(ctxFor(SALJARE), 'users', KONSULT, 'competencies')))
    await assertSucceeds(getDocs(collection(ctxFor(SALJARE), 'users', KONSULT, 'jobs')))
  })

  // NewKonsultModal.handleSubmit() rad 217
  it('steg 4: säljare CAN skapa en HELT NY pending-profil', async () => {
    await assertSucceeds(
      setDoc(doc(ctxFor(SALJARE), 'pendingProfiles', 'nykonsult@boulder.se'), {
        name: 'Ny Konsult', email: 'nykonsult@boulder.se',
        competencies: [], jobs: [],
      })
    )
  })

  // PendingProfilPage rad 91 – dit man navigeras direkt efter skapandet
  it('steg 5: säljare CAN läsa tillbaka profilen på sidan man landar på', async () => {
    await assertSucceeds(getDoc(doc(ctxFor(SALJARE), 'pendingProfiles', 'k@boulder.se')))
  })

  // PendingProfilPage – säljaren fyller på med kompetenser/uppdrag
  it('steg 6: säljare CAN uppdatera en pending-profil', async () => {
    await assertSucceeds(
      updateDoc(doc(ctxFor(SALJARE), 'pendingProfiles', 'k@boulder.se'), {
        competencies: [{ title: 'Azure' }],
      })
    )
  })

  // Negativ kontroll: rättigheten får inte läcka till konsulter.
  it('negativ kontroll: konsult CANNOT lista pendingProfiles', async () => {
    await assertFails(getDocs(collection(ctxForEmail(KONSULT, 'k@boulder.se'), 'pendingProfiles')))
  })

  // Negativ kontroll: en konsult får inte lista alla users.
  it('negativ kontroll: konsult CANNOT lista users', async () => {
    await assertFails(getDocs(collection(ctxFor(KONSULT), 'users')))
  })
})

// HELA migreringen som AuthGate kör vid konsultens FÖRSTA inloggning.
// Detta är buggen som gjorde att säljar-förberedd data aldrig nådde fram:
// profilen skapades korrekt, men överlämningen nekades och pending-dokumentet
// blev kvar – konsulten fick ett tomt konto och profilen låg kvar som
// "väntande". Varje steg måste passera, annars löser inte regeldeployen något.
describe('konsultens första inloggning – hela migreringen (AuthGate)', () => {
  const EMAIL = 'k@boulder.se'
  const asKonsult = () => ctxForEmail(KONSULT, EMAIL)

  // AuthGate rad 121
  it('steg 1: läser sin EGEN pending-profil', async () => {
    await assertSucceeds(getDoc(doc(asKonsult(), 'pendingProfiles', EMAIL)))
  })

  // AuthGate rad 134-139 – kompetenserna kopieras till eget träd
  it('steg 2: skriver kompetenser under sitt EGET träd', async () => {
    await assertSucceeds(
      setDoc(doc(asKonsult(), 'users', KONSULT, 'competencies', 'c1'), {
        title: 'Azure', description: 'D', tags: ['azure'], category: 'Övrigt',
      })
    )
  })

  // AuthGate rad 140-145 – uppdragen kopieras till eget träd
  it('steg 3: skriver uppdrag under sitt EGET träd', async () => {
    await assertSucceeds(
      setDoc(doc(asKonsult(), 'users', KONSULT, 'jobs', 'j1'), {
        jobTitle: 'Interim IT-chef', company: 'Boulder', questions: [],
      })
    )
  })

  // AuthGate rad 150 – städar bort pending-dokumentet
  it('steg 4: raderar sin egen pending-profil (det som aldrig hann ske)', async () => {
    await assertSucceeds(deleteDoc(doc(asKonsult(), 'pendingProfiles', EMAIL)))
  })

  // Negativa kontroller: migreringsrätten får INTE läcka utanför eget träd.
  it('negativ kontroll: kan inte skriva kompetenser i någon ANNANS träd', async () => {
    await assertFails(
      setDoc(doc(asKonsult(), 'users', SALJARE, 'competencies', 'evil'), { title: 'X' })
    )
  })

  it('negativ kontroll: kan inte skriva uppdrag i någon ANNANS träd', async () => {
    await assertFails(
      setDoc(doc(asKonsult(), 'users', SALJARE, 'jobs', 'evil'), { jobTitle: 'X' })
    )
  })

  it('negativ kontroll: kan inte radera någon ANNANS pending-profil', async () => {
    await assertFails(
      deleteDoc(doc(asKonsult(), 'pendingProfiles', 'other@boulder.se'))
    )
  })

  // Konsult UTAN förberedd profil – det vanligaste fallet.
  // Firestore svarar PERMISSION_DENIED utan att avslöja om dokumentet finns,
  // så en nekad regel får AuthGate att kasta INNAN den hinner kolla exists().
  // Följden före deployen: varje förstagångsinloggning loggade ett tekniskt
  // fel även när ingen profil fanns – vilket blåser upp felfrekvensen i
  // Driftöversikten. Med regeln på plats blir läsningen i stället en tom
  // träff, och inget fel loggas.
  it('konsult UTAN förberedd profil får en TOM träff, inte ett fel', async () => {
    const solo = ctxForEmail('konsult2', 'solo@boulder.se')
    await assertSucceeds(getDoc(doc(solo, 'pendingProfiles', 'solo@boulder.se')))
  })

  it('nekad läsning avslöjar inte om någon ANNANS profil existerar', async () => {
    await assertFails(
      getDoc(doc(asKonsult(), 'pendingProfiles', 'finns-inte@boulder.se'))
    )
  })
})

// ── CV:n per uppdrag ──────────────────────────────────────────────────────
// Säljaren förbereder konsultens CV:n och kopplar dem till uppdrag; konsulten
// gör samma sak själv. Ingen annan konsult får se eller ändra dem.
describe('CV:n (users/{uid}/cvs) och CV-koppling på uppdrag', () => {
  const OTHER = 'konsult_other'
  const cvDoc = (db, id = 'cv1') => doc(db, 'users', KONSULT, 'cvs', id)

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'users', OTHER), { role: 'konsult', email: 'o@boulder.se' })
      await setDoc(cvDoc(db), { label: 'Arkitekt', competencies: [{ title: 'Azure' }], competencyCount: 1 })
      await setDoc(doc(db, 'users', KONSULT, 'jobs', 'job1'), { jobTitle: 'Roll', cvId: null })
    })
  })

  it('konsulten läser, skapar, byter namn på och raderar sina EGNA CV:n', async () => {
    const db = ctxFor(KONSULT)
    await assertSucceeds(getDoc(cvDoc(db)))
    await assertSucceeds(setDoc(cvDoc(db, 'cv2'), { label: 'PL', competencies: [] }))
    await assertSucceeds(updateDoc(cvDoc(db), { label: 'Ny' }))
    await assertSucceeds(deleteDoc(cvDoc(db, 'cv2')))
  })

  it('säljaren laddar upp CV åt konsulten och listar konsultens CV:n', async () => {
    const db = ctxFor(SALJARE)
    await assertSucceeds(setDoc(cvDoc(db, 'cvS'), { label: 'Från säljaren', competencies: [] }))
    await assertSucceeds(getDocs(collection(db, 'users', KONSULT, 'cvs')))
  })

  it('säljaren OCH konsulten kan koppla CV till uppdraget', async () => {
    await assertSucceeds(
      updateDoc(doc(ctxFor(SALJARE), 'users', KONSULT, 'jobs', 'job1'), { cvId: 'cv1' })
    )
    await assertSucceeds(
      updateDoc(doc(ctxFor(KONSULT), 'users', KONSULT, 'jobs', 'job1'), { cvId: null })
    )
  })

  it('admin har åtkomst', async () => {
    await assertSucceeds(getDoc(cvDoc(ctxFor(ADMIN))))
  })

  it('negativ kontroll: en ANNAN konsult kan varken läsa eller skriva', async () => {
    const db = ctxFor(OTHER)
    await assertFails(getDoc(cvDoc(db)))
    await assertFails(getDocs(collection(db, 'users', KONSULT, 'cvs')))
    await assertFails(setDoc(cvDoc(db, 'evil'), { label: 'X' }))
    await assertFails(deleteDoc(cvDoc(db)))
  })

  it('negativ kontroll: utloggad nekas', async () => {
    await assertFails(getDoc(cvDoc(testEnv.unauthenticatedContext().firestore())))
  })

  it('överlämningen: konsulten skriver CV med säljarens id i sitt eget träd', async () => {
    const db = ctxForEmail(KONSULT, 'k@boulder.se')
    await assertSucceeds(setDoc(cvDoc(db, 'cv_lxyz_abc123'), { label: 'Förberett', competencies: [] }))
  })
})
