---
name: toolbox
description: >
  Run the personal Toolbox CLIs (precheck / typecov / proptest, at ~/Documents/toolbox) over a diff
  and act on what they find — choosing the right flags for the change, separating real defects from
  this codebase's known systemic noise, fixing the mechanical ones, and reporting only the judgment
  calls. Use whenever the user is about to open a PR or push a branch, says "run the toolbox", "run
  precheck", "check my diff", "prep this PR", "is this ready for review", "clean this up before I
  push", or hands over precheck/typecov output and asks what to do about it. Also use when a change
  touches async delivery paths, notification fan-outs, or array/record indexing, where these tools
  catch bugs that reading the diff will not.
---

# Toolbox triage

The Toolbox reports; this decides. Raw output is worthless if half of it is systemic noise the user
already ruled out — the value is in knowing which findings are real *in this codebase*.

The tools live at `~/Documents/toolbox`, outside the instatus repo on purpose. Never add them
to the repo, never suggest putting them in CI, never edit the repo's eslint config to match. If a
rule needs changing, change `~/Documents/toolbox/eslint.personal.mjs`.

This skill owns **tool-detectable** defects: types, promises, complexity, cycles, duplication.
House style, PR scope, and blast radius belong to the `baraa` skill. Hand off rather than duplicate.

## Pass 0 — pick the flags

A bare run takes ~35s on 200 files; `--deps` can add minutes across many backend modules. Match the
cost to the change instead of reflexively running `--full`.

```bash
precheck                    # always
```

Add, based on what the diff touches:

| Condition | Flag | Why |
|---|---|---|
| any `packages/backend/src/modules/` file | `--deps` | cycles and cross-module coupling |
| array/record indexing, `.find()`, destructuring | `--strict` | `noUncheckedIndexedAccess` finds the nullability |
| large diff, or code moved between files | `--dupes` | catches paste-and-diverge |
| one file under real scrutiny | `--pedantic` | too noisy for a whole diff |

`--whole-file` is diagnostic only. Findings on lines the user didn't touch are **not this PR's
job** — fixing them inflates the diff, which is exactly what `baraa` penalises. Use it to
understand a file, never as a worklist.

If the run reports more than ~400 files, the base is wrong. Local `main` in this repo goes stale for
months; suggest `--base origin/main` or a closer ref rather than triaging 3000 files.

## Pass 1 — triage before fixing

Read every finding against this table first. Fixing top-to-bottom without triage produces churn on
things the user deliberately left alone.

**`no-floating-promises` — the flagship rule, and the one needing the most judgment.**

It is **one-directional**: it fires on promises you didn't await, and has nothing to say about
awaiting something you shouldn't have. Nothing in typescript-eslint flags six sequential Graph calls
blocking a user-facing mutation. Reading its guidance as "await by default" is how that bug ships.

The other direction now has its own rule here — `critical-path/no-blocking-remote-await`
(`~/Documents/toolbox/rules/no-blocking-remote-await.mjs`), added 2026-08-11 after PR #1214 shipped
`await provisionIncidentChannel(...)` inside `createIncident`: one line, ~9 sequential Microsoft
round trips, all on the incident-create spinner. It warns when a use-case or API handler awaits a
call imported from an integration/vendor module, keyed on **import source**, not types.

It does not decide anything — "does the response need this value?" is still a product question. It
produces the worklist and forces an answer in code: defer with `runEffect()`, or
`eslint-disable-next-line` with the reason. `modules/integrations/**` is exempt, because a Slack
handler awaiting a Slack post *is* its response; that exemption is what takes it from 101 hits
across the backend to 7. Verified it fires on the pre-fix `create.ts:338` and stays quiet on the
`runEffect` version.

Where it fires changes what it means:

- **Inside an Express route handler** (`app.get('/x', async (req, res) => …)`) — systemic. Every
  route in this backend is written this way; it's one repo-wide decision (Express 5 or
  `express-async-errors`), not a per-PR fix. Mention it once if the diff adds routes; don't fix inline.
- **In a notification fan-out, job, queue worker, or Temporal activity** — real, and the reason the
  rule is on. A dropped rejection here means deliveries silently vanish.
- **Immediately before `res.send('success')` or an equivalent** — real and high value: the response
  claims an outcome nobody waited for.
- **In a React effect or handler** — usually intentional fire-and-forget, but it still needs a
  `.catch`, or the failure never surfaces.

Everything else:

| Finding | What it usually means | Do |
|---|---|---|
| `await-thenable` | the API was misread | check the signature, then fix |
| `no-misused-promises` (`if (promise)`) | always a bug — the check is meaningless | fix |
| `critical-path/no-blocking-remote-await` | a vendor call is blocking a user-facing response | open the callee, count **remote** hops (a wrapper is not a hop), then defer with `runEffect()` or disable with the reason. Never silently disable |
| `sonarjs/cognitive-complexity` | genuinely hard to hold in your head | report; extraction is a design call |
| `sonarjs/no-nested-conditional` | violates the CLAUDE.md ternary rule | fix directly |
| `react-hooks/exhaustive-deps` | sometimes a real stale closure, sometimes a render loop if "fixed" | report — never blindly add deps |
| `react-hooks/rules-of-hooks` | always real | fix |
| `useTRPC` in a component | should be a `resolvers/` hook | fix if small, report if it means a new resolver |
| Prisma imported in `modules/*/api/` | logic belongs in a use-case | report — usually a refactor, not an edit |
| `no-circular` | almost always pre-existing | act only if this branch created it |
| jscpd duplication | sometimes deliberate | report with both locations; let the user decide |
| `TS2532` / `TS18048` under `--strict` | real nullability the normal build hides | fix with a guard |

## Pass 2 — fix, with the right shape

**Floating promise.** Decide whether the caller should wait:

```ts
await deliverBatch(subscribers)                              // caller depends on the result
void deliverBatch(subscribers).catch((err) =>                // genuinely fire-and-forget
  logger.error({ err }, 'teams delivery failed')
)
```

A bare `void` with no `.catch` silences the linter and keeps the bug. That is worse than the
original, because now it looks handled. If fire-and-forget is intentional, the `.catch` is the fix.

**Indexed access.** Guard or early-return; don't reach for `!`:

```ts
const first = items[0]
if (!first) return null
```

`!` asserts something the types just told you isn't true — it converts a caught bug back into an
uncaught one.

**Suppression.** If a finding genuinely can't be fixed now, `@ts-expect-error` with a description,
never `@ts-ignore`. The former turns into an error once the underlying problem is fixed, so it
removes itself; the latter lingers as a lie.

Match the surrounding code's style, and don't reformat lines the change didn't touch.

## Pass 3 — type coverage

After meaningful backend work:

```bash
typecov backend
```

Below the floor means new `any` entered the diff — find it rather than lowering the bar. Above the
floor is worth `typecov backend bump` so the gain can't silently regress. **Never bump to make a
failure pass**; the floor is only useful if it ratchets one way.

## Pass 4 — properties, when they fit

If the change touches a pure function with an invariant that can be stated in a sentence — round
trips, idempotence, "output never longer than input", ordering — a property test finds edge cases
examples miss:

```bash
proptest
```

Probes live in `~/Documents/toolbox/proptests/`, importing repo source through vite aliases.
`fast-check` deliberately isn't a repo dependency, so these can't be committed. When a probe finds a
failure, commit a plain vitest case for the shrunk input into the repo's real test suite — that's
the artifact that survives.

Skip this for I/O-shaped code; there's no invariant to state.

## Reporting

Lead with what changed, not with a wall of tool output. The user has already seen raw findings and
found them unusable — the value added here is the sorting.

```
Fixed (N)
  path/file.ts:LINE  what and why, in one line

Needs your call (N)
  path/file.ts:LINE  the finding, the tradeoff, and a recommendation

Known systemic, not fixed (N)
  one line naming the class and why it isn't this PR's problem

Not run: <flag> — <why it wasn't worth the time>
```

If nothing needs the user's judgment, say so plainly in a sentence rather than padding the report.
State pre-existing counts only as a number; listing them invites scope creep.

When the diff is ready on the tool axis, suggest `baraa` for the house-style and scope pass. The two
are complementary and shouldn't be run as one blob — findings from different axes need different
kinds of attention.
