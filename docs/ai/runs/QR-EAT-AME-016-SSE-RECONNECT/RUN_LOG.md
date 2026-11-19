# Run Log — QR-EAT-AME-016-SSE-RECONNECT

**Title:** Keep staff SSE subscribers across LISTEN reconnects
**Type:** bug (reliability)
**Risk:** R2
**Spec level:** L2
**Owner:** Atiff
**Date:** 2026-11-19
**Branch/commit:** not created; base `main` `e4ee151`
**Task revision:** 1
**Approved revision:** 1 (2026-11-19, Atiff; “approved as recommended”, S4 included)
**Task contract:** `TASK.md`
**Resume bookmark:** `NEXT.md`
**Latest review:** —

## Request

Plan `AME-016` (reconnect drops per-connection SSE handlers) as the next L2/R2
task after AME-015 shipped; stop for the owner's approval of the exact `TASK.md`
revision. `AME-018` was offered as a ride-along and is included in scope S4.

## Classification

- Type: BUG. Root cause identified in code, not yet observed as a production
  incident; no real users.
- Risk R2: staff realtime delivery and tenant-scoped event routing; a regression
  could duplicate or stop events for every connected client.
- Level L2: one library module, a new test file, two test files updated only for
  teardown calls, and an optional route change if a test proves it necessary.

## Scope

In scope:

- separate session teardown from subscriber disposal;
- reconnect that preserves per-connection handlers;
- one reconnect cycle (no self-triggered second attempt);
- `AME-018` NOTIFY publication ownership;
- regression tests with a red proof.

Non-goals:

- route/contract/payload/tenant-filter changes;
- global dispatcher refactor;
- `AME-017`, schema, migrations, seed, auth, payments;
- deploy, push, production verification, secrets.

## Context

**Context budget used:**

- Must read: `AGENTS.md`, `PROJECT_PROFILE.md`, `src/lib/postgres-pubsub.ts`,
  the SSE route, `REVIEW-03.md`, the AME-015 test harness.
- Read only if unclear: `instrumentation.ts`, `event-config.ts`, AME-015 run log.
- Not read: the wider repository, `../Tabtep-App`, `.env*`, generated output.

## Investigation / specification

Confirmed at `main` `e4ee151`:

1. `cleanup()` ends both clients, resets session state and calls
   `this.removeAllListeners()` (`postgres-pubsub.ts:757`). That deletes the
   per-connection `message` handlers registered by the route
   (`route.ts:246`), which the module does not own.
2. The reconnect timer calls `cleanup()` → `initialize()` → `subscribe(...)`
   (`postgres-pubsub.ts:704–721`). The reconnect succeeds; the subscriber
   registry is gone, so every already-open stream goes silent while appearing
   healthy (keep-alive pings continue).
3. Recovery only happens when the client drops and reconnects on its own. This
   is the highest-impact residual risk for a pilot.
4. `cleanup()` ends the LISTEN client before clearing the reference, so the
   client's `end` handler still sees itself as current and calls
   `handleDisconnect()`, scheduling a second reconnect during the reconnect. This
   is REVIEW-03 R-07, pre-existing.
5. `openNotifyClient()` publishes `notifyClient` after its await without an
   ownership check, so a teardown during the connect adopts the abandoned client
   and orphans the replacement (REVIEW-03 N-6 / `AME-018`). Low severity, no
   duplicate frames.
6. No existing test registers an emitter listener and then forces a reconnect, so
   the property is unguarded.

Planning-session notes:

- AME-015 was merged (`19cb485`), deployed (`4657048f`, then docs redeploy
  `48ba50a5`) and is healthy; `main` is at `e4ee151`.
- CI `Build` is red repo-wide from a missing `VAPID_PRIVATE_KEY` secret
  (`AME-019`); type-check and tests do pass on Node 20. This task must not rely
  on CI Build as a gate until `AME-019` is fixed, and must not change CI config.
- Local Node is 24; CI is 20. Record the runtime used for evidence.

## Plan

1. Split teardown: session teardown without listener removal for reconnect;
   `cleanup()` keeps full-disposal semantics for tests and process exit.
2. Fix the renew ordering so deliberate close cannot re-enter `handleDisconnect`.
3. Gate NOTIFY publication on ownership, close the abandoned client.
4. New mocked regression suite proving listener survival, single cycle, no
   duplicate emission, give-up unchanged and the NOTIFY race.
5. Red proof on the pre-fix library, then green; full tests, type-check, build,
   owned lint attribution.

## Approvals

| Gate | What was approved | Approved by | Date | Conditions |
|---|---|---|---|---|
| Design/plan | Revision 1 as presented: D1–D6, S1–S4 (including `AME-018`), evidence rule | Atiff | 2026-11-19 | Approval hash `762e1bc1…` (pre-stamp content) |
| Build | Bounded implementation by one `ame-implementer` | Atiff | 2026-11-19 | Covered by the revision-1 approval |
| Commit | — | — | — | Not requested; R2 needs explicit authorization after review PASS |
| Release | — | — | — | Out of scope |

## Commit gate

- [x] Review PASS (REVIEW-01, PASS WITH NOTES)
- [x] Exact path list published (`TASK.md` commit gate, 11 files)
- [x] Exact commit message published
- [x] Human approved (Atiff, 2026-11-19; commit + deploy)
- [x] No unrelated changes

## Execution

Files changed:

- `docs/ai/runs/QR-EAT-AME-016-SSE-RECONNECT/TASK.md` (new)
- `docs/ai/runs/QR-EAT-AME-016-SSE-RECONNECT/RUN_LOG.md` (new)
- `docs/ai/runs/QR-EAT-AME-016-SSE-RECONNECT/NEXT.md` (new)

Commands run:

```text
grep removeAllListeners / on('message') / off('message') / cleanup() call sites
sed -n '360,440p' and '700,775p' src/lib/postgres-pubsub.ts
```

## Verification

Verdict: not started (planning)

Findings:

- Root cause confirmed by code reading; no runtime reproduction in this session.

Not verified:

- Runtime reproduction (belongs to the implementation task's red proof).
- Baseline counts (dependencies are present in this worktree from AME-015, but no
  baseline was run in this planning session).

## Residual risk

- A permanently failed reconnect still leaves streams silent; this task covers
  successful reconnects.
- `AME-017` remains deferred.
- CI Build is red for an unrelated reason (`AME-019`).

## Release

- Deployed: **yes** — Railway service `QR-Eat` (project `grand-tranquility`,
  production), deployment `8d457eb7-8ea6-4550-9536-c39f94a44094`, commit
  `d6fc6ba` (merge of `312b09c`), status `SUCCESS`, 2026-11-19.
- Smoke test:
  - `GET https://tabtep.app/api/health` → 200, `status: UP`,
    `database: CONNECTED`, `env: production`, latency 12 ms, uptime 28 s.
  - `GET https://tabtep.app/` → 200.
  - `GET https://tabtep.app/api/events/orders` unauthenticated → 401 (route
    alive and auth-gated).
  - Startup log: pub/sub initialising, `PostgreSQL LISTEN client connected`,
    `PostgreSQL pub/sub initialized successfully`.
  - Production error sweep (`❌`, `Failed to publish`, `Unhandled`, `FATAL`) →
    0 matches.
  - **Not claimed:** HTTP-level reconnect continuity in production. It needs an
    authenticated staff session and a live order flow; production has no staff
    accounts and creating them was not authorized. The reconnect evidence is the
    module-level probe on a disposable PostgreSQL (post-fix 1 frame, pre-fix 0
    frames, verifier-reproduced) and the mocked regression suite.
- Rollback: redeploy the previous deployment (`e4ee151`); no migration, schema or
  config change in this release.
- Monitoring: watch for silent streams after any database blip — the failure mode
  this fixes leaves the connection open with keep-alives and no error. A future
  visible connection-state signal remains a separate product decision.

### Release note for operators

- The listener registry now survives session teardown by design. `cleanup()`
  retains full-disposal semantics and is still used by signal handlers and tests;
  only the reconnect path uses the soft teardown.
- `AME-018` (NOTIFY publication ownership) shipped in this release; the backlog
  item is closed.
- `AME-019` (CI `Build` red: missing `VAPID_PRIVATE_KEY` repository secret)
  remains open and is unrelated to this change.

## Lessons

- What worked: AME-015's review surfaced this class of defect before it could bite
  a pilot.
- What to change: add a reconnect-survival assertion whenever a lifecycle teardown
  is introduced.
- Follow-ups: `AME-017`, `AME-019`, pilot pre-gate decision.

## Implementation evidence

**Implementer:** `ame-implementer` (child session spawned by the Lead)
**Date:** 2026-11-19
**Branch:** `fix/ame-016-sse-reconnect` (base `main` `e4ee151`, not pushed)
**Runtime:** Node `v24.15.0`, npm `11.12.1` (CI is Node 20; not exercised here)
**Task revision:** 1 (D1–D6, S0–S4)

### Baseline recorded before edits

| Command | Result |
|---|---|
| `npm test -- --runInBand` | PASS — 137 suites passed / 1 skipped; 1661 passed / 11 skipped |
| `npm run type-check` | initially red (`orderMutationIdempotency` missing from the generated Prisma client); ran `npx prisma generate` (local, no schema change), then PASS |
| `npm run build` (ephemeral placeholders only) | PASS |
| `npx eslint` on owned files | exit 0, no findings |
| `npx prettier --check` on owned files | PASS |

Build placeholders were set in the shell only and never written to disk. Variable
names used: `NEXT_PUBLIC_BASE_DOMAIN`, `NEXT_PUBLIC_MAIN_DOMAIN`,
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Values were ephemeral
EC P-256 key material generated per invocation; no secret was printed or stored.

### Red proof (new tests on pre-fix code)

`src/tests/postgres-pubsub-reconnect.test.ts` was written first and run against
the unmodified library. Committable output:
`evidence/red-proof-prefix.txt`.

```text
Tests: 5 failed, 1 passed, 6 total
✕ keeps a subscriber registered before a forced reconnect and delivers after it
    Received length: 0  (listener was deleted by cleanup's removeAllListeners)
✕ runs exactly one reconnect cycle for one forced disconnect
    initialize called 2 times after a second delay window
✕ emits exactly one message per notification after a reconnect (0 listeners)
✕ preserves listeners on session teardown ... (teardownSession not present yet)
✕ does not adopt a NOTIFY client superseded by teardown (same, not present yet)
✓ releases the client when the reconnect budget is exhausted (unchanged)
```

The two contract-mandated red cases (surviving subscriber, single cycle) failed
for exactly the documented reasons.

### Green after the fix

Committable output: `evidence/green-focused.txt`.

```text
npx jest src/tests/postgres-pubsub.test.ts \
  src/tests/postgres-pubsub-single-flight.test.ts \
  src/tests/postgres-pubsub-reconnect.test.ts --runInBand
→ 3 suites passed, 25 tests passed

npx jest src/tests/staff-sse-signals.test.ts --runInBand
→ 1 suite passed, 5 tests passed
```

### Disposable PostgreSQL probe

A throwaway PostgreSQL 16 cluster (`initdb` under `/tmp/opencode`, port 55432, no
seed, no production/staging access) was used for a real `pg` reconnect probe:
subscribe one channel, register an emitter listener, `pg_terminate_backend` the
LISTEN backend, wait for the reconnect, then `NOTIFY` on the new session.
Committable output: `evidence/real-pg-reconnect-probe.txt`.

```text
✓ keeps an emitter listener across a terminated LISTEN backend (5275 ms)
→ one reconnect (~5 s), new backend pid, listener received exactly one message
```

The temporary probe file was deleted and the cluster stopped; it is not part of
the diff. The full HTTP SSE end-to-end (app server + authenticated stream +
add/cancel) was **not** run: it needs an authenticated staff session and
restaurant fixture, and `db:seed` is out of scope. The module-level probe
exercises the same lifecycle against real PostgreSQL.

### Contract verification commands (final state)

| Command | Result |
|---|---|
| `git status --porcelain --untracked-files=all` | only owned/new files plus pre-existing Lead docs (`ACTIVE.md`, `BACKLOG.md`) and the task folder |
| focused pub/sub jest (3 suites) | PASS — 25 tests |
| `npx jest src/tests/staff-sse-signals.test.ts --runInBand` | PASS — 5 tests |
| `npm test -- --runInBand` | PASS — 138 suites passed / 1 skipped; 1667 passed / 11 skipped |
| `npm run type-check` | PASS (exit 0) |
| `npm run build` (ephemeral placeholders) | PASS (exit 0) |
| `npx eslint` on owned files | exit 0, no findings |
| `npx prettier --check` on owned files | PASS |
| `git diff --stat` | `src/lib/postgres-pubsub.ts` +77/−17 (whole-tree +82/−22 including the two Lead docs); no route, schema, contract or test weakening |

`src/app/api/events/orders/route.ts` is unchanged: no test required a route
change. Existing pub/sub and AME-015 suites were not weakened.

### Behaviour implemented

- `teardownSession()`: detaches and resets session state (generation bumps for
  LISTEN and NOTIFY, in-flight gates, session token, channel set, `isListening`,
  timers) **before** awaiting `end()`, and leaves emitter listeners intact.
- `cleanup()`: `teardownSession()` + `removeAllListeners()`; semantics unchanged
  for tests, SIGINT/SIGTERM and full-reset callers.
- Reconnect timer uses `teardownSession()`, so a deliberate close cannot be seen
  as current by the client's own `end` handler and cannot schedule a second
  reconnect. Retry budget, 5 s delay, give-up release and
  `reconnectAttempts = 0` on success are unchanged.
- `openNotifyClient()` captures a NOTIFY generation, closes a superseded client,
  never overwrites a live `notifyClient`, and returns the live replacement (or
  rejects when there is none) so `notify()` does not hang or publish on a closed
  client.
- Comment added at the teardown boundary documenting subscriber ownership
  (`route.ts:364`).

### Deviations

- None from `TASK.md` revision 1. `prisma generate` was run only to repair the
  local generated client baseline; no schema or migration file changed.
- Full HTTP SSE end-to-end not run (reason above); module-level real-PostgreSQL
  probe substituted and recorded.

## Lead check — 2026-11-19

- **Diff scope:** `src/lib/postgres-pubsub.ts` (+77/−17; the +82/−22 figure is the
  whole-tree stat including the two Lead docs), the new
  `src/tests/postgres-pubsub-reconnect.test.ts`, three evidence files and the
  Lead-owned docs. `src/app/api/events/orders/route.ts` and the two existing
  pub/sub test files are unchanged, as scoped. No contract, tenant-filter,
  schema, migration or auth change.
- **Teardown split (D1):** `teardownSession()` detaches both client references
  and resets session/gate state *before* awaiting `end()`, then closes the
  detached clients. `cleanup()` delegates and keeps full-disposal semantics.
  Subscriber listeners are untouched by the reconnect path.
- **One cycle (D3):** clearing `listenClient` before `end()` means the client's
  own `end` handler fails the identity guard, so a deliberate close cannot
  schedule a second reconnect. Unexpected `error`/`end` still passes the guard.
- **NOTIFY ownership (S4/`AME-018`):** generation plus live-replacement checks;
  a superseded client is closed, and a waiting caller receives the live
  replacement rather than hanging. One narrow window remains (the live
  replacement could be torn down between the check and the return); `notify()`
  already drops a failed client and retries, so it should degrade to a retry
  rather than a hang — the verifier should probe it.
- **Evidence:** red proof 5 failed / 1 passed with the correct assertion
  (`received length 0`); focused green 3 suites / 25 tests; full suite 1667
  passed / 11 skipped; real-PostgreSQL probe passes in 5275 ms after terminating
  the LISTEN backend. `prisma generate` was run only to repair a stale local
  client; no schema change.
- **Not verified by the Lead:** HTTP-level SSE end-to-end (no staff fixture); CI
  Build (known `AME-019`).
- Routed to a fresh `ame-verifier`. No commit, push, deploy or seed.
