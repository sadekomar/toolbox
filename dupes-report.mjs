import { relative } from 'node:path'

const [, , repo] = process.argv

const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let raw = ''
for await (const chunk of process.stdin) raw += chunk
if (!raw.trim()) {
  console.log(`${DIM}no duplication report produced${RESET}`)
  process.exit(0)
}

let report
try {
  report = JSON.parse(raw)
} catch {
  console.log(`${DIM}no duplication report produced${RESET}`)
  process.exit(0)
}

const dupes = report.duplicates ?? []
if (dupes.length === 0) {
  console.log(`${DIM}no duplicated blocks among your changed files${RESET}`)
  process.exit(0)
}

const rel = (p) => relative(repo, p)

for (const d of dupes) {
  const a = `${rel(d.firstFile.name)}:${d.firstFile.start}-${d.firstFile.end}`
  const b = `${rel(d.secondFile.name)}:${d.secondFile.start}-${d.secondFile.end}`
  console.log(`${YELLOW}${d.lines} duplicated lines${RESET}`)
  console.log(`  ${BOLD}${a}${RESET}`)
  console.log(`  ${BOLD}${b}${RESET}`)
}

console.log(`\n${BOLD}${dupes.length} duplicated block(s)${RESET} within your changed files`)
