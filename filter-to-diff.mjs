import { execFileSync } from 'node:child_process'
import { relative } from 'node:path'

const [, , base, repo, mode] = process.argv

const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

const changedLines = new Map()

if (mode !== 'whole') {
  const diff = execFileSync(
    'git',
    ['diff', '--unified=0', '--diff-filter=ACMR', `${base}...HEAD`],
    { cwd: repo, maxBuffer: 1 << 28, encoding: 'utf8' }
  )

  let current = null
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      current = line.slice(6)
      changedLines.set(current, new Set())
      continue
    }
    if (current && line.startsWith('@@')) {
      const m = /\+(\d+)(?:,(\d+))?/.exec(line)
      if (!m) continue
      const start = Number(m[1])
      const count = m[2] === undefined ? 1 : Number(m[2])
      const set = changedLines.get(current)
      for (let i = 0; i < count; i++) set.add(start + i)
    }
  }

  // Uncommitted work is part of "what I am about to put up for review".
  const unstaged = execFileSync('git', ['diff', '--unified=0', '--diff-filter=ACMR', 'HEAD'], {
    cwd: repo,
    maxBuffer: 1 << 28,
    encoding: 'utf8'
  })
  current = null
  for (const line of unstaged.split('\n')) {
    if (line.startsWith('+++ b/')) {
      current = line.slice(6)
      if (!changedLines.has(current)) changedLines.set(current, new Set())
      continue
    }
    if (current && line.startsWith('@@')) {
      const m = /\+(\d+)(?:,(\d+))?/.exec(line)
      if (!m) continue
      const start = Number(m[1])
      const count = m[2] === undefined ? 1 : Number(m[2])
      const set = changedLines.get(current)
      for (let i = 0; i < count; i++) set.add(start + i)
    }
  }
}

let raw = ''
for await (const chunk of process.stdin) raw += chunk
if (!raw.trim()) process.exit(0)

if (mode === 'tsc' || mode === 'tsc-whole') {
  const seen = new Set()
  const byFile = new Map()
  for (const line of raw.split('\n')) {
    const m = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line.trim())
    if (!m) continue
    const [, file, lineNo, col, code, msg] = m
    if (mode === 'tsc' && !changedLines.get(file)?.has(Number(lineNo))) continue
    const key = `${file}:${lineNo}:${col}:${code}`
    if (seen.has(key)) continue
    seen.add(key)
    if (!byFile.has(file)) byFile.set(file, [])
    byFile.get(file).push(`  ${DIM}${`${lineNo}:${col}`.padEnd(9)}${RESET}${msg}  ${DIM}${code}${RESET}`)
  }
  if (byFile.size === 0) {
    console.log(`${DIM}nothing on changed lines${RESET}`)
  } else {
    const out = []
    for (const [file, lines] of byFile) out.push(`${BOLD}${file}${RESET}\n${lines.join('\n')}`)
    console.log(out.join('\n\n'))
    console.log(
      `\n${DIM}note: this is the full type-check under the stricter flag, so a few` +
        ` pre-existing errors unrelated to indexed access can show up too.${RESET}`
    )
  }
  process.exit(0)
}

const results = JSON.parse(raw)

const TERSE = {
  '@typescript-eslint/no-floating-promises': 'Floating promise — a rejection here goes nowhere',
  '@typescript-eslint/await-thenable': 'Awaiting a non-promise',
  '@typescript-eslint/no-misused-promises': 'Promise used where a plain value was expected'
}

const short = (m) => {
  const terse = TERSE[m.ruleId]
  if (terse) return terse
  return m.message.replace(/\s+/g, ' ').replace(/\.$/, '')
}

let errors = 0
let warnings = 0
let suppressed = 0
const blocks = []

for (const result of results) {
  const rel = relative(repo, result.filePath)
  const touched = changedLines.get(rel)

  const kept = result.messages.filter((m) => {
    if (m.severity === 0) return false
    if (mode === 'whole') return true
    if (!touched) return false
    return touched.has(m.line)
  })

  suppressed += result.messages.filter((m) => m.severity > 0).length - kept.length
  if (kept.length === 0) continue

  const lines = kept.map((m) => {
    if (m.severity === 2) errors++
    else warnings++
    const label = m.severity === 2 ? `${RED}error${RESET}` : `${YELLOW}warn ${RESET}`
    const loc = `${m.line}:${m.column}`.padEnd(9)
    return `  ${DIM}${loc}${RESET}${label}  ${short(m)}  ${DIM}${m.ruleId}${RESET}`
  })

  blocks.push(`${BOLD}${rel}${RESET}\n${lines.join('\n')}`)
}

if (blocks.length) console.log(blocks.join('\n\n') + '\n')

const total = errors + warnings
if (total === 0) {
  console.log(`${DIM}no findings on changed lines${RESET}`)
} else {
  console.log(`${BOLD}${total} finding(s)${RESET} — ${RED}${errors} error${RESET}, ${YELLOW}${warnings} warning${RESET}`)
}
if (suppressed > 0 && mode !== 'whole') {
  console.log(`${DIM}${suppressed} pre-existing finding(s) on untouched lines hidden — use --whole-file to see them${RESET}`)
}

process.exit(errors > 0 ? 1 : 0)
