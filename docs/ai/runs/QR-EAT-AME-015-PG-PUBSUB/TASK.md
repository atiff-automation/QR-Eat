# Task — QR-EAT-AME-015-PG-PUBSUB

**Status:** done
**Revision:** 2
**Approved revision:** 2 (revision 1 code, revision 2 acceptance wording)
**Approved by:** Atiff
**Approval date:** 2026-11-19
**Approval basis:** “Approve rev 2 + AME-017 (Recommended)” — D10 accepted, amended
AC1/AC4/AC12 approved, `AME-017` accepted as a deferred backlog item
**Approval hash:** revision 1
`sha256:fe488497a1401191ea5f0f5a83ea9dc63d0a8df43e7b798a91117359693219d3`;
revision 2
`sha256:6a64a8d7a88cd0aefcad18bc6933328be1238b587a9c4df3224dbd72d8e77734`
(pre-stamp content; stamping changes only the header and approval blocks)
**Next actor:** none (local commit complete; push, deploy and production
migration are separate, unauthorized gates)
**Implementer session:** `ses_e0dd32099ffe1ohd5JI0EdmkNZ` (implementation +
correction cycles 1–2)
**Verifier session:** `ses_e0d9ffbf4ffeYFpxWBGqBTFnEs` (REVIEW-01);
`ses_e0d74a8acffeOVGZ6M321yCZIX` (REVIEW-02);
`ses_e0cf4e15fffeIVe0x1gR0SLy02` (REVIEW-03)
**Diff base:** `main` `024f22d8e49818a4779a2cade5ffc216fd6e9241`
**Diff hash:** tracked
`sha256:2b158915eee9874828c2c85a1b6dffca2eaea00aeb73fb9528a086fd427ab468`;
lib `50b926fd…`, route `cfc8bd88…`, new test `e97f4804…`
**Review file:** `REVIEW-01.md`, `REVIEW-02.md`, `REVIEW-03.md` — final
**PASS WITH NOTES**; all REVIEW-01/02 findings closed; N-6 (NOTIFY connection
leak) accepted as residual for follow-up
**Implementer:** ame-implementer
**Implementer session:**
**Verifier session:**
**Diff base:**
**Diff hash:**
**Review file:**
**Risk:** **R2** — staff realtime feed, per-tenant event delivery, operational
reliability
**Complexity:** L2
**Workflow:** BUG (root cause identified, reliability fix)
**Branch:** `fix/ame-015-single-flight-pubsub` (create from `main` `024f22d`;
do not push)
**Source item:** `docs/ai/BACKLOG.md` → `AME-015`
**Cross-repo input:** `../Tabtep-App/docs/ai/handoffs/QR-EAT-AME-015-PG-PUBSUB.md`
**Updated:** 2026-11-19

> Revision 2 amends acceptance wording only. Revision 1 is implemented and
> verified by evidence; no product code changed after the approval. Revision 2
> needs approval before verification starts. No deploy, migration, seed, push or
> production configuration change is in scope.

## Revision history

| Rev | Date | Change | Basis |
|---|---|---|---|
| 1 | 2026-11-19 | Initial approved contract (D1–D9) | Owner approval |
| 2 | 2026-11-19 | Corrects the “one LISTEN client per process” assumption: Next.js bundles `instrumentation.ts` and the route separately, so each module graph has its own singleton. AC1/AC4 reworded to the guarantee actually delivered and measured; D10 added; residual risk replaced. No code, test or scope change. | Implementer evidence + Lead diff review |

**Implementation status:** revision 1 is implemented on
`fix/ame-015-single-flight-pubsub` (uncommitted) with correction cycles 1 and 2
applied. Evidence is in `RUN_LOG.md` and `evidence/`. Review 01, 02 and 03
returned PASS WITH NOTES; review 03 closes F-1/R-06 and N-2. The change is ready
for the commit gate and awaits explicit owner authorization.

## Objective

Remove the duplicate staff SSE refresh frames observed in the B3-S staging gate
by making PostgreSQL pub/sub listener setup single-flight and additive per
channel: concurrent first connections in one module instance must share one
LISTEN client and create one LISTEN per channel, while preserving tenant
filtering, catch-up, keep-alive, ack/ticket behaviour and the frozen
`phase-b-counter-feed-v1` event contract.

## Verified facts that shape the plan

Evidence read on 2026-11-19 at `main` `024f22d` (worktree
`gentle-mountain`, clean tree).

1. **Two defects, one symptom.**
   `src/app/api/events/orders/route.ts` `setupPostgresSubscription()` (lines
   219–258) gates on `pgPubSub.isConnected()` and then awaits
   `initialize()` + `subscribe()`. `isConnected()` returns
   `isListening && listenClient !== null`, and `isListening` is only set after
   all `LISTEN` queries resolve. Two concurrent first connections therefore both
   observe "not connected".
2. **`initialize()` is not idempotent.** It unconditionally assigns
   `this.listenClient = new Client(...)` (`src/lib/postgres-pubsub.ts` lines
   210–254) and awaits `connect()`. Two concurrent callers create two live
   LISTEN clients. Both keep a `notification` handler, so each notification
   emits `message` twice and every active connection enqueues two SSE frames.
   This matches the B3-S observation (`docs/ai/runs/QR-EAT-B3-S-COUNTER-FEED/RUN_LOG.md`
   lines 297–309): duplicate refresh signals only, one event/ticket/audit row.
3. **A second process-level boot path exists.** `src/instrumentation.ts`
   (lines 25–34) also calls `initialize()` + `subscribe()`, but with only 5
   channels. The route subscribes 10. A naive "one promise for whatever the
   first caller asked for" single-flight would silently drop
   `order_items_added`, `order_cancelled`, `order_recalled`,
   `order_recall_cleared` and `table_status_changed` whenever instrumentation
   wins the race. Channel coverage must therefore be additive, not
   first-caller-wins.
4. **Channel coverage was conditionally correct (rev 2 correction).** Fact 4
   assumed instrumentation and the route share one module instance. Measured on
   the built server, Next bundles them separately (fact 10), so the route graph
   always saw `isConnected() === false` and did subscribe its 10 channels; the
   skip was latent, not active. The unconditional `subscribe()` still removes
   the latent skip and the race, and is required for the union if a future build
   dedupes the module.
5. **`subscribe()` LISTENs one channel at a time** (lines 307–326) and sets
   `isListening = true` only after the whole loop. Failure leaves the earlier
   channels listened and the later ones missing, with no bookkeeping, so a retry
   cannot tell what is already subscribed.
6. **No channel/payload/contract artefacts are involved.** `PG_EVENTS`,
   `OrderFeedSignalEvent`, `staffSseEventTypeForChannel`, `SSE_EVENT_TYPES` and
   the `/api/events/orders` wire format are frozen by
   `docs/PRODUCT/COUNTER-FEED-CONTRACT.md`.
7. **Reconnect path (pre-existing, not this task).** `handleDisconnect()` runs
   `cleanup()` → `initialize()` → `subscribe(...)`; `cleanup()` calls
   `removeAllListeners()`, which also removes the per-connection `message`
   handlers registered by the route. After a successful reconnect the SSE
   connections keep pinging but stop receiving events until the client
   reconnects. Out of scope per the handoff ("reconnect behaviour unchanged");
   recorded as residual risk with a proposed `AME-016`.
8. **Baseline docs are stale.** `AGENTS.md` and `PROJECT_PROFILE.md` cite 524
   tests; the B3-S record has 1640 passing / 11 skipped across 136 suites. The
   implementer must record the real pre-change baseline, not these numbers.
9. **B3-S gate harness is available for integration evidence**:
   `docs/ai/runs/QR-EAT-B3-S-COUNTER-FEED/evidence/{fixtures.cjs,gate.cjs}`
   with `5.sse.delivered` recording `duplicateFrames`. The committed copy
   redacts the disposable local JWT signing value
   (`fixtures.cjs` line 12) and must not be filled in the repository.
   PostgreSQL server binaries exist locally (`/usr/lib/postgresql/{16,17,18}`).
10. **Next bundles instrumentation and routes separately (rev 2, measured).**
    `pg_stat_activity` on the built server shows two LISTEN sessions: one whose
    sequence ends at `LISTEN restaurant_notification` (instrumentation's 5) and
    one ending at `LISTEN table_status_changed` (route's 10). Each graph has its
    own `pgPubSub` singleton, so single-flight is a per-instance guarantee. Only
    the route graph registers SSE `message` handlers, so the shared channels
    produce exactly one frame per connection. The measured end-to-end
    `duplicateFrames` is `0` (`evidence/focus-results.json`), and the guarantee
    is sound under either bundling layout.

## Binding decisions

| # | Decision | Consequence |
|---|---|---|
| D1 | `initialize()` becomes single-flight and idempotent | At most one LISTEN client per module instance (rev 2). Concurrent callers share one in-flight promise. A second call while a LISTEN client exists does not create another client. `connectNotifyClient()` keeps its existing independent gate. |
| D2 | Initialization failure is atomic | If the pass fails (LISTEN connect or NOTIFY connect), the client created by that pass is closed and the reference cleared before the gate clears, so a later retry starts clean and never leaves an orphan listener emitting `message`. |
| D3 | `subscribe()` is additive and serialized, not first-caller-wins | Concurrent calls queue behind one pass; channels already `LISTEN`ed on the current session are skipped; channels not yet subscribed are `LISTEN`ed in a follow-up pass. This is what keeps instrumentation (5 channels) + route (10 channels) correct when they share a module instance, and what keeps each graph's own coverage complete when they do not (D10). |
| D4 | Session bookkeeping is reset with the session | `cleanup()` clears the subscribed-channel set and any in-flight gates. A detected disconnect clears the channel set so a later `subscribe()` re-issues `LISTEN` instead of silently succeeding. |
| D5 | Reconnect give-up must not mute the process permanently | Today a later `initialize()` rebuilds the client after the retry budget is exhausted. With D1 that rebuild disappears unless the give-up branch releases the dead LISTEN client (end + clear) so the next connection can rebuild. `initialize()` keeps resetting `reconnectAttempts`. |
| D6 | The SSE route stops using the check-then-init idiom | Replace the `if (!pgPubSub.isConnected()) { initialize(); subscribe(); }` block with an unconditional `await pgPubSub.subscribe(...)`. Keep the surrounding `try/catch` (log, do not fail the stream), the per-connection `messageHandler` registration and `cleanup()` removal exactly as they are. |
| D7 | No contract or semantics change | No channel rename, payload change, new event type, cursor, catch-up, keep-alive, tenant-filter or ack change. `canReceiveRestaurantEvent` stays the single fail-closed filter. |
| D8 | Evidence is two-layer | Unit regression proves single-flight (one client, one LISTEN per channel, one emission). The B3-S gate proves the observed symptom is gone (`duplicateFrames === 0`). If the gate cannot run, record the blocker and make no duplicate-count claim; the owner decides. |
| D9 | Scope stays on the listener lifecycle | The reconnect handler-loss defect (fact 7), instrumentation channel list, `activeConnections` keying and `notify()` retry logic are not changed. |
| D10 | One LISTEN session per module graph is accepted (rev 2) | Next bundles instrumentation and routes separately, so the process holds two single-flight sessions. The contract guarantees one client and one LISTEN per channel **per module instance**, one refresh frame per connection end-to-end, and complete channel coverage in the graph that serves SSE. A process-wide single session would need a shared module singleton; out of scope, proposed follow-up `AME-017` (deferred). |

## Scope

### S0 — Baseline and guardrails

- Create `fix/ame-015-single-flight-pubsub` from `main` `024f22d`; confirm a
  clean tree before editing.
- Record the real baseline for `npm test -- --runInBand`, `npm run type-check`
  and `npm run build` (counts and pass/fail). Do not cite the stale 524 figure.
- Record the current lint errors/warnings attributable to the owned files
  (run `npm run lint` and filter its output; whole-repo lint is a known red
  baseline and is not a gate), so the change is not blamed for pre-existing
  findings.
- No push, deploy, migration, seed, `.env` write or production action.

### S1 — Single-flight initialization (`src/lib/postgres-pubsub.ts`)

- Add one in-flight `initializePromise`; return the shared promise to
  concurrent callers.
- Return early (without creating a client) when a LISTEN client already exists;
  still ensure the NOTIFY client through the existing `connectNotifyClient()`
  gate.
- Assign `this.listenClient` only after `connect()` resolves, so a concurrent
  `subscribe()` can never observe a half-initialized client.
- Wrap success and failure so the gate always clears, and on failure close the
  client created by that pass and null the reference.
- Keep signal-handler registration once-only and `reconnectAttempts = 0` on
  success.

### S2 — Additive serialized subscription (`src/lib/postgres-pubsub.ts`)

- Add a `subscribedChannels: Set<string>` representing the current LISTEN
  session, plus one in-flight/queued subscription pass.
- `subscribe(...channels)`: join the in-flight pass if any, then `LISTEN` only
  channels not already in the set, and add each channel to the set only after
  its `LISTEN` succeeds.
- A failed channel stops that pass (reject to the caller), leaves earlier
  channels in the set, and lets the next call retry the rest.
- `unsubscribe(...channels)` removes successfully un-listened channels from the
  set; keep its current guards.
- `isConnected()` semantics unchanged (`isListening && listenClient !== null`);
  set `isListening` only after a pass that leaves at least one channel
  subscribed, and clear it on disconnect/cleanup.
- Preserve all existing log lines that operators rely on, or replace them with
  equivalent one-line messages (no secrets, no `DATABASE_URL`).

### S3 — Disconnect, reconnect and cleanup state

- `handleDisconnect()`: clear `isListening` and the subscribed-channel set.
- On retry-budget exhaustion: log, then release the dead LISTEN client
  (best-effort `end()`, clear reference) so the next `subscribe()` can rebuild.
- `cleanup()`: end clients as today, then clear `listenClient`,
  `notifyClient`, `initializePromise`, the subscription-pass gate,
  `subscribedChannels`, `isListening` and existing timers/listeners. Keep
  `removeAllListeners()` (D9).
- Reconnect still runs `initialize()` + `subscribe(Object.values(PG_EVENTS))`
  and must end with one client and one LISTEN per channel.

### S4 — SSE route call site (`src/app/api/events/orders/route.ts`)

- Replace the `isConnected()` gate with an unconditional
  `await pgPubSub.subscribe(...)` using the same 10 channels (D6).
- Keep `try/catch`, `activeConnections` bookkeeping, `messageHandler`
  registration, keep-alive and `cleanup()` untouched.

### S5 — Regression tests (`src/tests/postgres-pubsub-single-flight.test.ts`, new)

- New test file with its own `jest.mock('pg')` factory that records, per
  client: `connect`, `query`, `end`, and the registered `on` handlers.
- Keep the existing `src/tests/postgres-pubsub.test.ts` NOTIFY tests unchanged
  and green.
- Cover the matrix in "Test plan" below. Do not weaken existing assertions.

## Non-goals

- Changing `phase-b-counter-feed-v1`, event names, payloads or SSE wire format.
- A second staff stream, `id:` cursors, catch-up redesign or keep-alive change.
- Fixing reconnect handler loss (fact 7), instrumentation channel coverage,
  `activeConnections` keying or `notify()`/NOTIFY retry behaviour.
- Prisma schema, migrations, seed, permissions, auth, RBAC, payments, tenant
  guards.
- Load testing, multi-process (`LISTEN` per worker) design, Redis, or a
  PostgreSQL connection pool for LISTEN.
- Deploy, push, production verification, `.env` or secret changes.

## Ownership

**Files/modules owned (implementer):**

```text
src/lib/postgres-pubsub.ts
src/app/api/events/orders/route.ts
src/tests/postgres-pubsub-single-flight.test.ts        (new)
src/tests/postgres-pubsub.test.ts                      (only if a reset hook is unavoidable; prefer unchanged)
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/RUN_LOG.md       (append "Implementation evidence" only)
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/**      (new, if integration evidence is captured)
```

**Do not touch:**

```text
src/instrumentation.ts
src/lib/constants/sse.ts
src/lib/event-persistence.ts
src/lib/counter/tenant-guards.ts
prisma/**  (schema, migrations, seed)
docs/PRODUCT/**  (incl. COUNTER-FEED-CONTRACT.md)
src/lib/auth*.ts, src/lib/device-auth.ts, src/lib/rbac/**, payment code
TASK.md / NEXT.md  (Lead-owned)
.env* / .railway-env-*.txt / any secret or token
```

**Lead-owned after approval:** `docs/ai/ACTIVE.md` pointer,
`docs/ai/BACKLOG.md` (`AME-015` status/link; proposed `AME-016`),
`TASK.md`, `NEXT.md`, review files.

## Context budget

**Must read:**

- `AGENTS.md`, `docs/ai/PROJECT_PROFILE.md`, this `TASK.md`
- `docs/PRODUCT/COUNTER-FEED-CONTRACT.md` §SSE (types/payload/tenant rules
  only; confirm no change is proposed)
- `src/lib/postgres-pubsub.ts`
- `src/app/api/events/orders/route.ts`
- `src/instrumentation.ts` (read-only; explains the 5-vs-10 channel sets)
- `src/tests/postgres-pubsub.test.ts`
- B3-S `RUN_LOG.md` lines 281–309 (observation and harness semantics)

**Read only if unclear:**

- `src/lib/event-config.ts` (retry constants)
- `src/lib/event-persistence.ts` (only if a test seam is needed)
- `docs/ai/runs/QR-EAT-B3-S-COUNTER-FEED/evidence/{gate.cjs,fixtures.cjs}`
  (integration evidence only)
- `src/tests/staff-sse-signals.test.ts` (regression context)

**Do not read by default:**

- the whole repository or the whole `docs/ai/` tree
- `../Tabtep-App` implementation
- historical run logs other than the B3-S observation
- `.env`, `.env.local`, `.railway-env-*.txt`
- generated build output

If a required document contradicts this task, stop and report it.

## Test plan

New file `src/tests/postgres-pubsub-single-flight.test.ts`:

1. **Concurrent cold subscribe.** `Promise.all([subscribe(A,B), subscribe(A,B)])`
   → exactly two `Client` instances total (one LISTEN, one NOTIFY); exactly one
   `LISTEN A` and one `LISTEN B`, both on the same client; the LISTEN client
   registered exactly one `notification` handler.
2. **Concurrent `initialize()`.** Two simultaneous calls → two clients total
   (LISTEN + NOTIFY), not four; both resolve.
3. **Additive channel sets.** `subscribe(A,B)` then concurrent
   `subscribe(A,B,C)` → A and B issued once each, C issued once, still one
   LISTEN client. This is the instrumentation-5 vs route-10 shape.
4. **Failure clears the gate.** First `LISTEN` rejects → `subscribe` rejects,
   the partial client is closed and cleared, and a second `subscribe` succeeds
   with a new client and re-issues `LISTEN`.
5. **One emission per notification.** Invoke the captured `notification`
   handler once → `pgPubSub` emits `message` exactly once. Assert only one
   client holds a notification handler.
6. **Cleanup reset.** After `cleanup()`, `subscribe` creates a fresh LISTEN
   client, `.end()` was called on the old one, and the channel set was cleared
   (the new session re-issues `LISTEN`).
7. **Disconnect state.** Captured `end` handler clears `isConnected()` and the
   channel set; a subsequent `subscribe` re-issues `LISTEN` on the live client
   (or rebuilds after give-up) without creating a second live listener.

Optional (fake timers, only if stable): retry-budget exhaustion releases the
client and the next `subscribe` rebuilds exactly one client.

Regression that must stay green: `src/tests/postgres-pubsub.test.ts`,
`src/tests/staff-sse-signals.test.ts`, `src/tests/order-events-*.test.ts`,
`src/tests/tenant-*.test.ts`.

**Integration evidence (D8).** On a disposable local database only:

- start a throwaway PostgreSQL (`initdb`/`pg_ctl` under `/tmp/opencode`,
  non-production port), `npx prisma migrate deploy`, load
  `evidence/fixtures.cjs` (two tenants; do **not** run `npm run db:seed`);
- mint tokens with the same disposable local signing value configured for that
  server process, and keep the value out of the repository and the log
  (`[local-gate-key-redacted]` convention);
- `npm run start` on a spare port, note from the startup log whether
  `[Server Startup] PostgreSQL pub/sub initialized successfully` appears;
- run the B3-S gate (or a focused two-tenant concurrent-SSE script) and record
  `5.sse.delivered.duplicateFrames` plus `5.sse.tenant-isolated`. Target
  `duplicateFrames === 0` and no tenant-B leakage;
- copy the scripts and logs into `evidence/` with the signing value redacted, or
  record the environment blocker and make no weakness-hiding claim.

## Acceptance criteria

1. Two simultaneous first `subscribe()` calls on a cold module instance create
   exactly one LISTEN client and one `LISTEN` per requested channel.
2. Concurrent `initialize()` calls cannot create a second LISTEN client, and an
   `initialize()` after success is a no-op for the LISTEN client.
3. A failed initialization/subscription leaves no orphan listener, clears the
   gate, and the next call retries successfully.
4. Within one module instance, instrumentation's 5-channel set followed by the
   route's 10-channel set leaves all 10 `LISTEN`ed exactly once, and every
   channel the SSE route maps is subscribed in the graph that serves SSE
   (rev 2: the guarantee is per module instance, see D10).
5. The SSE route calls the single-flight API unconditionally; per-connection
   handler registration, keep-alive, catch-up and cleanup are unchanged.
6. Tenant filtering still fails closed (`canReceiveRestaurantEvent`); no payload,
   channel or wire-format change.
7. One notification yields one `message` emission and exactly one refresh frame
   per active connection; the B3-S-style duplicate count is `0` when the gate is
   run (measured pre-fix `2`, post-fix `0`).
8. Reconnect and cleanup still work: after disconnect the channel set is
   cleared, reconnect re-`LISTEN`s every channel on one client, and retry
   exhaustion does not permanently mute the process.
9. The new regression suite and the existing pub/sub/SSE suites pass.
10. Full tests and type-check pass; build passes or a pre-existing environment
    limitation is proven to be unrelated and recorded; owned files add no lint
    errors.
11. No schema/migration/seed/deploy/contract/auth change; changed files are
    within the owned list.
12. On the built server, each module graph holds one single-flight LISTEN
    session, tenant B receives none of tenant A's frames, and the integration
    evidence in `evidence/` is bound to the disposable local database (rev 2,
    D10).

## Verification commands

```text
git status --porcelain
npx jest src/tests/postgres-pubsub.test.ts src/tests/postgres-pubsub-single-flight.test.ts --runInBand
npx jest src/tests/staff-sse-signals.test.ts --runInBand
npm test -- --runInBand
npm run type-check
npm run build
git diff --stat
```

Integration (disposable local DB only, per D8): `initdb` → `pg_ctl` →
`prisma migrate deploy` → fixtures → `npm run start` → gate script. Record
commands, ports, counts and the duplicate count. Never print `DATABASE_URL`,
tokens, the signing value or PII.

Do not claim a command passed unless it was run. If build needs build-time env,
use ephemeral non-secret placeholders in the shell, do not write `.env`, and
record the variable **names** only.

## Review focus

- Single-flight correctness: one client, one LISTEN per channel, one emission;
  no orphan client on any failure path.
- Additive semantics for differing channel sets (the instrumentation/route
  split) — a first-caller-wins promise is a defect.
- State reset on disconnect/cleanup/give-up; no permanent mute.
- Route diff is minimal and does not touch handler/keep-alive/catch-up logic.
- No contract drift: channels, payloads, types, tenant filter unchanged.
- Tests fail before and pass after (prove the regression test is red on the
  pre-fix code).
- No secrets, tokens or PII in code, logs or evidence.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Over-broad single-flight drops channels | New B3 signals stop arriving silently | D3 additive pass + test 3 + integration duplicate/tenant checks |
| Early return on existing client masks a dead client | Staff feed silently mute after reconnect give-up | D5 release-on-give-up + test 7 |
| Partial-failure bookkeeping drift | Retry skips a channel, or duplicate `LISTEN` | Add channel to set only after success; clear set on disconnect/cleanup |
| Test mock hides real pg queueing behaviour | Unit green, integration still duplicates | D8 integration run; assert per-client LISTEN counts, not just totals |
| Reconnect handler loss (pre-existing) misread as this fix regressing | Confusing review | Documented in fact 7 / residual risk / proposed `AME-016` |
| Build requires build-time env | False red gate | Ephemeral placeholders, record names only |

## Approval

**Approval applies to this exact revision only.** A material change requires a
new revision and new approval. Approving includes the R2 allowance to edit the
staff SSE route call site (`src/app/api/events/orders/route.ts`) named above.
Approval is not deploy, push, migration or seed permission.

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
fix(events): single-flight PostgreSQL pub/sub listener setup

- share one in-flight initialize() and keep one LISTEN client
- make subscribe() additive: one LISTEN per channel per session
- abandon an initialize pass superseded by cleanup; reset listener state
- guarantee channel coverage across module graphs and remove the check-then-init race
- add duplicate-init, session-generation and route-guard regression tests
```

**Exact path list (34 files, base `024f22d`):**

```text
docs/ai/ACTIVE.md
docs/ai/BACKLOG.md
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/TASK.md
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/RUN_LOG.md
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/NEXT.md
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/REVIEW-01.md
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/REVIEW-02.md
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/REVIEW-03.md
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/README.md
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/cc2-red-proof.txt
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/correction-red-proof.txt
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/fixtures-local.cjs
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/focus-post.txt
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/focus-post-cc1.txt
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/focus-post-cc1-run2.txt
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/focus-post-cc2.txt
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/focus-post-cc2-run2.txt
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/focus-prefix.txt
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/focus-results.json
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/focus-results-prefix.json
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/focus-results-cc1.json
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/focus-results-cc2.json
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/mutation-first-caller-wins.txt
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/pg-stat-activity-listen-sessions.txt
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/pg-stat-activity-listen-sessions-cc1.txt
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/pg-stat-activity-listen-sessions-cc2.txt
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/run-focus.cjs
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/server-startup.txt
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/server-startup-cc1.txt
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/server-startup-cc2.txt
docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/evidence/unit-red-proof.txt
src/lib/postgres-pubsub.ts
src/app/api/events/orders/route.ts
src/tests/postgres-pubsub-single-flight.test.ts
```

No `.env`, migration, seed, auth, payment, contract or generated file is in the
list. The commit is local only; push, deploy and production migration remain
separate, unapproved gates.

**Commit authorized by:** Atiff
**Authorization date:** 2026-11-19
**Authorization scope:** one local commit, exact path list above, exact message
above. No push, deploy, production migration or seed. The commit SHA is recorded
in the session report; a separate docs commit can record it in this file.

**Post-commit state:** local commit created from `fix/ame-015-single-flight-pubsub`
(base `024f22d`). Push, deploy and production migration remain unauthorized.

## Residual risks and follow-ups

- **Reconnect handler loss (pre-existing).** `cleanup()` →
  `removeAllListeners()` drops route `message` handlers, so after a reconnect the
  open SSE streams stop receiving events until they reconnect. Not fixed here
  (D9). Proposed backlog item `AME-016` (owner approval required before editing
  `BACKLOG.md`).
- **Two module graphs, two LISTEN sessions (rev 2, measured).** Next bundles
  `instrumentation.ts` and the route separately, so each graph holds one
  single-flight session and the five shared channels are `LISTEN`ed by both.
  Only the route graph registers SSE handlers, and the measured end-to-end
  result is exactly one frame and zero leakage. The cost is one extra idle
  connection per process. A process-wide singleton is proposed as `AME-017`
  (deferred, not required for correctness).
- **Half-subscribed session after a mid-pass failure.** The session is kept so
  the next call retries the remainder; if the socket is dead, the client
  error/end handler clears it and the existing reconnect runs.
- **No connection-pool integration.** LISTEN uses a dedicated client; unchanged.
- **Mocked concurrency.** Unit tests simulate concurrency deterministically; the
  B3-S gate is the only end-to-end proof and depends on a local disposable DB.

## Return format

```text
Summary:
Files changed:
Commands run and results (incl. duplicateFrames and tenant check, or blocker):
Deviations:
Blockers:
Residual risks:
Recommended next action:
```
