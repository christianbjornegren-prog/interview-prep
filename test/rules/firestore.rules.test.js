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
  })
})

function ctxFor(uid) {
  return testEnv.authenticatedContext(uid).firestore()
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
