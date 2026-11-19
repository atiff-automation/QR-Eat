# Task — QR-EAT-AME-016-SSE-RECONNECT

**Status:** ready_to_commit
**Revision:** 1
**Approved revision:** 1
**Approved by:** Atiff
**Approval date:** 2026-11-19
**Approval basis:** “approved as recommended” — revision 1 as presented, D1–D6
binding, S4 (`AME-018` NOTIFY ownership) included, evidence rule as written
**Approval hash:** `sha256:762e1bc1d15ba07ced02d6327ee1ba6ec5f2bbd996574f8e9ecd5857599e9f35`
(revision-1 content as presented for approval, before this approval block was
stamped)
**Next actor:** human (commit authorization)
**Implementer session:** `ses_e0ccf77a9ffeX2U0aLsL8lfSN4`
**Verifier session:** `ses_e0cc63ffdffeatRvdddVI8yZWl`
**Diff base:** `main` `e4ee15174c01eff152ef1251ebf137c6e9289d71`
**Diff hash:** tracked
`sha256:cdba56386de31538fb0651ebfecc63c07eb31fa8b3f3563c1e9d25bede906ed6`;
code-only (lib)
`sha256:dd9a7d926b7a4c04a8d43d2abc1d6999b26b32915d24313b3d2dd7e8f24637b1`;
untracked committable set
`sha256:638efde8db0aa0bf99ed81269fcbf0f939cdfdadb59b4d43bfa167ded8a7348b`
**Review file:** `REVIEW-01.md` — PASS WITH NOTES (N-01–N-07; no blocker/high)
**Implementer:** ame-implementer
**Implementer session:**
**Verifier session:**
**Diff base:**
**Diff hash:**
**Review file:**
**Risk:** **R2** — staff realtime delivery, per-tenant event routing, operational
reliability
**Complexity:** L2
**Workflow:** BUG (root cause identified in code; no production incident yet)
**Branch:** `fix/ame-016-sse-reconnect` (create from `main` `e4ee151`; do not
push)
**Source item:** `docs/ai/BACKLOG.md` → `AME-016`
**Related:** `AME-018` (NOTIFY publication race, scope S4 below);
`docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/REVIEW-03.md` (residual risk)
**Updated:** 2026-11-19

> Planning only. This revision is not approval to edit code. No deploy,
> migration, seed, push or production configuration change is in scope.

**Implementation status:** implemented on `fix/ame-016-sse-reconnect`
(uncommitted), awaiting independent review. Evidence is in `RUN_LOG.md` →
“Implementation evidence” and `evidence/`.

## Objective

After a PostgreSQL LISTEN reconnect, staff SSE streams must keep receiving
events without the client reconnecting. Today the reconnect path calls
`cleanup()`, which calls `removeAllListeners()` on the shared emitter; that
silently deletes every per-connection `message` handler registered by
`/api/events/orders`. The socket stays open, keep-alive pings continue, and the
stream never delivers another order event until the client drops and reconnects
on its own. Fix the teardown/reconnect boundary so subscriber registrations
survive a session teardown, and close the two adjacent reconnect defects found
while fixing AME-015.

## Verified facts that shape the plan

Evidence read on 2026-11-19 at `main` `e4ee151`.

1. **The defect is a teardown boundary, not a listener leak.**
   `src/lib/postgres-pubsub.ts` `cleanup()` (lines ~725–758) ends both clients,
   resets all session/gate state and then calls `this.removeAllListeners()`
   (line 757). The route registers one emitter listener per open connection at
   `src/app/api/events/orders/route.ts:246` and removes it on connection close
   (`route.ts:364`). `cleanup()` therefore deletes application listeners that it
   does not own.
2. **The reconnect path uses `cleanup()`.**
   `handleDisconnect()` (lines ~690–723) schedules a 5 s retry that calls
   `await this.cleanup()`, then `initialize()`, then `subscribe(...)` with all
   channels. The reconnect itself succeeds; only the handler registry is lost.
   From that point the process is mute for every already-open stream.
3. **Reachability is real and silent.** Any LISTEN client `error`/`end` (database
   restart, failover, network blip, connection recycle) triggers it. Clients see
   a healthy open stream with keep-alives, so no error surfaces and no client
   reconnects automatically. Recovery happens only when the browser/Android
   client drops and reconnects on its own.
4. **AME-015 did not cause it.** The defect predates AME-015; REVIEW-03 recorded
   it as residual and AME-015 deliberately left reconnect behaviour unchanged.
   AME-015 did make the state machine stricter, so the reconnect path is now the
   main remaining correctness gap in this module.
5. **A second reconnect defect exists (R-07 from REVIEW-03).** `cleanup()` ends
   the LISTEN client **before** nulling `this.listenClient`, so the client's
   `end` handler still sees itself as current and calls `handleDisconnect()`.
   During the reconnect's own `cleanup()` that schedules another reconnect
   attempt, causing a second teardown/initialize/subscribe cycle ~5 s later.
6. **A third, low-severity defect exists (AME-018 / N-6 from REVIEW-03).**
   `openNotifyClient()` assigns `this.notifyClient = client` after its `await`
   with no ownership check, so a NOTIFY connect that completes after `cleanup()`
   is adopted, and the replacement NOTIFY client is orphaned (still connected,
   unreferenced, never ended). No duplicate frames or wrong LISTEN state.
7. **No test guards the surviving-subscriber property.**
   `src/tests/postgres-pubsub-single-flight.test.ts` covers client counts,
   additive subscriptions, generation guards and cleanup resets; none asserts
   that an existing emitter listener still fires after a reconnect.
8. **The route needs no change for the main fix.** It already registers after
   `subscribe()` and removes on close. A surviving emitter listener is exactly
   what it needs. Only change the route if a test proves otherwise.

## Binding decisions

| # | Decision | Consequence |
|---|---|---|
| D1 | Session teardown and full disposal are separate operations | The reconnect path must tear down connections and session state **without** removing subscriber listeners. Full disposal (including `removeAllListeners()`) stays available for tests and process exit, so existing callers of `cleanup()` keep today's semantics. |
| D2 | The public API is preserved | `initialize()`, `subscribe()`, `unsubscribe()`, `cleanup()`, `isConnected()` keep their signatures and documented behaviour. A new internal/soft teardown may be added; if a new public method is introduced it needs a reason and a test. |
| D3 | One reconnect, one cycle | `cleanup()` must not let the client's own `end` handler schedule a second reconnect (fact 5). A reconnect produces exactly one teardown, one initialize and one subscribe pass. |
| D4 | No shared-state redesign | Do not replace per-connection listeners with a global dispatcher, do not change the route's connection registry, and do not change the event contract. This is a teardown-boundary fix. |
| D5 | `AME-018` is included (S4) | Gate NOTIFY publication on session generation/ownership and close the abandoned client, mirroring the LISTEN generation guard. Included because it is the same lifecycle class and was found in the same review. The owner may strike S4 at approval; it then returns to the backlog. |
| D6 | Tests must fail on the current code | The reconnect-survival test and the single-reconnect test must be red before the fix; record the red proof as committable evidence. |

## Scope

### S0 — Baseline and guardrails

- Create `fix/ame-016-sse-reconnect` from `main` `e4ee151`; confirm a clean tree.
- Record the real baseline: `npm test -- --runInBand`, `npm run type-check`,
  `npm run build` (ephemeral placeholder env names only, never `.env`), and lint
  attribution for the owned files (whole-repo lint is a known red baseline).
- No push, deploy, migration, seed or production action.

### S1 — Separate session teardown from subscriber disposal

- Split `cleanup()` into:
  - a session teardown that ends the LISTEN and NOTIFY clients, clears
    reconcile state (generation bump, in-flight gates, session token, channel
    set, `isListening`, timers) and **leaves emitter listeners intact**;
  - the existing `cleanup()` behaviour (session teardown + `removeAllListeners()`)
    for tests, SIGINT/SIGTERM and any caller that wants a full reset.
- `handleDisconnect()`'s reconnect timer uses the session teardown, not the full
  reset.
- Keep the single-flight, additive-subscribe and generation guards unchanged in
  behaviour.
- Document the boundary in a comment: subscribers own their listeners and remove
  them on connection close (`route.ts:364`).

### S2 — One reconnect cycle (R-07)

- Make the client's `end` handler unable to schedule a reconnect for a client the
  manager is deliberately closing: clear the reference (or otherwise mark the
  client as intentionally closed) before awaiting `end()`, so the identity guard
  suppresses `handleDisconnect`.
- The reconnect path must end with exactly one reconnect attempt scheduled or
  run; no second attempt may appear ~5 s later.
- Preserve the existing retry budget, backoff delay, give-up release and
  `reconnectAttempts` reset on success.

### S3 — Regression tests

- New `src/tests/postgres-pubsub-reconnect.test.ts` covering the matrix below.
- Update `src/tests/postgres-pubsub.test.ts` and
  `src/tests/postgres-pubsub-single-flight.test.ts` only if full-reset semantics
  need an explicit call; do not weaken existing assertions.

### S4 — `AME-018`: NOTIFY publication race

- `openNotifyClient()` publishes the client only if it still owns the
  connection attempt; if `cleanup()` (or a replacement connect) superseded it,
  close the new client and reject or return the current one without leaking.
- `connectNotifyClient()`'s in-flight gate must not publish a superseded client.
- A `notify()` call during the race must not hang or publish on a closed client.

## Non-goals

- Changing the SSE route, event types, payloads, tenant filter, catch-up,
  keep-alive or `phase-b-counter-feed-v1`.
- A global dispatcher or one-listener refactor (D4).
- `AME-017` (one LISTEN session per process).
- Schema, migration, seed, auth, RBAC, payments.
- Deployment, push, production verification, secrets.

## Ownership

**Files/modules owned (implementer):**

```text
src/lib/postgres-pubsub.ts
src/tests/postgres-pubsub-reconnect.test.ts              (new)
src/tests/postgres-pubsub.test.ts                        (teardown call only, if needed)
src/tests/postgres-pubsub-single-flight.test.ts          (teardown call only, if needed)
src/app/api/events/orders/route.ts                       (only if a test proves it must change)
docs/ai/runs/QR-EAT-AME-016-SSE-RECONNECT/RUN_LOG.md     (append "Implementation evidence")
docs/ai/runs/QR-EAT-AME-016-SSE-RECONNECT/evidence/**    (new)
```

**Do not touch:**

```text
src/instrumentation.ts
src/lib/constants/sse.ts
src/lib/event-persistence.ts
src/lib/counter/tenant-guards.ts
prisma/**  (schema, migrations, seed)
docs/PRODUCT/**
auth, RBAC, payments
TASK.md / NEXT.md (Lead-owned)
.env* / .railway-env-*.txt / any secret or token
```

## Context budget

**Must read:**

- `AGENTS.md`, `docs/ai/PROJECT_PROFILE.md`, this `TASK.md`
- `src/lib/postgres-pubsub.ts`
- `src/app/api/events/orders/route.ts` (lines 219–260 and 348–373)
- `docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/REVIEW-03.md` (residual risk and N-6)
- `src/tests/postgres-pubsub-single-flight.test.ts` (mock harness shape)

**Read only if unclear:**

- `src/instrumentation.ts` (second subscriber, read-only)
- `src/lib/event-config.ts` (retry/backoff constants)
- `docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/RUN_LOG.md` (reconnect/cleanup context)

**Do not read by default:**

- the whole repository or the whole `docs/ai/` tree
- `../Tabtep-App`
- historical run logs other than AME-015
- `.env`, `.env.local`, `.railway-env-*.txt`
- generated build output

If a required document contradicts this task, stop and report it.

## Test plan

`src/tests/postgres-pubsub-reconnect.test.ts` (mocked `pg`, same shape as the
existing suite):

1. **Surviving subscriber (red on current code).** Register an emitter
   `message` listener, simulate a client `error`/`end`, advance the reconnect
   delay, confirm a new client is connected and all channels are `LISTEN`ed, then
   fire a notification on the new client. The listener must receive exactly one
   `message`. On current code it receives zero.
2. **No duplicate delivery.** After the reconnect, one notification yields one
   emission, not two (guards a double-subscribe).
3. **Single reconnect cycle (D3).** Count `initialize` passes and scheduled
   attempts across one forced disconnect with fake timers: exactly one reconnect
   runs, and no second one appears after another delay window.
4. **Full reset still available.** The full-disposal path removes listeners;
   the soft teardown does not. A subsequent `subscribe()` still works.
5. **Give-up path unchanged.** Retry-budget exhaustion releases the dead client
   and a later `subscribe()` rebuilds; the surviving-subscriber rule does not
   resurrect a dead session.
6. **`AME-018`.** A NOTIFY connect completing after a teardown must not overwrite
   the live `notifyClient`; the abandoned client is closed; `notify()` still
   publishes on the live client (or reconnects) and does not hang.
7. **Regression.** Existing pub/sub and staff SSE suites stay green; the
   AME-015 generation/additive tests are unchanged.

## Acceptance criteria

1. An SSE connection opened before a forced reconnect still receives order
   events after the reconnect, without the client reconnecting.
2. A reconnect produces exactly one teardown/initialize/subscribe cycle; the
   client's own `end` cannot schedule a second one.
3. Session teardown preserves subscriber listeners; full disposal still removes
   them, and both paths leave `initialize()`, `subscribe()` and `isConnected()`
   consistent.
4. No duplicate `message` emission per notification after a reconnect.
5. The retry budget, give-up release, generation guard, additive subscription and
   tenant filter behave exactly as before.
6. (`AME-018`) A NOTIFY connect superseded by teardown does not adopt the
   abandoned client or orphan the live one; no leak and no stuck publish.
7. The new tests fail on the pre-fix code for the right reasons and pass after;
   the red proof is committed as committable evidence.
8. Full tests and type-check pass; build passes (ephemeral placeholders only);
   owned files add no lint findings.
9. No contract, route, payload, tenant-filter, schema, migration, auth or payment
   change; changed files stay within the owned list.
10. No push, deploy, migration, seed or production configuration change.

## Verification commands

```text
git status --porcelain --untracked-files=all
npx jest src/tests/postgres-pubsub.test.ts src/tests/postgres-pubsub-single-flight.test.ts src/tests/postgres-pubsub-reconnect.test.ts --runInBand
npx jest src/tests/staff-sse-signals.test.ts --runInBand
npm test -- --runInBand
npm run type-check
npm run build
git diff --stat
```

Build needs non-secret build-time env; use ephemeral placeholders in the shell
only and record the variable **names**. Never print `DATABASE_URL`, tokens or
PII. Do not claim a command passed unless it was run.

Optional end-to-end (only if a disposable local database is available): force a
LISTEN client restart against a local server with one open SSE stream and confirm
frames resume without a client reconnect; record commands and results, and never
use production or staging.

## Review focus

- Subscriber ownership: teardown must not delete listeners it does not own;
  connection close must still remove them.
- Exactly one reconnect cycle; no self-triggered second attempt.
- No duplicate emission after reconnect (one handler, one client, one pass).
- Give-up and rebuild behaviour unchanged.
- `AME-018` ownership check cannot publish a closed/superseded NOTIFY client or
  deadlock `notify()`.
- No route/contract drift; tenant filter untouched.
- Tests fail before and pass after for the stated reasons.
- No secrets or PII in code, tests, logs or evidence.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Listeners now survive teardown, including in tests | Cross-test leakage, double handlers | Explicit full-disposal path for tests; test 4; connection-close removal unchanged |
| Soft teardown used where full reset was intended | Stale listeners in a caller that expected a clean slate | Keep `cleanup()` semantics; reconnect is the only soft caller; grep call sites |
| Reference cleared before `end()` changes error semantics | Missed disconnect detection | Only the deliberate-close path changes; unexpected `error`/`end` still reconnects (test 5) |
| NOTIFY ownership guard breaks publishing | Events stop reaching SSE | `notify()` must still publish/reconnect; test 6; existing NOTIFY tests stay green |
| A second reconnect is masked by fake timers | Test passes while real churn continues | Assert attempt counts, not only outcomes; inspect scheduled timers |

## Approval

**Approval applies to this exact revision only.** A material change requires a new
revision and new approval. Approval includes the R2 allowance to edit
`src/lib/postgres-pubsub.ts` and, only if a test proves it necessary, the SSE
route. Approval is not deploy, push, migration or seed permission.

## Commit gate

- [ ] Implementer is `ame-implementer`, not the Lead
- [ ] Implementer session recorded
- [ ] Verifier is a fresh `ame-verifier`
- [ ] Verifier session recorded
- [ ] Review PASS
- [ ] Review diff hash matches the current diff
- [ ] Changed files are within the owned files
- [ ] Exact path list published
- [ ] Exact commit message published
- [ ] Commit authorization recorded (R2)
- [ ] Human approved
- [ ] No unrelated changes

**Proposed commit message (awaiting authorization):**

```text
fix(events): keep staff SSE subscribers across LISTEN reconnects

- separate session teardown from full listener disposal
- reconnect without dropping per-connection message handlers
- prevent a client end from scheduling a second reconnect
- gate NOTIFY publication on ownership and close abandoned clients
- add reconnect-survival, single-cycle and notify-race regression tests
```

**Exact path list (11 files, base `e4ee151`):**

```text
docs/ai/ACTIVE.md
docs/ai/BACKLOG.md
src/lib/postgres-pubsub.ts
src/tests/postgres-pubsub-reconnect.test.ts
docs/ai/runs/QR-EAT-AME-016-SSE-RECONNECT/TASK.md
docs/ai/runs/QR-EAT-AME-016-SSE-RECONNECT/RUN_LOG.md
docs/ai/runs/QR-EAT-AME-016-SSE-RECONNECT/NEXT.md
docs/ai/runs/QR-EAT-AME-016-SSE-RECONNECT/REVIEW-01.md
docs/ai/runs/QR-EAT-AME-016-SSE-RECONNECT/evidence/red-proof-prefix.txt
docs/ai/runs/QR-EAT-AME-016-SSE-RECONNECT/evidence/green-focused.txt
docs/ai/runs/QR-EAT-AME-016-SSE-RECONNECT/evidence/real-pg-reconnect-probe.txt
```

No `.env`, migration, seed, auth, payment, contract or generated file is in the
list. The route and the two existing pub/sub test files are unchanged.

**Commit authorized by:** Atiff
**Authorization date:** 2026-11-19
**Authorization scope:** one local commit with the exact path list and message
above, then push, merge to `main` and deploy with a health/SSE smoke. No
production migration or seed.

**Post-commit state:** pending — recorded after the deploy.

## Residual risks and follow-ups

- `AME-017` (one LISTEN session per process) remains deferred.
- Half-subscribed session after a mid-pass failure still relies on `pg`
  `error`/`end` signalling; unchanged.
- A permanently failed reconnect still leaves streams silent until the client
  reconnects; the fix covers successful reconnects only. Consider a visible
  connection-state signal as a separate product decision.
- Evidence is mocked plus, if available, one disposable-database check; no
  production verification.

## Return format

```text
Summary:
Files changed:
Commands run and results (incl. red proof and reconnect observations):
Deviations:
Blockers:
Residual risks:
Recommended next action:
```
