# Run Log — QR-EAT-AME-015-PG-PUBSUB

**Title:** Single-flight PostgreSQL pub/sub for the staff SSE feed
**Type:** bug (reliability)
**Risk:** R2
**Spec level:** L2
**Owner:** Atiff
**Date:** 2026-11-19
**Branch/commit:** not created; base `main` `024f22d` (planning worktree
`gentle-mountain`, detached HEAD)
**Task revision:** 1
**Approved revision:** 1 (2026-11-19, Atiff; “approved as recommended”)
**Task contract:** `TASK.md`
**Resume bookmark:** `NEXT.md`
**Latest review:** —

## Request

Create the L2/R2 AME task for `AME-015` from the Tabtep-App handoff
`../Tabtep-App/docs/ai/handoffs/QR-EAT-AME-015-PG-PUBSUB.md`, then stop for the
owner's approval of the exact `TASK.md` revision. No code, deploy, migration or
seed.

## Classification

- Type: BUG. The defect, reproduction and root cause are already captured by the
  B3-S staging gate; this is a root-cause reliability fix with a regression test,
  not a design change.
- Risk R2: staff realtime delivery is operational infrastructure for the Counter
  and Kitchen flows and is tenant-scoped; a wrong fix can silently mute the feed
  or cross tenants. No auth, payment, schema or data change.
- Level L2: two owned source files plus one test file, a frozen contract that
  must not move, and an integration proof that needs a disposable database.

## Scope

In scope:

- single-flight `initialize()` with one LISTEN client;
- additive, serialized `subscribe()` with per-session channel bookkeeping;
- listener state reset on disconnect, cleanup and retry exhaustion;
- the SSE route's check-then-init call site;
- duplicate-init regression tests and B3-S duplicate-frame evidence.

Non-goals:

- contract/payload/type/channel changes;
- reconnect handler-loss fix, instrumentation channel list, `activeConnections`
  keying, NOTIFY retry behaviour;
- schema, migrations, seed, auth, payments;
- deploy, push, production verification, secrets.

## Context

**Context budget used:**

- Must read: `AGENTS.md`, `docs/ai/PROJECT_PROFILE.md`, `docs/ai/ACTIVE.md`,
  `docs/ai/BACKLOG.md` (`AME-015`), the Tabtep-App handoff,
  `docs/ai/AME/core/WORKFLOWS.md`, `docs/ai/AME/templates/{TASK,RUN_LOG,NEXT}.md`,
  the B3-S `TASK.md`/`RUN_LOG.md` (SSE observation), and the three owned source
  files.
- Read only if unclear: `src/instrumentation.ts` (read to prove the second call
  site), the B3-S gate harness headers, `src/tests/staff-sse-signals.test.ts`.
- Not read: `../Tabtep-App` implementation, other run logs, `.env*`, generated
  output, the wider repository.

## Investigation / specification

Confirmed in `main` `024f22d`:

1. `route.ts:225` gates listener setup on `isConnected()`, which is false for the
   whole window between `new Client()` and the end of the `LISTEN` loop, so two
   concurrent first connections both enter the setup branch.
2. `postgres-pubsub.ts:210-254` assigns `listenClient` and connects without any
   in-flight guard; a second call replaces the reference and leaves the first
   client connected with its own `notification` handler → two `message`
   emissions per notification → two refresh frames per open connection. This is
   exactly the B3-S symptom (duplicate signals only; one event/chit/audit row).
3. `instrumentation.ts:25-34` is a second caller with 5 channels; the route uses
   10. Any single-flight that coalesces on the first caller's channel list would
   silently drop `order_items_added`, `order_cancelled`, `order_recalled`,
   `order_recall_cleared`, `table_status_changed`. The fix therefore has to be
   additive, not first-caller-wins.
4. Because of the `isConnected()` gate, when instrumentation wins the race the
   route never subscribes its extra channels. The correction makes channel
   coverage a deterministic union — a functional fix on top of de-duplication.
5. `subscribe()` has no bookkeeping of what is already listened, so a partial
   failure cannot be retried precisely.
6. `handleDisconnect()` → `cleanup()` → `removeAllListeners()` also removes the
   per-connection SSE `message` handlers. Pre-existing, out of scope per the
   handoff, recorded as residual risk and proposed `AME-016`.
7. `AGENTS.md` / `PROJECT_PROFILE.md` baseline (524 tests) is stale against the
   B3-S record (1640 passed / 11 skipped, 136 suites). The implementer records
   the real baseline.

Planning-session environment limitations:

- `node_modules` is absent in this worktree, so `npm test` failed with
  `jest: not found` (exit 127). No baseline counts were produced here; the
  implementer must run `npm ci` and record them.
- Local Node is `v24.15.0`; CI uses Node 20. Record the runtime used for
  evidence.
- PostgreSQL server binaries exist locally at `/usr/lib/postgresql/{16,17,18}`,
  and the B3-S harness is committed under
  `docs/ai/runs/QR-EAT-B3-S-COUNTER-FEED/evidence/`, so the integration evidence
  is feasible; the committed fixture's signing value is redacted by design.

## Plan

1. `initialize()`: single-flight promise, early return when a LISTEN client
   exists, assign the client only after `connect()`, atomic failure cleanup.
2. `subscribe()`: join the in-flight pass, then `LISTEN` only missing channels;
   add to the session set only after success; keep the public signature.
3. Disconnect/cleanup: clear the channel set; on retry exhaustion release the
   dead client so the next connection rebuilds; `cleanup()` clears gates.
4. Route: replace the `isConnected()` gate with an unconditional
   `await pgPubSub.subscribe(...)`, keeping try/catch and handler bookkeeping.
5. Tests: new mocked-pg suite proving one client / one `LISTEN` per channel /
   one emission, failure retry, cleanup and disconnect reset; prove the test is
   red on pre-fix code.
6. Evidence: full tests, type-check, build, owned-file lint delta, and the B3-S
   gate `duplicateFrames` / tenant-isolation numbers on a disposable local DB.

## Approvals

| Gate | What was approved | Approved by | Date | Conditions |
|---|---|---|---|---|
| Design/plan | Revision 1 as presented: D1–D9, R2 allowance for `src/app/api/events/orders/route.ts`, D8 evidence rule, proposed `AME-016` | Atiff | 2026-11-19 | Approval hash `fe488497…` (pre-stamp content) |
| Design/plan (rev 2) | D10 per-module-instance guarantee, amended AC1/AC4/AC12, corrected fact 4, `AME-017` deferred item | Atiff | 2026-11-19 | Approval hash `6a64a8d7…` (pre-stamp content); docs only, no code change |
| Build | Bounded implementation by one `ame-implementer` | Atiff | 2026-11-19 | Covered by the revision-1 approval |
| Verify (rev 1) | `REVIEW-01.md` PASS WITH NOTES; R-01–R-07 recorded | Independent `ame-verifier` | 2026-11-19 | Correction cycle 1 authorized for R-01–R-05 |
| Verify (rev 1 + cc1) | `REVIEW-02.md` PASS WITH NOTES; R-01–R-05 closed, F-1/R-06 low and open, N-2 docs defect | Independent `ame-verifier` | 2026-11-19 | Correction cycle 2 authorized for F-1 and N-2 |
| Build (cc2) | Generation guard for abandoned initialize passes; N-2 evidence correction | Atiff | 2026-11-19 | Bounded to F-1/N-2; no scope change |
| Verify (rev 1 + cc1 + cc2) | `REVIEW-03.md` PASS WITH NOTES; F-1/R-06 and N-2 closed; N-6 (low) accepted as residual; N-7 corrected by Lead | Independent `ame-verifier` | 2026-11-19 | Ready for commit gate; commit not yet authorized |
| Commit | — | — | — | Not requested; R2 needs explicit authorization after review PASS |
| Release | — | — | — | Out of scope |

## Commit gate

- [x] Review PASS (REVIEW-03, PASS WITH NOTES)
- [x] Exact path list published (`TASK.md` commit gate, 34 files)
- [x] Exact commit message published
- [x] Human approved (Atiff, 2026-11-19; local commit only)
- [x] No unrelated changes

## Execution

Files changed:

- `docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/TASK.md` (new)
- `docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/RUN_LOG.md` (new)
- `docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/NEXT.md` (new)

Commands run:

```text
git rev-parse --abbrev-ref HEAD / HEAD      -> detached HEAD, 024f22d
git status --porcelain                      -> clean before planning
npm test -- --runInBand                     -> exit 127, "jest: not found" (no node_modules)
```

## Verification

Verdict: not started (planning)

Findings:

- Root cause confirmed by code reading; no runtime reproduction in this session.

Evidence:

- `TASK.md` verified facts 1–9 with file/line references.
- B3-S `RUN_LOG.md` lines 297–309 (observed duplicate frames and scope).

Not verified:

- Baseline test/type-check/build counts (no dependencies installed).
- End-to-end duplicate-frame count (belongs to the implementation task).

## Residual risk

- Reconnect handler loss (fact 6) remains until a separate task.
- A first-caller-wins implementation would silently drop B3 channels; D3 plus
  test 3 is the guard.
- Integration evidence depends on a disposable local PostgreSQL; if unavailable,
  no duplicate-count claim is made.

## Release

- Deployed: no
- Smoke test: n/a
- Rollback: n/a (single-process listener lifecycle change; revert commit)
- Monitoring: n/a

## Lessons

- What worked: reading both subscription call sites before designing the gate
  avoided a fix that would have broken the B3 signals.
- What to change: keep `AGENTS.md` baseline numbers in sync with the latest
  verified run.
- Follow-ups: proposed `AME-016` (reconnect handler loss); confirm whether the
  B3-S gate re-run is a hard commit gate or a pre-pilot gate.

## Implementation evidence

**Date:** 2026-11-19
**Branch:** `fix/ame-015-single-flight-pubsub` (base `024f22d`), uncommitted
**Actor:** `ame-implementer` (subagent of the planning session)
**Runtime:** local Node `v24.15.0`, npm `11.12.1` (CI uses Node 20; recorded, not
matched). `npm ci` installed 1054 packages before any measurement.

### Files changed

Tracked (modified):

```text
src/lib/postgres-pubsub.ts
src/app/api/events/orders/route.ts
```

New (untracked):

```text
src/tests/postgres-pubsub-single-flight.test.ts
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/README.md
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/run-focus.cjs
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/fixtures-local.cjs
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/focus-post.txt
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/focus-prefix.txt
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/focus-results.json
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/focus-results-prefix.json
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/pg-stat-activity-listen-sessions.txt
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/server-startup.txt
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/unit-red-proof.txt
```

`docs/ai/ACTIVE.md` and `docs/ai/BACKLOG.md` already carried Lead edits before
this session and were not touched. No other file was modified.

### Baseline (pre-change, clean worktree at `024f22d`)

| Command | Result |
|---|---|
| `npm test -- --runInBand` | PASS - 136 suites passed, 1 skipped (137 total); 1644 passed, 11 skipped, 1655 tests |
| `npm run type-check` | PASS (exit 0) |
| `npm run build` | PASS with build-time env placeholders (see below) |
| `npm run lint` | FAIL (known baseline) - 61 errors, 11 warnings; **0 findings in the owned files** |

The real lint baseline is 61/11, not the 62 cited in `AGENTS.md`. The first
baseline build attempt failed because `src/lib/push-notification-service.ts`
reads `VAPID_PUBLIC_KEY` (not `NEXT_PUBLIC_VAPID_PUBLIC_KEY`); with the correct
names the build passes. Build-time variable names used, values ephemeral and
never written to a file: `NEXT_PUBLIC_BASE_DOMAIN`, `NEXT_PUBLIC_MAIN_DOMAIN`,
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

### Change summary

- `initialize()` is single-flight (`initializePromise`), returns early when a
  LISTEN client exists (still ensuring the NOTIFY client), publishes
  `this.listenClient` only after `connect()` resolves, and on failure closes and
  clears the client created by that pass before the gate clears.
- `subscribe()` is additive and serialized (`subscriptionPromise` + per-session
  `subscribedChannels`): only missing channels are `LISTEN`ed, and a channel is
  recorded only after its `LISTEN` succeeds. Duplicate arguments are collapsed.
- `unsubscribe()` removes un-listened channels from the set.
- `handleDisconnect()` clears `isListening` and the channel set; when the retry
  budget is exhausted it releases (best-effort `end()` + clear) the dead LISTEN
  client so the next connection rebuilds.
- `cleanup()` also clears `initializePromise`, `subscriptionPromise`,
  `notifyConnect`, `subscribedChannels` and `isListening`; `removeAllListeners()`
  is kept (D9).
- The SSE route replaces the `isConnected()` check-then-init block with an
  unconditional `await pgPubSub.subscribe(...)` over the same 10 channels. The
  surrounding `try/catch`, `activeConnections` bookkeeping, per-connection
  `messageHandler`, keep-alive and `cleanup()` are unchanged.
- No channel, payload, SSE type, tenant-filter, cursor, catch-up, keep-alive,
  schema or migration change. `src/instrumentation.ts`,
  `src/lib/constants/sse.ts`, `src/lib/event-persistence.ts`,
  `src/lib/counter/tenant-guards.ts`, `prisma/**`, `docs/PRODUCT/**` and all
  auth/payment code are untouched.

### Post-change verification

| Command | Result |
|---|---|
| `npx jest src/tests/postgres-pubsub.test.ts src/tests/postgres-pubsub-single-flight.test.ts --runInBand` | PASS - 2 suites, 11 tests |
| `npx jest src/tests/staff-sse-signals.test.ts --runInBand` | PASS - 5 tests |
| `npm test -- --runInBand` | PASS - 137 suites passed, 1 skipped (138 total); 1653 passed, 11 skipped, 1664 tests |
| `npm run type-check` | PASS (exit 0) |
| `npm run build` | PASS with the same placeholder variable names |
| `npm run lint` | same known baseline: 61 errors, 11 warnings; **0 findings in the owned files (including the new test)** |

`git diff --stat` for the owned files: `src/app/api/events/orders/route.ts`
+15/-17, `src/lib/postgres-pubsub.ts` +165/-17 (180 insertions, 34 deletions
across the two files). The regression file was 293 lines at cycle 0 (540 lines after correction
cycle 1; see below). The only other
tracked modifications in the worktree are the pre-existing Lead edits to
`docs/ai/ACTIVE.md` and `docs/ai/BACKLOG.md`.

### Red/green proof for the regression suite

`npx jest src/tests/postgres-pubsub-single-flight.test.ts --runInBand` with the
library and route changes stashed (pre-fix code): **6 failed, 3 passed**
(`evidence/unit-red-proof.txt`). The failures are the defect itself:

- concurrent cold subscribers issued `LISTEN channel_a`/`channel_b` twice;
- two concurrent `initialize()` calls created three clients (two LISTEN);
- the instrumentation-set-then-route-set shape issued 15 `LISTEN` statements
  instead of 10;
- a rejected first `LISTEN` left the client open (no release, no rebuild);
- an exhausted reconnect budget did not release the dead client.

With the fix the same file was 9/9 green at cycle 0 (15/15 after correction
cycle 1). Tests 6 and 7 pass on both code states (cleanup and disconnect
re-subscribe were already correct); they guard against regressions.

### Integration evidence (D8)

Disposable PostgreSQL 16.15 under `/tmp/opencode/ame015/pg` on port 55433,
`npx prisma migrate deploy`, the B3-S fixture loader adapted locally (two
tenants, no `npm run db:seed`), `npm run start` in production mode on port 3015.
The local disposable auth secret lived only outside the repository and was
deleted afterwards; no token, secret, database URL or PII is in the evidence.

Focused two-tenant concurrent-SSE run (`evidence/run-focus.cjs`, mirrors B3-S
case 5 plus a `table_status_changed` coverage probe):

| Code state | `5.sse.delivered` | `duplicateFrames` | `5.sse.tenant-isolated` | additive coverage |
|---|---|---|---|---|
| pre-fix (`024f22d`) | PASS with duplicates | **2** | PASS | FAIL (2 frames) |
| post-fix | PASS | **0** | PASS, no leakage | PASS (1 frame) |

Startup log: `[Server Startup] PostgreSQL pub/sub initialized successfully`
appears on both runs, so instrumentation won the boot path; the pre-fix
duplicates came from the SSE route's module graph (`evidence/README.md`).
Post-fix `pg_stat_activity` shows two LISTEN sessions, one per Next module graph
(instrumentation bundle and route bundle), each single-flight.

Pre-fix frame types on tenant A (each twice): `connection`, `order_created`,
`order_status_changed`, `kitchen_notification`, `order_items_added`,
`order_cancelled`, `table_status_changed`. Post-fix: each exactly once, and
tenant B received only its own frames.

### Deviations

1. The LISTEN client's `error`/`end` handlers now act only while that client is
   the current `listenClient`. Needed so releasing a dead client does not
   re-enter `handleDisconnect`, and so a replaced client cannot mute the live
   one. Within D1/D2/D5 lifecycle scope; reconnect scheduling itself unchanged.
2. Partial subscription failure policy: a failed `LISTEN` in a session that has
   no successful channel yet releases the client (test-plan item 4 needs the
   rebuild); a failure after earlier channels succeeded keeps the session and
   the set so the next call retries only the remainder (S2). Documented in code.
3. `cleanup()` additionally clears the `notifyConnect` gate, which S3 did not
   name explicitly but is the same class of in-flight gate.
4. Integration used the focused two-tenant script instead of the full 8-case
   B3-S gate, which D8 explicitly permits; those cases are unrelated to the
   listener lifecycle.
5. A pre-fix comparison run was added to prove the harness is discriminating;
   the contract only required the post-fix numbers.
6. Test mechanics: the pg mock does not emit `end` from `end()`; the disconnect
   test invokes the captured handler explicitly. The give-up test sets the
   private retry counter through a typed cast instead of waiting through five 5s
   reconnect delays. Both are test-only controls, commented in the test file.

### Not run / not changed

- No push, commit, deploy, shared-database migration, seed, local env file,
  production configuration or cross-repo change.
- No load or multi-process test; the reconnect handler-loss defect (fact 7) is
  untouched per D9.
- Lint is not a gate (pre-existing red baseline); see the attribution above.

### Residual risks

- **Reconnect handler loss (pre-existing, `AME-016`).** `cleanup()` still calls
  `removeAllListeners()`, so route `message` handlers are dropped after a
  reconnect; unchanged and out of scope.
- **Two module graphs, two LISTEN sessions per process.** Next bundles
  instrumentation and routes separately, so each graph holds one single-flight
  LISTEN client. Measured: no duplicate emission; a true one-session-per-process
  design would need a shared module, which is out of scope.
- **Half-subscribed session after a mid-pass failure.** The session is kept so
  the next call retries the remainder; if the socket is actually dead, the
  client's error/end handler clears it and triggers the existing reconnect.
- **Mocked concurrency in unit tests.** The end-to-end numbers above are the
  behavioural proof; they depend on a local disposable database.
- **Node 24 vs CI Node 20.** All numbers were produced on Node 24.15.0.

## Lead review of the implementation — 2026-11-19

**Diff scope check (Lead, `git status` / `git diff`):** modified
`src/lib/postgres-pubsub.ts` and `src/app/api/events/orders/route.ts`; new
`src/tests/postgres-pubsub-single-flight.test.ts` and the evidence files. No
file outside the owned list was changed by the implementer (`docs/ai/ACTIVE.md`
and `docs/ai/BACKLOG.md` carry Lead edits only).

**Code review:**

- `initialize()` publishes the client only after `connect()`, shares one
  in-flight pass, early-returns on an existing client while still ensuring the
  NOTIFY side, and atomically closes the pass's client on failure.
- `subscribe()` serializes passes and records channels only after a successful
  `LISTEN`, so a partial failure retries the remainder; a failed first `LISTEN`
  releases the unusable client.
- `releaseListenClient()` clears the reference before `end()`, and the
  error/end guards check identity, so a released client cannot re-enter
  `handleDisconnect` or mute a replacement.
- Reconnect give-up releases the dead client, preserving the pre-fix self-heal
  that the new early return would otherwise remove.
- Route diff is limited to the call site; handler registration, keep-alive,
  catch-up and cleanup are untouched. No contract, tenant-filter or payload
  change.
- Test suite covers the contract matrix; the red proof (6 failed / 3 passed on
  pre-fix code) shows it discriminates.

**Finding F-1 (contract, not code).** Revision 1 assumed one module instance
shared by `instrumentation.ts` and the SSE route. The built server contradicts
that: `pg_stat_activity` shows two LISTEN sessions, one per Next module graph
(`evidence/pg-stat-activity-listen-sessions.txt`), and the pre-fix duplicates
came from the route graph alone. Consequences:

- AC1/AC4 as written (“one client per process”, “all 10 on one client”) are not
  literally satisfied; the delivered guarantee is per module instance.
- Fact 4 (route under-subscription when instrumentation wins) is latent, not
  active, in this build.
- The fix is correct and measured: `duplicateFrames` 2 → 0, tenant isolation
  clean, additive coverage probe passes.
- Resolution: `TASK.md` revision 2 rewords AC1/AC4, corrects fact 4, adds D10 and
  replaces the residual-risk bullet. No code change follows from F-1.

**Evidence spot-check (Lead):** `evidence/focus-results.json` reports 5/5 checks
with `duplicateFrames: 0`, `leaked: []`, `tableBOnA: 0`, `tableBOnB: 1`; the
pre-fix JSON reports `duplicateFrames: 2` and three failures. `README.md` records
the disposable database, port and cleanup. No secret, token or PII present.

**Gate status:** revision 2 approved (2026-11-19); independent verification is
the next gate; `AME-017` added to the backlog as deferred. No commit, push,
deploy or seed.

## Correction cycle 1

**Date:** 2026-11-19
**Trigger:** `REVIEW-01.md` verdict PASS WITH NOTES; owner authorized fixes for
R-01..R-05 only. R-07 left as recorded (pre-existing cleanup ordering).
**Branch:** same worktree/branch, uncommitted.

### Findings and fixes

- **R-01 - fixed.** Added "subscribes the union when a larger set joins an
  in-flight smaller set": the first `LISTEN` is held on a deferred promise, a
  larger concurrent set is issued inside that window, and the test asserts one
  `LISTEN` per channel on one client. Mutation check: inserting
  `if (previous) return previous;` into `subscribe()` makes exactly this test
  fail (1 failed / 14 passed, `evidence/mutation-first-caller-wins.txt`). The
  mutant was applied to `src/lib/postgres-pubsub.ts` after copying that file to
  `/tmp/opencode/ame015/lib-backup.ts`, and removed by copying the backup back
  byte-for-byte (`sha256sum` before and after matched at the time). No hash is
  quoted here: the file was reformatted by Prettier later in the same cycle and
  changed again in correction cycle 2, so a value taken then is not
  reproducible now (N-2).
  Evidence: `src/tests/postgres-pubsub-single-flight.test.ts`.
- **R-02 - fixed.** `openListenSession()` now publishes `listenClient` and a
  session identity token only after both the LISTEN and NOTIFY connects
  succeed, and starts the session with empty bookkeeping. Every subscribe pass
  captures that token and records a channel only while the token and client are
  still current; a LISTEN that resolves after the session closed throws
  "session changed" instead of writing into the next session. The failure path
  and `releaseListenClient()`/`cleanup()` clear the token. The in-flight
  cleanup variant (R-06) is covered by the same guard. Two new tests fail on the
  cycle-0 library (`evidence/correction-red-proof.txt`: exactly those 2 failed,
  13 passed) and pass after.
- **R-03 - fixed.** `unit-red-proof`, `focus-post`, `focus-prefix` and
  `server-startup` were renamed from `.log` to `.txt`; the new
  `mutation-first-caller-wins.txt`, `correction-red-proof.txt`,
  `focus-post-cc1.txt`, `focus-post-cc1-run2.txt`, `server-startup-cc1.txt` and
  `pg-stat-activity-listen-sessions-cc1.txt` follow the same rule.
  `git check-ignore` returns nothing for every evidence file and
  `git status --untracked-files=all` lists all of them.
- **R-04 - fixed.** Added tests for a mid-pass partial failure that re-issues
  only the remainder (channel_a stays listened, only b then c are retried), for
  duplicate-argument collapse (one `LISTEN` per distinct channel), and a
  source-read guard that fails if `setupPostgresSubscription()` in the SSE route
  stops calling `pgPubSub.subscribe` with exactly the expected ten
  `PG_EVENTS` channels or reintroduces a `pgPubSub.isConnected(` gate.
- **R-05 - fixed.** `fixtures-local.cjs` and `run-focus.cjs` now read
  `GATE_REPO`, `GATE_DB_URL`, `GATE_JWT_KEY`, `GATE_FIXTURES_OUT`,
  `GATE_FIXTURES`, `GATE_BASE` and `GATE_OUT` from the environment, with usable
  local defaults (repository root resolved from the script, local loopback
  database, tmpdir paths). No implementer path or fixed database URL remains.
  The cycle-1 integration run used the committed scripts with defaults.

### Tests added (correction cycle 1)

The suite grows from 9 to 15 tests: additive union under an in-flight smaller
set (R-01), NOTIFY-connect failure with an in-flight pass (R-02),
cleanup mid-pass session guard (R-02/R-06), mid-pass remainder retry (R-04),
duplicate-argument collapse (R-04), route ten-channel source guard (R-04).

### Commands and results (final tree)

| Command | Result |
|---|---|
| `npx jest src/tests/postgres-pubsub.test.ts src/tests/postgres-pubsub-single-flight.test.ts --runInBand` | PASS - 2 suites, 17 tests (15 new + 2 existing) |
| `npx jest src/tests/staff-sse-signals.test.ts --runInBand` | PASS - 5 tests |
| `npm test -- --runInBand` | PASS - 137 suites passed, 1 skipped (138); 1659 passed, 11 skipped, 1670 total |
| `npm run type-check` | PASS (exit 0) |
| `npm run build` | PASS with the same cited placeholder variable names |
| `npm run lint` | unchanged baseline 61 errors / 11 warnings; 0 findings in owned files |
| `npx prettier --check` (owned files) | PASS |
| regression suite vs cycle-0 library | 2 failed / 13 passed (`evidence/correction-red-proof.txt`) |
| regression suite vs first-caller-wins mutant | 1 failed / 14 passed (`evidence/mutation-first-caller-wins.txt`) |

### Integration re-run (fresh database, fresh build)

The disposable cluster was recreated from scratch (`dropdb`/`createdb`, then
`npx prisma migrate deploy`), the two-tenant fixtures were loaded with the
committed `fixtures-local.cjs` defaults, and the server was started in
production mode on 127.0.0.1:3015 after a fresh `npm run build`. Same safety
rules: `/tmp/opencode`, non-production port, no `db:seed`, no production or
Railway target, no secret in any committed file, disposable signing value
deleted afterwards.

| Check | Result |
|---|---|
| `5.sse.delivered` | PASS - add 200, cancel 200, addSignals 1, cancelSignals 1 |
| `duplicateFrames` | **0** |
| `5.sse.delivered.exactly-once` | PASS |
| `5.sse.tenant-isolated` | PASS - `leaked: []` |
| `5.sse.additive-coverage` (`table_status_changed`) | PASS - 1 frame |
| `5.sse.tenant-isolated.table-status` | PASS - tableBOnA 0, tableBOnB 1 |
| second consecutive run | same numbers, 5/5 PASS |

Startup log on the corrected build still reports
`[Server Startup] PostgreSQL pub/sub initialized successfully`, and
`pg_stat_activity` again shows two LISTEN sessions (one per Next module graph).
Evidence: `evidence/focus-post-cc1.txt`, `evidence/focus-post-cc1-run2.txt`,
`evidence/focus-results-cc1.json`, `evidence/server-startup-cc1.txt`,
`evidence/pg-stat-activity-listen-sessions-cc1.txt`.

### Files changed in correction cycle 1

Modified:

```text
src/lib/postgres-pubsub.ts                       (session token + publish-after-connect)
src/tests/postgres-pubsub-single-flight.test.ts  (new gates, 6 more tests, 540 lines)
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/RUN_LOG.md (this section, .txt references)
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/README.md (rewritten)
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/run-focus.cjs (env defaults)
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/fixtures-local.cjs (env defaults)
```

Renamed: `unit-red-proof`, `focus-post`, `focus-prefix`, `server-startup` from
`.log` to `.txt`.

New: `mutation-first-caller-wins.txt`, `correction-red-proof.txt`,
`focus-post-cc1.txt`, `focus-post-cc1-run2.txt`, `focus-results-cc1.json`,
`server-startup-cc1.txt`, `pg-stat-activity-listen-sessions-cc1.txt`.

`src/app/api/events/orders/route.ts` is unchanged by correction cycle 1. The
Lead-owned `docs/ai/ACTIVE.md` and `docs/ai/BACKLOG.md` edits are untouched.

### Deviations (correction cycle 1)

- The route source guard asserts absence of a `pgPubSub.isConnected(` call
  rather than absence of the word, because the explanatory comment names the old
  gate. It still fails if the gate returns.
- The first attempt at `correction-red-proof.txt` was captured before fixing a
  test-authoring bug in the route guard (it matched the comment text). The
  committed proof is a clean re-run against a reconstructed cycle-0 library:
  exactly the two R-02 tests fail; the library was restored and its hash
  verified.

### Residual risks (updated)

- R-01 guard now exists; a first-caller-wins regression fails a named test.
- R-02 interleaving is guarded by the session token, and both the NOTIFY-failure
  and cleanup-mid-pass variants are tested.
- R-07 remains as recorded (pre-existing `cleanup()` end/null ordering); not
  changed.
- Two LISTEN sessions per process (one per Next module graph) remain by design
  of the bundler; recorded as `AME-017`.
- Reconnect still calls `removeAllListeners()` and drops per-connection handlers
  (`AME-016`).
- All numbers measured on Node 24.15.0, not CI's Node 20.

### Lead check — correction cycle 1

- Diff scope re-checked: the correction touched only
  `src/lib/postgres-pubsub.ts`, the new test file, `RUN_LOG.md` and `evidence/`.
  `route.ts` is unchanged from review 01; `TASK.md`, `NEXT.md`, `REVIEW-01.md`
  and the earlier source diff are untouched by the implementer.
- R-02 fix read end to end: the session token is created per session, published
  only after both connects resolve, cleared on failure/release/cleanup, and each
  `LISTEN` re-checks ownership before recording. A stale pass now throws
  `session changed` instead of writing into the next session; a mid-pass
  failure on the current session still keeps the remainder for retry. The
  give-up/self-heal path and the identity guards are preserved.
- No new failure mode found in the chain: a rejected pass is swallowed by the
  next queued pass's `then(..., ...)`, and the route keeps its log-and-continue
  `try/catch`.
- Evidence now committable: all four former `*.log` files are `.txt`, and
  `git status --untracked-files=all` lists every cited file with no ignored path
  under the run directory.
- Integration re-measured after the ordering change: `duplicateFrames` 0,
  `leaked: []`, `tableBOnA: 0`, `tableBOnB: 1`, 5/5 checks, reproduced on a
  second consecutive run (`focus-results-cc1.json`).
- Routed to a fresh `ame-verifier` for REVIEW-02. No commit, push, deploy or
  seed.

## Correction cycle 2

**Date:** 2026-11-19
**Trigger:** `REVIEW-02.md` PASS WITH NOTES; owner authorized exactly F-1/R-06 and
N-2. Same worktree/branch, uncommitted. No route, contract, tenant-filter,
NOTIFY-path or R-07 change.

### F-1 / R-06 - fixed

An initialize pass now captures `initializeGeneration` before its awaits;
`cleanup()` increments it. After the LISTEN and NOTIFY connects, a pass whose
generation changed throws `PostgreSQL LISTEN session was abandoned before it was
established`, closes the client it created, and rejects without publishing a
client or token. The failure path resets session-wide state only when no session
is published, so an abandoned pass cannot clear the bookkeeping of the session
that replaced it. The normal path publishes exactly once, and the per-session
token logic for subscribe passes is unchanged.

Two regression tests were added (suite now 17 tests):

- "does not publish a session abandoned by cleanup during connect": holds the
  first client's `connect()` on a deferred, starts pass A, runs `cleanup()`,
  starts pass B (publishes), subscribes `channel_a`, then releases the gate.
  Asserts pass A rejects, the stale client was ended, exactly one live client
  holds a notification handler, exactly one client issued `LISTEN channel_a`,
  and one simulated notification yields exactly one `message` emission.
- "keeps the live session usable after a stale initialize pass rejects": after
  the stale pass rejects, `subscribe('channel_b')` reuses the live session (no
  third client) and `isConnected()` is true.

Red proof: with `src/lib/postgres-pubsub.ts` rebuilt to its cycle-1 state (guard,
generation counter and conditional reset removed), exactly these two tests fail
(2 failed / 15 passed) - `evidence/cc2-red-proof.txt`. The cycle-2 file was then
restored byte-for-byte; `sha256sum src/lib/postgres-pubsub.ts` is
`50b926fd7e70178e76b0e8eccca7e31b49d8fec2863141af309648e18e22b07f`, which is the
file the 19-test run and the integration run below used.

### N-2 - corrected

The unverifiable "restored file hash" line in the R-01 entry of
correction cycle 1 quoted a 64-character value that matched no owned file and
named no file. It is replaced with a reproducible description that names
`src/lib/postgres-pubsub.ts` and the `cp` backup/restore procedure, with no
moment-in-time hash quoted. The same statement in `evidence/README.md` was
corrected the same way. No other place in the repository repeats the stale
value (the only remaining occurrence is the review record itself, which this
cycle must not edit).

### Integration re-run (fresh database, fresh build)

Fresh disposable PostgreSQL 16.15, `dropdb`/`createdb`, `npx prisma migrate
deploy`, committed fixtures with defaults (two tenants, no `db:seed`), fresh
`npm run build`, `npm run start` in production mode on 127.0.0.1:3015, committed
harness with defaults. Same safety rules; signing value and tmp fixtures deleted
after the run.

| Check | Result |
|---|---|
| `5.sse.delivered` | PASS - add 200, cancel 200, addSignals 1, cancelSignals 1 |
| `duplicateFrames` | **0** |
| `5.sse.delivered.exactly-once` | PASS |
| `5.sse.tenant-isolated` | PASS - `leaked: []` |
| `5.sse.additive-coverage` (`table_status_changed`) | PASS - 1 frame |
| `5.sse.tenant-isolated.table-status` | PASS - tableBOnA 0, tableBOnB 1 |
| second consecutive run | same numbers, 5/5 PASS |

Startup log still reports `[Server Startup] PostgreSQL pub/sub initialized
successfully`; `pg_stat_activity` again shows two LISTEN sessions, one per Next
module graph. Evidence: `evidence/focus-post-cc2.txt`,
`evidence/focus-post-cc2-run2.txt`, `evidence/focus-results-cc2.json`,
`evidence/server-startup-cc2.txt`,
`evidence/pg-stat-activity-listen-sessions-cc2.txt`.

### Commands and results (final tree, correction cycle 2)

| Command | Result |
|---|---|
| `npx jest postgres-pubsub.test.ts postgres-pubsub-single-flight.test.ts --runInBand` | PASS - 2 suites, 19 tests (17 new-file + 2 existing) |
| `npx jest staff-sse-signals.test.ts --runInBand` | PASS - 5 tests |
| `npm test -- --runInBand` | PASS - 137 suites passed, 1 skipped (138); 1661 passed, 11 skipped, 1672 total |
| `npm run type-check` | PASS (exit 0) |
| `npm run build` | PASS with the cited ephemeral placeholder variable names |
| `npm run lint` | baseline 61 errors / 11 warnings; 0 findings in owned files |
| `npx prettier --check` (owned files) | PASS |
| regression suite vs cycle-1 reconstruction | 2 failed / 15 passed (`evidence/cc2-red-proof.txt`) |

`src/app/api/events/orders/route.ts` is unchanged by correction cycle 2.

### Files changed in correction cycle 2

Modified: `src/lib/postgres-pubsub.ts`, `src/tests/postgres-pubsub-single-flight.test.ts`,
this run log, `evidence/README.md`.

New evidence: `evidence/cc2-red-proof.txt`,
`evidence/focus-post-cc2.txt`, `evidence/focus-post-cc2-run2.txt`,
`evidence/focus-results-cc2.json`, `evidence/server-startup-cc2.txt`,
`evidence/pg-stat-activity-listen-sessions-cc2.txt`.

### Residual risks (correction cycle 2)

- N-1 remains accepted: `handleDisconnect()` clears the channel set but keeps
  the session token so a retry can `LISTEN` on the surviving client.
- N-3/N-4 remain as disclosed (brittle-but-conservative route source guard;
  publish-after-NOTIFY not independently mutated).
- Two LISTEN sessions per process (one per Next module graph), `AME-017`;
  reconnect handler loss, `AME-016`; R-07 cleanup end/null ordering unchanged.
- Numbers measured on Node 24.15.0, not CI's Node 20.
