import { execFileSync } from 'node:child_process'

const [, , repo, pkgPrefix, ...changed] = process.argv

const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let raw = ''
for await (const chunk of process.stdin) raw += chunk
if (!raw.trim()) process.exit(0)

let report
try {
  report = JSON.parse(raw)
} catch {
  console.log(`${DIM}dependency-cruiser produced no parseable output${RESET}`)
  process.exit(0)
}

const touched = new Set(changed)
const violations = report.summary?.violations ?? []

// dependency-cruiser paths are package-relative; the changed-file list is repo-relative.
const abs = (p) => `${pkgPrefix}/${p}`

const mine = violations.filter((v) => touched.has(abs(v.from)))

if (mine.length === 0) {
  const hidden = violations.length
  console.log(`${DIM}no dependency violations from your changed files${RESET}`)
  if (hidden > 0) {
    console.log(`${DIM}${hidden} pre-existing violation(s) elsewhere hidden${RESET}`)
  }
  process.exit(0)
}

const cycles = mine.filter((v) => v.rule.name === 'no-circular')
const rest = mine.filter((v) => v.rule.name !== 'no-circular')

for (const v of rest) {
  console.log(`${BOLD}${abs(v.from)}${RESET}`)
  console.log(`  ${YELLOW}${v.rule.name}${RESET}  →  ${abs(v.to)}`)
}

for (const v of cycles) {
  const path = (v.cycle ?? []).map((c) => (typeof c === 'string' ? c : c.name))
  console.log(`${BOLD}${abs(v.from)}${RESET}`)
  console.log(`  ${YELLOW}no-circular${RESET}  ${path.length} hop cycle`)
  if (path.length) console.log(`    ${DIM}${path.join(' → ')}${RESET}`)
}

console.log(`\n${BOLD}${mine.length} violation(s)${RESET} from your changed files`)
const hidden = violations.length - mine.length
if (hidden > 0) console.log(`${DIM}${hidden} pre-existing violation(s) elsewhere hidden${RESET}`)
