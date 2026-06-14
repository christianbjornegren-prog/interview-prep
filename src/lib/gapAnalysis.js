// ── Gap-analys (förberedelse, ej bedömning) ───────────────────────────────
//
// Rena hjälpare (ingen IO) som normaliserar gap-analysstrukturen och räknar
// täckning. Bryts ut hit för att kunna enhetstestas.
//
// Ny struktur (från analyzeJobPosting):
//   { criticalGaps: [{ skill, reason, howToAddress }],
//     preparationAreas: [{ skill, type: 'meriterande'|'infererat' }],
//     coveredRequirements: [{ skill }] }
//
// Bakåtkompatibilitet: äldre jobb har { covered: [...], gaps: [...] }. Vi
// mappar dem framåt så att gamla jobb fortsätter visa något vettigt utan
// krasch (criticalGaps blir tom – vi kan inte härleda kritiska i efterhand).

const EMPTY = { criticalGaps: [], preparationAreas: [], coveredRequirements: [] }

/**
 * Normaliserar valfri (ny | gammal | saknad) gapAnalysis till nya formen.
 * Returnerar alltid tre arrayer.
 */
export function normalizeGapAnalysis(ga) {
  if (!ga || typeof ga !== 'object') return { ...EMPTY }

  const hasNew =
    Array.isArray(ga.criticalGaps) ||
    Array.isArray(ga.preparationAreas) ||
    Array.isArray(ga.coveredRequirements)

  if (hasNew) {
    return {
      criticalGaps: Array.isArray(ga.criticalGaps) ? ga.criticalGaps : [],
      preparationAreas: Array.isArray(ga.preparationAreas) ? ga.preparationAreas : [],
      coveredRequirements: Array.isArray(ga.coveredRequirements) ? ga.coveredRequirements : [],
    }
  }

  // Gammal form { covered: [{requirement, ...}], gaps: [{requirement, suggestion}] }
  const covered = Array.isArray(ga.covered) ? ga.covered : []
  const gaps = Array.isArray(ga.gaps) ? ga.gaps : []
  return {
    criticalGaps: [],
    preparationAreas: gaps.map((g) => ({
      skill: g.skill ?? g.requirement ?? '',
      type: 'infererat',
    })),
    coveredRequirements: covered.map((c) => ({
      skill: c.skill ?? c.requirement ?? c.competencyName ?? '',
    })),
  }
}

/**
 * Räknar täckning utifrån en NORMALISERAD gap-analys.
 * total = täckta + att förbereda + prioriterade.
 */
export function computeCoverage({ criticalGaps = [], preparationAreas = [], coveredRequirements = [] } = {}) {
  const covered = coveredRequirements.length
  const total = covered + preparationAreas.length + criticalGaps.length
  return { covered, total, ratio: total > 0 ? covered / total : 0 }
}

// ── Vikt-/matchningsmodell (requirements) ─────────────────────────────────
//
// Ny enhetlig modell: en lista av krav med importance + match.
//   requirements: [{ requirement, importance:'hög'|'medel'|'låg',
//                    match:'stark'|'delvis'|'svag', note, howToAddress }]

const IMPORTANCE = ['hög', 'medel', 'låg']
const MATCH = ['stark', 'delvis', 'svag']

/**
 * Ger en requirements[]-lista för ett jobb.
 * - Nya jobb: job.requirements används direkt.
 * - Äldre jobb (saknar requirements): härleds från gamla gapAnalysis
 *   (coveredRequirements→stark, preparationAreas→delvis, criticalGaps→svag/hög).
 */
export function resolveRequirements(job) {
  if (job && Array.isArray(job.requirements)) return job.requirements

  const ga = normalizeGapAnalysis(job?.gapAnalysis)
  const out = []
  for (const c of ga.coveredRequirements) {
    out.push({ requirement: c.skill ?? '', importance: 'medel', match: 'stark', note: '', howToAddress: '' })
  }
  for (const p of ga.preparationAreas) {
    out.push({
      requirement: p.skill ?? '',
      importance: p.type === 'meriterande' ? 'låg' : 'medel',
      match: 'delvis',
      note: '',
      howToAddress: '',
    })
  }
  for (const g of ga.criticalGaps) {
    out.push({
      requirement: g.skill ?? '',
      importance: 'hög',
      match: 'svag',
      note: g.reason ?? '',
      howToAddress: g.howToAddress ?? '',
    })
  }
  return out
}

/**
 * Delar upp requirements i buckets. REN funktion.
 *   styrkor    = match 'stark'
 *   förbered   = match 'delvis', ELLER ('svag' & importance 'låg')
 *   prioritera = match 'svag' & importance ('hög'|'medel')
 *   coverage   = antal 'stark' / antal requirements (0 om tomt)
 * Reconciliation: styrkor + förbered + prioritera === requirements.length.
 * Okända match/importance-värden normaliseras (match→'delvis', importance→'medel').
 */
export function deriveGapBuckets(requirements = []) {
  const reqs = (Array.isArray(requirements) ? requirements : []).map((r) => ({
    ...r,
    match: MATCH.includes(r?.match) ? r.match : 'delvis',
    importance: IMPORTANCE.includes(r?.importance) ? r.importance : 'medel',
  }))

  const styrkor = reqs.filter((r) => r.match === 'stark')
  const prioritera = reqs.filter((r) => r.match === 'svag' && (r.importance === 'hög' || r.importance === 'medel'))
  const förbered = reqs.filter((r) => r.match === 'delvis' || (r.match === 'svag' && r.importance === 'låg'))

  const total = reqs.length
  return {
    styrkor,
    förbered,
    prioritera,
    coverage: total > 0 ? styrkor.length / total : 0,
    total,
  }
}

/**
 * Täckning för uppdragskortens "Matchning"-badge (Home/Konsult/Pending).
 * Hanterar både nya (requirements) och gamla (gapAnalysis) jobb.
 * covered = antal starkt matchade krav, total = antal krav.
 */
export function coverageFromJob(job) {
  const b = deriveGapBuckets(resolveRequirements(job))
  return { covered: b.styrkor.length, total: b.total, ratio: b.coverage }
}
