// ── Uppdragsbeskrivning (rena hjälpare) ───────────────────────────────────
//
// Hjälpare för att rensa råbeskrivningen och plocka ut "Om uppdraget"-fakta.
// Inga IO/React-beroenden – enhetstestbara.

const PREFIX_RE = /^\s*uppdragsbeskrivning\s*:?\s*/i

/**
 * Rensar råbeskrivningen:
 *  - strippar ett eller flera ledande "Uppdragsbeskrivning:"-prefix (dubblerade)
 *  - trimmar, men BEVARAR interna radbrytningar
 */
export function cleanJobDescription(raw) {
  if (typeof raw !== 'string') return ''
  let text = raw.replace(/\r\n/g, '\n').trim()
  // Ta bort upprepade ledande prefix ("Uppdragsbeskrivning: Uppdragsbeskrivning: …")
  while (PREFIX_RE.test(text)) {
    const next = text.replace(PREFIX_RE, '')
    if (next === text) break
    text = next.trim()
  }
  return text
}

/**
 * Bygger "Om uppdraget"-fakta. Använder job.quickFacts när det finns och
 * faller tillbaka på job.company / job.jobTitle för äldre jobb. Tomma fält
 * filtreras bort så boxen aldrig visar tomrum (eller kraschar).
 *
 * @returns {Array<{ label: string, value: string }>}
 */
export function resolveQuickFacts(job) {
  const qf = (job && typeof job.quickFacts === 'object' && job.quickFacts) || {}
  const facts = [
    { label: 'Kund',  value: qf.kund ?? job?.company ?? '' },
    { label: 'Roll',  value: qf.roll ?? job?.jobTitle ?? '' },
    { label: 'Miljö', value: qf.miljö ?? qf.miljo ?? '' },
    { label: 'Fokus', value: qf.fokus ?? '' },
  ]
  return facts.filter((f) => typeof f.value === 'string' && f.value.trim())
}

const BULLET_RE = /^[-•*–·▸▪]\s+/

function isHeadingLine(line) {
  // Rubrikliknande: kort rad som slutar med kolon, ELLER kort versalrad utan gemener.
  if (/:$/.test(line) && line.length <= 60) return true
  if (!/[a-zåäö]/.test(line) && /[A-ZÅÄÖ]/.test(line) && line.length >= 3 && line.length <= 60) return true
  return false
}

/**
 * Parsar råbeskrivningen till block för rendering – BEVARAR radbrytningar
 * (kollapsar dem inte till en vägg). Tom rad avslutar ett stycke.
 * Rubrikliknande rader → heading, punktrader → list, övrigt → paragraph
 * (vars text kan innehålla \n och renderas med whitespace-pre-line).
 *
 * @returns {Array<{type:'heading',text}|{type:'list',items}|{type:'paragraph',text}>}
 */
export function parseJobDescription(raw) {
  const text = cleanJobDescription(raw)
  if (!text) return []

  const blocks = []
  let para = null
  const flushPara = () => {
    if (para && para.length) blocks.push({ type: 'paragraph', text: para.join('\n') })
    para = null
  }

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) { flushPara(); continue }

    if (BULLET_RE.test(line)) {
      flushPara()
      const item = line.replace(BULLET_RE, '')
      const last = blocks[blocks.length - 1]
      if (last && last.type === 'list') last.items.push(item)
      else blocks.push({ type: 'list', items: [item] })
    } else if (isHeadingLine(line)) {
      flushPara()
      blocks.push({ type: 'heading', text: line.replace(/:$/, '') })
    } else {
      if (!para) para = []
      para.push(line)
    }
  }
  flushPara()
  return blocks
}
