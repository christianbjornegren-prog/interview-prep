import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory Firestore stand-in: paths are joined arg strings.
let store
const committed = []

function makeRef(path) {
  return { path }
}

vi.mock('../../src/lib/firebase.js', () => {
  return {
    db: {},
    auth: { currentUser: { uid: 'u1' } },
    collection: (_db, ...segments) => ({ path: segments.join('/') }),
    getDocs: async (col) => {
      const docs = (store[col.path] ?? []).map((id) => ({
        id,
        ref: makeRef(`${col.path}/${id}`),
      }))
      return { docs, empty: docs.length === 0 }
    },
    writeBatch: () => {
      const ops = []
      return {
        delete: (ref) => ops.push(ref.path),
        commit: async () => committed.push(...ops),
      }
    },
  }
})

const { clearCompetencies, clearJobs, clearAll } = await import(
  '../../src/lib/userData.js'
)

beforeEach(() => {
  committed.length = 0
  store = {
    'users/u1/competencies': ['c1', 'c2', 'c3'],
    'users/u1/jobs': ['j1', 'j2'],
    'users/u1/jobs/j1/feedback': ['f1', 'f2'],
    'users/u1/jobs/j2/feedback': [],
  }
})

describe('clearCompetencies', () => {
  it('deletes every competency and returns the count', async () => {
    const n = await clearCompetencies()
    expect(n).toBe(3)
    expect(committed.sort()).toEqual([
      'users/u1/competencies/c1',
      'users/u1/competencies/c2',
      'users/u1/competencies/c3',
    ])
  })
})

describe('clearJobs', () => {
  it('deletes feedback subcollections before the jobs themselves', async () => {
    const n = await clearJobs()
    expect(n).toBe(2)
    // feedback docs of j1 must be deleted
    expect(committed).toContain('users/u1/jobs/j1/feedback/f1')
    expect(committed).toContain('users/u1/jobs/j1/feedback/f2')
    // and the job docs
    expect(committed).toContain('users/u1/jobs/j1')
    expect(committed).toContain('users/u1/jobs/j2')
    // ordering: each feedback doc deleted before its parent job doc
    expect(committed.indexOf('users/u1/jobs/j1/feedback/f1')).toBeLessThan(
      committed.indexOf('users/u1/jobs/j1')
    )
  })

  it('returns 0 when there are no jobs', async () => {
    store['users/u1/jobs'] = []
    expect(await clearJobs()).toBe(0)
  })
})

describe('clearAll', () => {
  it('reports counts for both collections', async () => {
    const res = await clearAll()
    expect(res).toEqual({ competencies: 3, jobs: 2 })
  })
})
