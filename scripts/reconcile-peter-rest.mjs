/**
 * One-time reconcile for Peter using Firestore REST API + Firebase CLI token.
 * Run from project root: node scripts/reconcile-peter-rest.mjs
 */

import { readFileSync } from 'fs'
import { join }         from 'path'
import { homedir }      from 'os'

const PROJECT  = 'interview-prep-81cb6'
const UID      = '8EQsfxHOLvXraOI4dyfYLPT3aD62'
const EMAIL    = 'peter.edhall@boulder.se'
const BASE     = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`

// ── Firebase CLI token ────────────────────────────────────────────────────
const cfgPath = join(homedir(), '.config', 'configstore', 'firebase-tools.json')
const cfg     = JSON.parse(readFileSync(cfgPath, 'utf8'))
const TOKEN   = cfg.tokens?.access_token
if (!TOKEN) { console.error('No Firebase CLI access token found. Run: firebase login'); process.exit(1) }
const expiresAt = cfg.tokens?.expires_at ?? 0
if (expiresAt < Date.now()) { console.error('Firebase CLI token expired. Run: firebase login'); process.exit(1) }
console.log(`Auth: Firebase CLI token for ${cfg.user?.email}, expires ${new Date(expiresAt).toISOString()}`)

// ── REST helpers ──────────────────────────────────────────────────────────
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

async function fsGet(path) {
  const r = await fetch(`${BASE}/${path}`, { headers })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${await r.text()}`)
  return r.json()
}

async function fsList(path) {
  const docs = []
  let pageToken = ''
  do {
    const url = `${BASE}/${path}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`
    const r   = await fetch(url, { headers })
    if (!r.ok) throw new Error(`LIST ${path} → ${r.status}: ${await r.text()}`)
    const body  = await r.json()
    docs.push(...(body.documents ?? []))
    pageToken = body.nextPageToken ?? ''
  } while (pageToken)
  return docs
}

async function fsPatch(path, fields) {
  const r = await fetch(`${BASE}/${path}`, {
    method:  'PATCH',
    headers,
    body:    JSON.stringify({ fields }),
  })
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}: ${await r.text()}`)
  return r.json()
}

async function fsPost(path, fields) {
  const r = await fetch(`${BASE}/${path}`, {
    method:  'POST',
    headers,
    body:    JSON.stringify({ fields }),
  })
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${await r.text()}`)
  return r.json()
}

async function fsDelete(path) {
  const r = await fetch(`${BASE}/${path}`, { method: 'DELETE', headers })
  if (!r.ok && r.status !== 404) throw new Error(`DELETE ${path} → ${r.status}: ${await r.text()}`)
}

// ── Firestore value converters ────────────────────────────────────────────
function fromValue(v) {
  if ('stringValue'    in v) return v.stringValue
  if ('integerValue'   in v) return parseInt(v.integerValue)
  if ('doubleValue'    in v) return v.doubleValue
  if ('booleanValue'   in v) return v.booleanValue
  if ('nullValue'      in v) return null
  if ('timestampValue' in v) return v.timestampValue
  if ('arrayValue'     in v) return (v.arrayValue.values ?? []).map(fromValue)
  if ('mapValue'       in v) return fromFields(v.mapValue.fields ?? {})
  return null
}
function fromFields(fields) {
  const obj = {}
  for (const [k, v] of Object.entries(fields)) obj[k] = fromValue(v)
  return obj
}
function toValue(val) {
  if (val === null || val === undefined) return { nullValue: null }
  if (typeof val === 'string')  return { stringValue: val }
  if (typeof val === 'boolean') return { booleanValue: val }
  if (typeof val === 'number')  return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val }
  if (Array.isArray(val))       return { arrayValue: { values: val.map(toValue) } }
  if (typeof val === 'object')  return { mapValue: { fields: toFields(val) } }
  return { nullValue: null }
}
function toFields(obj) {
  const fields = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) fields[k] = toValue(v)
  }
  return fields
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n=== reconcile-peter (REST) ===')
  console.log(`  uid   : ${UID}`)
  console.log(`  email : ${EMAIL}`)

  // 1. Find pendingProfiles doc (exact, then case-insensitive)
  let pendingPath = `pendingProfiles/${encodeURIComponent(EMAIL)}`
  let pendingDoc  = await fsGet(pendingPath)

  if (!pendingDoc) {
    console.log('  · Exact key not found — scanning…')
    const all   = await fsList('pendingProfiles')
    const match = all.find(d => {
      const id = d.name.split('/').pop()
      return decodeURIComponent(id).toLowerCase() === EMAIL.toLowerCase()
    }) ?? all.find(d => {
      const id = decodeURIComponent(d.name.split('/').pop())
      return id.toLowerCase().includes(EMAIL.split('@')[0])
    })
    if (!match) {
      const ids = all.map(d => decodeURIComponent(d.name.split('/').pop()))
      console.error(`FATAL: no pendingProfiles doc for "${EMAIL}"`)
      console.error('Existing:', ids.join(', ') || '(none)')
      process.exit(1)
    }
    pendingPath = match.name.replace(/.*\/documents\//, '')
    pendingDoc  = match
    console.log(`  ✓ Found as: "${decodeURIComponent(pendingPath.split('/').pop())}"`)
  } else {
    console.log(`  ✓ Found exact: "${EMAIL}"`)
  }

  const pending      = fromFields(pendingDoc.fields ?? {})
  const competencies = pending.competencies ?? []
  const jobs         = pending.jobs         ?? []
  console.log(`  · name="${pending.name}", ${competencies.length} competencies, ${jobs.length} jobs`)

  // 2. Create users/{uid} if missing
  const userDoc = await fsGet(`users/${UID}`)
  if (userDoc) {
    console.log(`  ⚠ users/${UID} already exists — skipping create`)
  } else {
    await fsPatch(`users/${UID}`, toFields({
      email:            EMAIL,
      name:             pending.name ?? '',
      role:             'konsult',
      profileActivated: true,
      createdAt:        new Date().toISOString(),
    }))
    console.log(`  ✓ Created users/${UID}`)
  }

  // 3. Copy competencies (idempotent)
  const existingComp = await fsList(`users/${UID}/competencies`)
  if (existingComp.length > 0) {
    console.log(`  ⚠ competencies already has ${existingComp.length} docs — skipping`)
  } else {
    for (const { createdAt: _ct, ...comp } of competencies) {
      await fsPost(`users/${UID}/competencies`, toFields({
        ...comp,
        createdAt: new Date().toISOString(),
      }))
    }
    const written = (await fsList(`users/${UID}/competencies`)).length
    if (written !== competencies.length) {
      console.error(`FATAL: expected ${competencies.length} competencies, got ${written} — NOT deleting pending`)
      process.exit(1)
    }
    console.log(`  ✓ ${written} competencies written & verified`)
  }

  // 4. Copy jobs (idempotent)
  const existingJobs = await fsList(`users/${UID}/jobs`)
  if (existingJobs.length > 0) {
    console.log(`  ⚠ jobs already has ${existingJobs.length} docs — skipping`)
  } else {
    for (const { createdAt: _ct, id: _id, ...job } of jobs) {
      await fsPost(`users/${UID}/jobs`, toFields({
        ...job,
        createdAt: new Date().toISOString(),
      }))
    }
    const written = (await fsList(`users/${UID}/jobs`)).length
    if (written !== jobs.length) {
      console.error(`FATAL: expected ${jobs.length} jobs, got ${written} — NOT deleting pending`)
      process.exit(1)
    }
    console.log(`  ✓ ${written} jobs written & verified`)
  }

  // 5. Delete pending doc LAST
  await fsDelete(pendingPath)
  console.log(`  ✓ pendingProfiles/${decodeURIComponent(pendingPath.split('/').pop())} deleted`)

  console.log('\n=== Done — Peter is unblocked ===\n')
}

main().catch(err => {
  console.error('\nFATAL:', err.message)
  process.exit(1)
})
