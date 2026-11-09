// Bevisar att ett ansiktslyft BARA rör utseendet.
//
// Jämför varje ändrad .js/.jsx under src/ mot en bas-ref (default: main).
// Båda versionerna parsas till AST och normaliseras genom att ta bort det som
// enbart styr utseende:
//   - JSX-attributen className, style och data-theme
//   - strängar/template-delar som innehåller ett färgvärde (#hex, rgb(a), var(--…))
//   - värdet i tilldelningar till `x.style.prop = …` (hover-handlers)
// Är resten identiskt är filen OK. Annars listas filen för manuell granskning.
//
// Kör: node scripts/check-facelift.mjs [bas-ref]
import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { parse } from '@babel/parser'

const base = process.argv[2] || 'main'
const files = execSync(`git -c core.quotepath=false diff --name-only ${base} -- src`, { encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.(jsx?|mjs)$/.test(f))

const STYLE_ATTRS = new Set(['className', 'style', 'data-theme', 'stroke', 'fill'])
const COLORISH = /#[0-9a-fA-F]{3,8}\b|rgba?\(|var\(--/
const DROP_KEYS = new Set(['start', 'end', 'loc', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments', 'range'])

function parseSource(src) {
  return parse(src, { sourceType: 'module', plugins: ['jsx'] })
}

function isStyleAssignment(node) {
  // e.currentTarget.style.color = '…'
  const left = node.left
  return (
    left?.type === 'MemberExpression' &&
    left.object?.type === 'MemberExpression' &&
    left.object.property?.name === 'style'
  )
}

function normalize(node) {
  if (Array.isArray(node)) return node.map(normalize).filter((n) => n !== undefined)
  if (!node || typeof node !== 'object') return node
  if (node.type === 'JSXAttribute' && STYLE_ATTRS.has(node.name?.name)) return undefined
  if (node.type === 'StringLiteral' && COLORISH.test(node.value)) return { type: 'StyleValue' }
  if (node.type === 'TemplateLiteral' && node.quasis.some((q) => COLORISH.test(q.value.raw))) {
    return { type: 'StyleValue' }
  }
  if (node.type === 'AssignmentExpression' && isStyleAssignment(node)) {
    return { type: 'StyleAssignment', left: normalize(node.left) }
  }
  const out = {}
  for (const [k, v] of Object.entries(node)) {
    if (DROP_KEYS.has(k)) continue
    const n = normalize(v)
    if (n !== undefined) out[k] = n
  }
  return out
}

let failed = 0
for (const file of files) {
  if (!existsSync(file)) {
    console.log(`?  ${file} (borttagen)`)
    failed++
    continue
  }
  let before
  try {
    before = execSync(`git show ${base}:"${file}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })
  } catch {
    console.log(`+  ${file} (ny fil – granska manuellt)`)
    continue
  }
  const a = JSON.stringify(normalize(parseSource(before).program))
  const b = JSON.stringify(normalize(parseSource(readFileSync(file, 'utf8')).program))
  if (a === b) {
    console.log(`OK ${file}`)
  } else {
    console.log(`!! ${file} – ändrad utöver utseende, granska manuellt`)
    failed++
  }
}
console.log(failed ? `\n${failed} fil(er) kräver manuell granskning.` : '\nAlla ändringar är rent utseende.')
process.exit(failed ? 1 : 0)
