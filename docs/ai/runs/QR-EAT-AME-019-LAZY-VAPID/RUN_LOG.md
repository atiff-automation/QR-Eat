# Run Log — QR-EAT-AME-019-LAZY-VAPID

**Title:** Configure VAPID lazily so builds need no runtime secret
**Type:** bug (build/CI)
**Risk:** R1
**Spec level:** L2
**Owner:** Atiff
**Date:** 2026-11-20
**Branch/commit:** `fix/ame-019-lazy-vapid` (base `main` `06807c2`); not
committed
**Task revision:** 1
**Approved revision:** 1 (2026-11-20, Atiff; revision 1 as presented)
**Task contract:** `TASK.md`
**Resume bookmark:** `NEXT.md`
**Latest review:** —

## Request

Close `AME-019`: CI `Build` has failed on every run, including `main`, because the
repository has no `VAPID_PRIVATE_KEY` secret and the push service throws at
module import. Plan the fix and stop for owner approval.

## Classification

- Type: BUG. The build requires a runtime credential at module load; nothing about
  the application logic is wrong.
- Risk R1: build/CI only. With VAPID configured, runtime behaviour is unchanged;
  without it, push already is best-effort at the call site.
- Level L2: one service module, a new focused test file, and the stale baseline
  facts in two docs. No route, workflow, schema or contract change.

## Scope

In scope:

- lazy VAPID configuration with one-time setup and a logged no-op when absent;
- import safety (no throw at load);
- focused tests for both directions;
- baseline facts in `AGENTS.md` and `PROJECT_PROFILE.md`;
- branch CI run as the release gate.

Non-goals:

- repository or workflow secrets; `.github/workflows/ci.yml` changes;
- push behaviour when configured, service worker, client subscription flow;
- staff SSE, pub/sub, contract, auth, payments;
- deploy, migration, seed.

## Context

**Context budget used:**

- Must read: `AGENTS.md`, `PROJECT_PROFILE.md`, the push service, the CI
  workflow, the route import site.
- Read only if unclear: AME-015 REVIEW-03 CI note; existing web-push mocks.
- Not read: the wider repository, `../Tabtep-App`, `.env*`, generated output.

## Investigation / specification

Confirmed at `main` `06807c2`:

1. `push-notification-service.ts:19-32` reads VAPID env vars and calls
   `webpush.setVapidDetails(...)` at import; it throws when any is missing.
2. The only import is `src/app/api/events/orders/route.ts:23`. Next evaluates the
   route during page-data collection, which is where `next build` dies:
   `Missing VAPID configuration ... Failed to collect page data for
   /api/events/orders`.
3. `.github/workflows/ci.yml:29-31` inlines the public key and subject but uses
   `secrets.VAPID_PRIVATE_KEY`; `gh secret list` returns nothing, so the value is
   empty on every run.
4. CI type-check and the full test suite pass on Node 20; only Build fails. These
   are environmental, not caused by AME-015/016.
5. Railway builds succeed because production has the real values, so the defect
   is invisible until CI or a fresh local build.
6. Push is invoked best-effort after the SSE frame (`sendToRestaurant(...).catch`),
   so a no-op push cannot affect the stream.
7. Project baseline docs are stale: 524 tests / 62 lint errors claimed; measured
   on 2026-11-19: 1667 passed / 11 skipped, 61 lint errors. Correct in S4.

## Plan

1. Replace module-level configuration with a lazy helper: read env at first use,
   validate, call `setVapidDetails` once, cache the outcome, never throw to a
   send caller.
2. Send paths degrade to a logged no-op when unconfigured or invalid; configured
   path unchanged including 410/404 cleanup.
3. Focused tests: import safety, both no-op shapes, configured path, malformed
   keys.
4. Correct the baseline facts in the two project docs with measured numbers.
5. Push the branch, require a green CI run (Build included), then stop at the
   commit/merge gate.

## Approvals

| Gate | What was approved | Approved by | Date | Conditions |
|---|---|---|---|---|
| Design/plan | Revision 1 as presented: D1–D7, S0–S4 | Atiff | 2026-11-20 | Approval hash `dd0e4a28…` (pre-stamp content) |
| Build | Bounded implementation by one `ame-implementer` | Atiff | 2026-11-20 | Covered by the revision-1 approval |
| Commit | — | — | — | Not requested; R1 still uses the review + commit gate |
| Release | — | — | — | Out of scope; merge/deploy decided after a green CI run |

## Commit gate

- [x] Review PASS (REVIEW-01, PASS WITH NOTES; AC5 pending)
- [x] Exact path list published (`TASK.md` commit gate, 14 files)
- [x] Exact commit message published
- [x] Human approved (Atiff, 2026-11-20; commit + branch push for CI)
- [x] No unrelated changes

## Execution

Files changed:

- `docs/ai/runs/QR-EAT-AME-019-LAZY-VAPID/TASK.md` (new)
- `docs/ai/runs/QR-EAT-AME-019-LAZY-VAPID/RUN_LOG.md` (new)
- `docs/ai/runs/QR-EAT-AME-019-LAZY-VAPID/NEXT.md` (new)

Commands run:

```text
grep -rn "VAPID" src prisma .github
sed -n '1,90p' src/lib/push-notification-service.ts
gh secret list          -> empty
gh run list --branch main -> last six runs all failure (Build step)
```

## Verification

Verdict: not started (planning)

Findings:

- Root cause confirmed by code, workflow and CI history.

Not verified:

- Local reproduction of the build failure without VAPID env (belongs to the
  implementation task's baseline step).

## Residual risk

- Push becomes a silent no-op (one warning) if VAPID is missing at runtime,
  instead of crashing at import. That is the intended trade; the warning is the
  signal.
- `AME-017` remains deferred.

## Release

- Deployed: no
- Smoke test: n/a
- Rollback: n/a
- Monitoring: n/a

## Lessons

- What worked: the CI failure was diagnosed from logs plus `gh secret list`, not
  guessed.
- What to change: builds should never require runtime credentials; treat any
  build-time secret dependency as a defect.
- Follow-ups: pilot pre-gate; `AME-013` harness; `AME-017` deferred.

## Implementation evidence

**Implementer:** ame-implementer (subagent session, DeepSeek V4.1 Flash)
**Date:** 2026-11-20
**Branch:** `fix/ame-019-lazy-vapid` (base `main` `06807c2`)
**Task revision:** 1 (approved), scope S0–S4 only

### Files changed

```text
src/lib/push-notification-service.ts            (lazy VAPID + degradation)
src/tests/push-notification-config.test.ts      (new, 11 tests)
AGENTS.md                                       (baseline facts only)
docs/ai/PROJECT_PROFILE.md                      (baseline facts only)
docs/ai/runs/QR-EAT-AME-019-LAZY-VAPID/evidence/S0-baseline.md
docs/ai/runs/QR-EAT-AME-019-LAZY-VAPID/evidence/S1-S2-implementation.md
docs/ai/runs/QR-EAT-AME-019-LAZY-VAPID/evidence/S3-tests.md
docs/ai/runs/QR-EAT-AME-019-LAZY-VAPID/evidence/S4-baseline-docs.md
```

`docs/ai/ACTIVE.md` and `docs/ai/BACKLOG.md` were already modified before this
session and were not touched. `TASK.md`, `NEXT.md`, `route.ts` and
`.github/workflows/ci.yml` untouched.

### Commands and results

```text
Pre-fix (CI-faithful copy, no .env*, no VAPID env):
  npm run build                      -> FAIL, "Missing VAPID configuration",
                                        Failed to collect page data for /api/events/orders
  npx tsx require(service)           -> throws Missing VAPID configuration
  npx jest push-notification-config  -> 9 failed, 2 passed (red-capable)

Pre-fix baseline (primary worktree):
  npm test -- --runInBand            -> PASS, 1667 passed, 11 skipped, 139 suites
  npm run type-check                 -> PASS
  npm run lint                       -> FAIL, 61 errors, 11 warnings

Post-fix:
  npx jest src/tests/push-notification-config.test.ts --runInBand
                                     -> PASS, 11/11
  npm test -- --runInBand            -> PASS, 1678 passed, 11 skipped, 140 suites
  npm run type-check                 -> PASS
  npm run lint                       -> FAIL, 61 errors, 11 warnings (unchanged)
  npx next lint --file <owned files> -> No ESLint warnings or errors (both)
  npx prettier --check <owned files> -> clean
  CI-faithful build, no VAPID env    -> PASS (exit 0, /api/events/orders collected)
  primary build, env -u VAPID_*      -> PASS (exit 0)
```

Deviations: none in product scope. Local Node is v24.15.0; CI pins Node 20, so
the branch CI run remains the release gate (D7). The pre-fix defect only
reproduces without a `.env`, so the baseline failure was captured in a
`/tmp` copy with hard-linked `node_modules` and no `.env*`; a symlinked
`node_modules` produced a false pass because Prisma's env loader followed the
link to the primary `.env` (documented in the S0 evidence).

Residual risks: as recorded in the task — push is a silent no-op (one warning)
when VAPID is absent at runtime; the cached outcome means adding env later needs
a restart; CI run on the branch is still pending and is the release gate.

## Lead check — 2026-11-20

- **Diff scope:** `src/lib/push-notification-service.ts` (+86/−26 across the file),
  the new `src/tests/push-notification-config.test.ts`, the measured baseline
  facts in `AGENTS.md` and `docs/ai/PROJECT_PROFILE.md`, and the run directory.
  `src/app/api/events/orders/route.ts`, `.github/workflows/ci.yml`,
  `prisma/**`, auth, payments and `src/sw.ts` are unchanged.
- **Import safety (D1):** the module-level read/throw/`setVapidDetails` is gone;
  the top level only declares the env-var list, the cache and the helper.
- **Lazy configuration (D3):** one cache per process, presence checked then format
  delegated to `webpush.setVapidDetails`, success and failure both cached, one
  log line on failure, no secret material logged.
- **Degradation (D4/D5):** the config check runs before endpoint validation and
  before any Prisma query in `sendNotification`, `sendToRestaurant` and
  `sendToUser`, so an unconfigured process performs no reads, no writes and no
  subscription deletion. The configured path below the check is unchanged,
  including 410/404 cleanup and the rethrow for other send failures.
- **Lead docs correction:** `PROJECT_PROFILE.md` briefly attributed the measured
  baseline to the feature branch; corrected to `main` `06807c2` with an explicit
  note that the counts were measured on the task branch before merge. Counts and
  lint facts are otherwise as measured.
- **Deviation accepted:** the primary worktree has a gitignored `.env` with VAPID
  values, so the pre-fix build cannot fail there. The defect was reproduced in a
  `/tmp` copy without `.env*` and with hard-linked `node_modules` (a symlinked
  copy gave a false pass because Prisma's env loader followed the real path).
  Both facts are recorded in `evidence/S0-baseline.md`; the reproduction is
  CI-faithful.
- **E2E honesty:** the confirmed build gate is the `/tmp` no-VAPID CI simulation
  and the branch CI run to come; the primary-worktree build still loads `.env`.
- Routed to a fresh `ame-verifier`. Nothing committed, pushed, deployed,
  migrated or seeded; the branch CI gate needs the commit and push that follow
  review PASS and owner authorization.
