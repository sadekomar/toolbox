# Toolbox

Personal CLIs for working in the instatus repo, living entirely outside it. Nothing to
commit, nothing to justify in review.

```bash
toolbox                 # the roster
toolbox <name> [args]   # run one
toolbox help <name>     # that tool's own --help
```

Each tool is also on PATH directly:

```bash
precheck                # findings on lines you changed vs origin/main
precheck --strict       # + a noUncheckedIndexedAccess type-check pass
precheck --deps         # + backend module boundaries and import cycles
precheck --dupes        # + copy-paste detection within your changed files
precheck --full         # all three
precheck --pedantic     # + no-unnecessary-condition and require-await
precheck --whole-file   # include pre-existing findings on untouched lines
precheck --all <path>   # audit a directory instead of a diff
precheck --base <ref>   # compare against something other than origin/main

typecov backend         # type-coverage against a recorded floor
typecov backend bump    # raise the floor to the current number

proptest                # run property-test probes against repo source
git dft <ref>           # syntax-aware diff (difftastic)
```

## Why it exists

The repo's shared ESLint preset is `eslint-config-next` v12 plus prettier — no
`typescript-eslint` rules at all. This runs a stricter, type-aware pass from outside,
using its own ESLint 9 and its own `node_modules`.

Everything is diff-scoped: findings are filtered to the lines you actually touched,
with a count of hidden pre-existing ones printed at the end.

## Stages

**ESLint (always)** — type-aware robustness, readability, house style.

| Group | Rules |
|---|---|
| Robustness (error) | `no-floating-promises`, `await-thenable`, `no-misused-promises` |
| Readability (warn) | `sonarjs/cognitive-complexity` (15), `no-nested-conditional`, `no-identical-functions`, `no-duplicated-branches`, `no-collapsible-if`, `prefer-immediate-return` |
| React (warn/error) | `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps` |
| House style (warn) | no `../../../`, no `packages/backend/src` imports, no `useTRPC` in components, no Prisma value-imports in `modules/*/api/`, `@ts-expect-error` over `@ts-ignore` |

**`--deps`** — dependency-cruiser over the backend: import cycles, use-cases importing
Express/tRPC, one module reaching into another module's `use-cases/`, orphans.

**`--dupes`** — jscpd across your changed non-test files, 8+ lines / 70+ tokens.

**`--strict`** — `tsc --noUncheckedIndexedAccess` on affected packages.

## Deliberately off

- `no-unnecessary-condition` — 219 hits on one branch, mostly optional-chain nits.
  Behind `--pedantic`.
- `no-misused-promises` `checksVoidReturn` — every Express route here is
  `async (req, res)`. Real concern, one repo-wide decision, not a per-PR finding.
- `require-await` — mostly interface conformance. Behind `--pedantic`.
- **Cross-module `helpers/`** — 134 hits vs 2 for `use-cases/`. Shared helpers
  (`activity-dal`, `log-activity`, `get-workspace-plan`) are the intended design here,
  so the dep-cruiser rule covers `use-cases/` only.
- Test files are exempt from cognitive complexity, identical-functions, and jscpd.

## proptest

`fast-check` cannot go in the repo's test files — that would mean committing the
dependency. Instead `proptests/` here imports repo source through vite aliases and runs
on the toolbox's own vitest. Use it to *hunt* for bugs; when it finds one, commit a
plain vitest case for the shrunk input.

## Notes

- Default base is `origin/main`, and it fetches first. Local `main` in this repo goes
  stale for months, which silently turns the diff into thousands of files.
- `difft` is wired as a difftool (`git dft`), deliberately **not** as `diff.external` —
  that would break the `git diff` parsing `precheck` relies on.
- macOS ships bash 3.2, so no `mapfile` in these scripts.
- The `--strict` pass runs a full type-check with the flag on, so a few pre-existing
  errors unrelated to indexed access can appear alongside the real ones.
- Exit code is 1 when there are errors, so it can gate a commit if you ever want that.

## Not included, and why

- **react-scan** — a runtime tool. `npx react-scan@latest http://localhost:9000`
  against a running dev server; there is nothing to install or diff-scope.
- **size-limit** — needs a committed config plus a production build of each app to
  compare against. Doesn't fit a personal diff-scoped pass.
- **danger.js** — its value is posting PR comments from CI. `danger local` works but
  only duplicates what `precheck` already reports.

## Adding a tool

1. Drop an executable in `bin/`.
2. Add an entry to `tools.json` — `name`, `summary`, `usage`.
3. `ln -sf ~/Documents/toolbox/bin/<name> ~/.local/bin/<name>` if you want it
   directly on PATH as well as under `toolbox <name>`.
4. `cp README.md ~/Documents/dojo/runbooks/toolbox.md && node ~/Documents/dojo/build-hub.mjs`

`tools.json` is the single roster: the `toolbox` command and the Dojo section both read
it, so one edit updates both.

## Maintenance

Deps are pinned in `package.json` here. `npm update` in this directory; it cannot
affect the repo's `node_modules`.
