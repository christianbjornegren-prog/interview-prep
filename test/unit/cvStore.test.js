import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory Firestore stand-in. Documents keyed by full path; collections are
// derived by prefix. Batches apply all-or-nothing (failNextCommit simulates
// a network/permission error mid-migration).
let docs
let autoId
let failNextCommit

const SERVER_TS = { __serverTimestamp: true }

// Deep copy that keeps functions (Timestamp-like toMillis) intact.
function clone(v) {
  if (Array.isArray(v)) return v.map(clone)
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)]))
  }
  return v
}

function ts(ms) {
  return { toMillis: () => ms }
}

function childrenOf(colPath) {
  const prefix = colPath + '/'
  return Object.keys(docs)
    .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
    .map((p) => ({ id: p.slice(prefix.length), path: p }))
}

function snapOf(path) {
  const exists = path in docs
  return {
    id: path.split('/').pop(),
    exists: () => exists,
    data: () => (exists ? clone(docs[path]) : undefined),
    ref: { path },
  }
}

vi.mock('../../src/lib/firebase.js', () => {
  const collection = (_db, ...segments) => ({ kind: 'col', path: segments.join('/') })
  const doc = (first, ...segments) => {
    if (first && first.kind === 'col') {
      return { path: `${first.path}/auto${++autoId}`, id: `auto${autoId}` }
    }
    const path = segments.join('/')
    return { path, id: segments[segments.length - 1] }
  }
  const getDocs = async (q) => {
    const col = q.kind === 'query' ? q.col : q
    let list = childrenOf(col.path).map((c) => snapOf(c.path))
    if (q.kind === 'query') {
      list = list.filter((s) => s.data()?.[q.field] === q.value)
    }
    return { docs: list, empty: list.length === 0, size: list.length }
  }
  return {
    db: {},
    collection,
    doc,
    getDoc: async (ref) => snapOf(ref.path),
    getDocs,
    query: (col, w) => ({ kind: 'query', col, ...w }),
    where: (field, _op, value) => ({ field, value }),
    setDoc: async (ref, data) => { docs[ref.path] = clone(data) },
    updateDoc: async (ref, data) => {
      if (!(ref.path in docs)) throw new Error('not-found')
      docs[ref.path] = { ...docs[ref.path], ...clone(data) }
    },
    serverTimestamp: () => SERVER_TS,
    Timestamp: { now: () => ts(1000) },
    // Transaktion: läs direkt, skriv alla-eller-inget vid commit (samma
    // failNextCommit-spak som batcharna).
    runTransaction: async (_db, fn) => {
      const ops = []
      const tx = {
        get: async (ref) => snapOf(ref.path),
        set: (ref, data) => ops.push(() => { docs[ref.path] = data }),
        update: (ref, data) => ops.push(() => { docs[ref.path] = { ...docs[ref.path], ...data } }),
      }
      const result = await fn(tx)
      if (failNextCommit) { failNextCommit = false; throw new Error('commit failed') }
      ops.forEach((op) => op())
      return result
    },
    writeBatch: () => {
      const ops = []
      return {
        set: (ref, data) => ops.push(() => { docs[ref.path] = data }),
        update: (ref, data) => ops.push(() => { docs[ref.path] = { ...docs[ref.path], ...data } }),
        delete: (ref) => ops.push(() => { delete docs[ref.path] }),
        commit: async () => {
          if (failNextCommit) { failNextCommit = false; throw new Error('commit failed') }
          ops.forEach((op) => op())
        },
      }
    },
  }
})

const {
  migrateLegacyCompetencies,
  createUserCvStore,
  createPendingCvStore,
  countUserCvs,
  clearUserCvs,
} = await import('../../src/lib/cvStore.js')
const { legacyCvId } = await import('../../src/lib/cvs.js')

beforeEach(() => {
  docs = {}
  autoId = 0
  failNextCommit = false
})

function seedLegacy() {
  docs['users/u1/competencies/c1'] = { title: 'Azure', sourceFile: 'a.pdf', createdAt: ts(20) }
  docs['users/u1/competencies/c2'] = { title: 'React', sourceFile: 'a.pdf', createdAt: ts(10) }
  docs['users/u1/competencies/c3'] = { title: 'Ledarskap' }
}

describe('migrateLegacyCompetencies', () => {
  it('flyttar den samlade banken till CV:n per källfil – originalen LIGGER KVAR, märkta (rollback-säkert)', async () => {
    seedLegacy()
    const created = await migrateLegacyCompetencies('u1')
    expect(created).toBe(2)
    // Originalen finns kvar med allt innehåll orört – gamla appen ser samma bank
    expect(docs['users/u1/competencies/c1']).toMatchObject({ title: 'Azure', sourceFile: 'a.pdf' })
    expect(docs['users/u1/competencies/c1'].migratedToCvId).toBe(legacyCvId('a.pdf'))
    expect(docs['users/u1/competencies/c3'].migratedToCvId).toBe(legacyCvId('__manual__'))
    const a = docs[`users/u1/cvs/${legacyCvId('a.pdf')}`]
    expect(a.competencies.map((c) => c.title)).toEqual(['Azure', 'React'])
    expect(a.competencyCount).toBe(2)
    expect(a.source).toBe('legacy')
  })

  it('CV:ts tid = äldsta kompetensens tid', async () => {
    seedLegacy()
    await migrateLegacyCompetencies('u1')
    expect(docs[`users/u1/cvs/${legacyCvId('a.pdf')}`].createdAt.toMillis()).toBe(10)
  })

  it('är ofarlig att köra om – inga dubbletter', async () => {
    seedLegacy()
    await migrateLegacyCompetencies('u1')
    const after1 = Object.keys(docs).sort()
    expect(await migrateLegacyCompetencies('u1')).toBe(0)
    expect(Object.keys(docs).sort()).toEqual(after1)
  })

  it('atomärt per CV: misslyckas en grupp ligger dess kompetenser kvar orörda', async () => {
    seedLegacy()
    failNextCommit = true
    await expect(migrateLegacyCompetencies('u1')).rejects.toThrow('commit failed')
    // första gruppen (a.pdf) misslyckades → inget CV, originalen omärkta
    expect(docs[`users/u1/cvs/${legacyCvId('a.pdf')}`]).toBeUndefined()
    expect(docs['users/u1/competencies/c1'].migratedToCvId).toBeUndefined()
    // nästa körning läker
    await migrateLegacyCompetencies('u1')
    expect(docs[`users/u1/cvs/${legacyCvId('a.pdf')}`]).toBeDefined()
    expect(docs['users/u1/competencies/c1'].migratedToCvId).toBe(legacyCvId('a.pdf'))
  })

  it('ett flyttat CV som raderas kommer INTE tillbaka vid nästa listning', async () => {
    seedLegacy()
    const store = createUserCvStore('u1')
    await store.list()
    await store.remove(legacyCvId('a.pdf'))
    const list = await store.list()
    expect(list.map((c) => c.id)).not.toContain(legacyCvId('a.pdf'))
  })

  it('nya omärkta kompetenser för en redan flyttad fil läggs TILL i CV:t (skriver aldrig över)', async () => {
    seedLegacy()
    await migrateLegacyCompetencies('u1')
    const id = legacyCvId('a.pdf')
    docs[`users/u1/cvs/${id}`].label = 'Omdöpt av konsulten'
    docs['users/u1/competencies/c9'] = { title: 'Kotlin', sourceFile: 'a.pdf' }
    await migrateLegacyCompetencies('u1')
    expect(docs[`users/u1/cvs/${id}`].label).toBe('Omdöpt av konsulten')
    expect(docs[`users/u1/cvs/${id}`].competencies.map((c) => c.title)).toEqual(['Azure', 'React', 'Kotlin'])
    expect(docs[`users/u1/cvs/${id}`].competencyCount).toBe(3)
  })

  it('gör ingenting utan äldre data', async () => {
    expect(await migrateLegacyCompetencies('u1')).toBe(0)
  })
})

describe('createUserCvStore', () => {
  it('list() migrerar äldre data först och sorterar nyaste först', async () => {
    seedLegacy()
    docs['users/u1/cvs/ny'] = { label: 'Ny', competencies: [], createdAt: ts(999) }
    const list = await createUserCvStore('u1').list()
    expect(list[0].id).toBe('ny')
    expect(list).toHaveLength(3)
  })

  it('list() visar ändå CV:n om migreringen fallerar', async () => {
    seedLegacy()
    docs['users/u1/cvs/ny'] = { label: 'Ny', competencies: [] }
    failNextCommit = true
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const list = await createUserCvStore('u1').list()
    spy.mockRestore()
    expect(list.map((c) => c.id)).toContain('ny')
  })

  it('create() sparar ett nytt CV med egna kompetenser', async () => {
    const cv = await createUserCvStore('u1').create({
      fileName: 'CV_Anna.pdf',
      competencies: [{ title: 'Azure', createdAt: 'x' }],
    })
    expect(docs[`users/u1/cvs/${cv.id}`]).toMatchObject({
      label: 'CV_Anna', competencyCount: 1, createdAt: SERVER_TS,
    })
    expect(docs[`users/u1/cvs/${cv.id}`].competencies).toEqual([{ title: 'Azure' }])
  })

  it('ingen dubblettkoll mellan CV:n – samma kompetens får finnas i två CV', async () => {
    const store = createUserCvStore('u1')
    await store.create({ fileName: 'a.pdf', competencies: [{ title: 'Azure' }] })
    const b = await store.create({ fileName: 'b.pdf', competencies: [{ title: 'Azure' }] })
    expect(b.competencyCount).toBe(1)
  })

  it('rename() byter namn, tomt namn nekas', async () => {
    docs['users/u1/cvs/cv1'] = { label: 'Gammal' }
    const store = createUserCvStore('u1')
    await store.rename('cv1', '  Arkitekt ')
    expect(docs['users/u1/cvs/cv1'].label).toBe('Arkitekt')
    await expect(store.rename('cv1', '  ')).rejects.toThrow()
  })

  it('remove() raderar CV:t och kopplar loss ENBART dess uppdrag, atomärt', async () => {
    docs['users/u1/cvs/cv1'] = { label: 'A' }
    docs['users/u1/cvs/cv2'] = { label: 'B' }
    docs['users/u1/jobs/j1'] = { cvId: 'cv1', cvLabel: 'A', jobTitle: 'X' }
    docs['users/u1/jobs/j2'] = { cvId: 'cv1' }
    docs['users/u1/jobs/j3'] = { cvId: 'cv2' }
    const unlinked = await createUserCvStore('u1').remove('cv1')
    expect(unlinked).toBe(2)
    expect(docs['users/u1/cvs/cv1']).toBeUndefined()
    expect(docs['users/u1/jobs/j1']).toEqual({ cvId: null, cvLabel: '', jobTitle: 'X' })
    expect(docs['users/u1/jobs/j3'].cvId).toBe('cv2')
  })

  it('remove() som misslyckas lämnar både CV och uppdrag orörda', async () => {
    docs['users/u1/cvs/cv1'] = { label: 'A' }
    docs['users/u1/jobs/j1'] = { cvId: 'cv1' }
    failNextCommit = true
    await expect(createUserCvStore('u1').remove('cv1')).rejects.toThrow()
    expect(docs['users/u1/cvs/cv1']).toBeDefined()
    expect(docs['users/u1/jobs/j1'].cvId).toBe('cv1')
  })

  it('addCompetency/removeCompetency håller antalet i synk', async () => {
    docs['users/u1/cvs/cv1'] = { competencies: [{ title: 'A' }], competencyCount: 1 }
    const store = createUserCvStore('u1')
    await store.addCompetency('cv1', { title: 'B' })
    expect(docs['users/u1/cvs/cv1'].competencyCount).toBe(2)
    await store.removeCompetency('cv1', 0)
    expect(docs['users/u1/cvs/cv1'].competencies).toEqual([{ title: 'B' }])
    expect(docs['users/u1/cvs/cv1'].competencyCount).toBe(1)
  })

  it('addCompetency på raderat CV ger ett tydligt fel', async () => {
    await expect(createUserCvStore('u1').addCompetency('borta', { title: 'A' })).rejects.toThrow(
      'CV:t finns inte längre.'
    )
  })

  it('saveJob() skriver till uppdragsdokumentet', async () => {
    docs['users/u1/jobs/j1'] = { jobTitle: 'X' }
    await createUserCvStore('u1').saveJob('j1', { cvId: 'cv1' })
    expect(docs['users/u1/jobs/j1']).toEqual({ jobTitle: 'X', cvId: 'cv1' })
  })
})

describe('countUserCvs / clearUserCvs', () => {
  it('räknar både nya CV:n och ännu ej flyttade äldre grupper', async () => {
    seedLegacy()
    docs['users/u1/cvs/cv1'] = {}
    expect(await countUserCvs('u1')).toBe(3)
  })

  it('räknar inte en grupp två gånger om den redan flyttats', async () => {
    docs[`users/u1/cvs/${legacyCvId('a.pdf')}`] = {}
    docs['users/u1/competencies/c9'] = { sourceFile: 'a.pdf' }
    expect(await countUserCvs('u1')).toBe(1)
  })

  it('märkta (flyttade) originaler räknas inte, även om CV:t raderats', async () => {
    docs['users/u1/competencies/c9'] = { sourceFile: 'a.pdf', migratedToCvId: 'x' }
    expect(await countUserCvs('u1')).toBe(0)
  })

  it('clearUserCvs raderar CV:n och äldre kompetenser', async () => {
    seedLegacy()
    docs['users/u1/cvs/cv1'] = {}
    docs['users/u1/jobs/j1'] = { cvId: 'cv1' }
    await clearUserCvs('u1')
    expect(Object.keys(docs)).toEqual(['users/u1/jobs/j1'])
  })
})

describe('createPendingCvStore', () => {
  const PATH = 'pendingProfiles/p@boulder.se'

  beforeEach(() => {
    docs[PATH] = {
      name: 'P',
      competencies: [],
      cvs: [{ id: 'cv1', label: 'A', competencies: [{ title: 'Azure' }], competencyCount: 1, createdAt: ts(1) }],
      jobs: [
        { id: 'job_1', jobTitle: 'X', cvId: 'cv1' },
        { id: 'job_2', jobTitle: 'Y' },
      ],
    }
  })

  it('list() konverterar en äldre samlad kompetensarray i EN skrivning – arrayen lämnas orörd', async () => {
    docs[PATH].competencies = [{ title: 'React', sourceFile: 'b.pdf' }]
    const list = await createPendingCvStore('p@boulder.se').list()
    expect(list).toHaveLength(2)
    expect(docs[PATH].competencies).toEqual([{ title: 'React', sourceFile: 'b.pdf' }])
    expect(docs[PATH].competenciesMigrated).toBe(true)
    expect(docs[PATH].cvs).toHaveLength(2)
  })

  it('ett konverterat väntande CV som raderas kommer inte tillbaka', async () => {
    docs[PATH].competencies = [{ title: 'React', sourceFile: 'b.pdf' }]
    const store = createPendingCvStore('p@boulder.se')
    const list = await store.list()
    const legacy = list.find((c) => c.source === 'legacy')
    await store.remove(legacy.id)
    expect((await store.list()).map((c) => c.id)).not.toContain(legacy.id)
  })

  it('create() lägger till ett CV med klient-id och konkret tidsstämpel', async () => {
    const cv = await createPendingCvStore('p@boulder.se').create({ fileName: 'n.pdf', competencies: [] })
    expect(cv.id).toMatch(/^cv_/)
    expect(docs[PATH].cvs.map((c) => c.id)).toEqual(['cv1', cv.id])
    expect(docs[PATH].cvs[1].createdAt.toMillis()).toBe(1000)
  })

  it('remove() tar bort CV:t och kopplar loss dess uppdrag i samma skrivning', async () => {
    const unlinked = await createPendingCvStore('p@boulder.se').remove('cv1')
    expect(unlinked).toBe(1)
    expect(docs[PATH].cvs).toEqual([])
    expect(docs[PATH].jobs[0]).toMatchObject({ id: 'job_1', cvId: null })
    expect(docs[PATH].jobs[1]).toEqual({ id: 'job_2', jobTitle: 'Y' })
  })

  it('saveJob() ändrar bara rätt uppdrag i arrayen', async () => {
    await createPendingCvStore('p@boulder.se').saveJob('job_2', { cvId: 'cv1' })
    expect(docs[PATH].jobs[1].cvId).toBe('cv1')
    expect(docs[PATH].jobs[0].jobTitle).toBe('X')
  })

  it('saveJob() på okänt uppdrag kastar i stället för att tyst göra ingenting', async () => {
    await expect(createPendingCvStore('p@boulder.se').saveJob('nope', {})).rejects.toThrow()
  })

  it('kompetenser inom ett väntande CV', async () => {
    const store = createPendingCvStore('p@boulder.se')
    await store.addCompetency('cv1', { title: 'TOGAF' })
    expect(docs[PATH].cvs[0].competencyCount).toBe(2)
    await store.removeCompetency('cv1', 0)
    expect(docs[PATH].cvs[0].competencies).toEqual([{ title: 'TOGAF' }])
  })

  it('rename() och get()', async () => {
    const store = createPendingCvStore('p@boulder.se')
    await store.rename('cv1', 'Arkitekt')
    expect((await store.get('cv1')).label).toBe('Arkitekt')
    expect(await store.get('borta')).toBeNull()
  })

  it('saknad profil ger ett tydligt fel', async () => {
    delete docs[PATH]
    await expect(createPendingCvStore('p@boulder.se').list()).rejects.toThrow('Profilen finns inte längre.')
  })
})
