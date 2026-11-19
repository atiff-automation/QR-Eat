# Review 02 — QR-EAT-AME-015-PG-PUBSUB

**Reviewer:** fresh `ame-verifier` (session `ses_e0d74a8acffeOVGZ6M321yCZIX`),
independent of the implementer, read-only
**Date:** 2026-11-19
**Spec:** `TASK.md` revision 2 (approved); D1–D10, S0–S5, AC1–AC12
**Scope:** closure of `REVIEW-01.md` R-01–R-07 plus anything the correction
introduced
**Verdict:** **PASS WITH NOTES**
**Risk:** R2

## Diff identity

| Item | Value |
|---|---|
| Base commit | `024f22d8e49818a4779a2cade5ffc216fd6e9241` |
| Tracked diff | `sha256:0cc43dd3713705964225e3b639e46a219c90c918927a7aa6b71ad24b70a7fd07` |
| Committable untracked set (22 files) | `sha256:f18b9d248279b370ed273f78d7358c206449f53dfba3aabaf3479b33548d99b5` |
| `src/lib/postgres-pubsub.ts` | `e3b922a5520d62be00f9c3d22fed5cea1cfa83596c1ca7448da579a130be3c77` |
| `src/app/api/events/orders/route.ts` | `cfc8bd881b9d8a98093444eb693db3c09d6e9c5b01207e8a8fc055d3944a399c` |
| `src/tests/postgres-pubsub-single-flight.test.ts` | `7d6ae416c4c0e01bb3c9caffc14f341aa17fe2f256d1eccca98addab8ebeb65e` |

The untracked aggregate includes `TASK.md`, `NEXT.md`, `REVIEW-01.md`,
`RUN_LOG.md` and the 17 evidence files, so writing this review changes that
aggregate. The three source hashes are the stable binding for the code.

## Closure of REVIEW-01

| ID | Severity | Status | Independent evidence |
|---|---|---|---|
| R-01 | medium | **Closed** | New test gates the first `LISTEN` on a deferred promise, starts a larger concurrent set inside that window, asserts one `LISTEN` per channel. Mutant `if (previous) return previous;` fails exactly that test (1 failed / 14 passed); restored file hash matches the reviewed source. |
| R-02 | medium | **Closed** | Session token created per session, published with the client only after both connects, cleared on failure/release/cleanup, re-checked after every `LISTEN`; a stale pass throws instead of recording. Original interleaving reproduced and now passes; cycle-0 reconstruction fails exactly the two new tests. Mid-pass failure retries only the remainder. |
| R-03 | medium | **Closed** | `git check-ignore` returns nothing for the run directory; every cited evidence file is listed by `git status --untracked-files=all` and exists on disk; no stale reference to a renamed file. |
| R-04 | low | **Closed** | Mutation matrix: removing `new Set(channels)`, clearing the set on failure, dropping `TABLE_STATUS_CHANGED` from the route, or reintroducing the `isConnected()` gate each fail the intended test. |
| R-05 | low | **Closed (not executed)** | Both harness scripts take `GATE_*` env vars with usable defaults, resolve the repo from the script, contain no personal absolute path, and `node --check` passes. The README table matches the code. |
| R-06 | note → **low** | **Partly closed** | The token guards *subscribe* passes only; the *initialize* pass still publishes unconditionally, so `cleanup()` concurrent with an in-flight `initialize()` can leave two live LISTEN clients. Reproduced deterministically (see F-1 below). |
| R-07 | note | **Unchanged** | Pre-existing `cleanup()` `end()`/null ordering is identical to base, as instructed. |

## Findings

| ID | Severity | Location | Issue | Status |
|---|---|---|---|---|
| F-1 | **low** | `src/lib/postgres-pubsub.ts:241-251, 298-307, 704-735` | `cleanup()` nulls `initializePromise` while `openListenSession()` is in flight; that pass then publishes its client and token unconditionally. With a second `initialize()` after the cleanup, two LISTEN clients with `notification` handlers exist; a `subscribe()` in the window makes both `LISTEN` the same channel → one `NOTIFY` emitted twice. Probe observed `liveClients: 3`, `liveWithHandler: 2`, `clientsListeningChannel: 2`, `emissions: 2`. | **Open** — needs a stale-epoch guard or an explicit follow-up. Reachable only through reconnect/SIGTERM `cleanup()` landing inside the connect/NOTIFY window; pre-fix leaked clients on any concurrency, so this is not a new class. |
| N-1 | note | `src/lib/postgres-pubsub.ts:659-663` | `handleDisconnect()` clears the channel set but not `listenSessionToken`, although the checklist says the token is cleared on disconnect. Judged benign: the token is per client, and a retry must be able to `LISTEN` on the surviving client. | Accepted with rationale |
| N-2 | note | `RUN_LOG.md:452-453` | The recorded “restored file hash” `1a61fc…` matches none of the owned files and does not name its file; not reproducible, likely stale from before the route-guard fix. | **Documentation defect — correct or remove before the commit gate** |
| N-3 | note | `src/tests/postgres-pubsub-single-flight.test.ts:508-539` | The route guard is a source-text regex: a comment naming `pgPubSub.isConnected()` fails it, and body extraction depends on a `\n}\n` terminator. Brittle, cannot false-pass a channel removal or a reintroduced gate. | Accepted, disclosed in `RUN_LOG.md` |
| N-4 | note | `src/tests/postgres-pubsub-single-flight.test.ts:400-435` | “Publish only after the NOTIFY connect” is not independently guarded; moving publication back before `connectNotifyClient()` while keeping the token still passes 15/15 (mutant B). The token is the load-bearing guard and is correct. | Accepted |
| N-5 | low | `evidence/fixtures-local.cjs:15-17`, `run-focus.cjs:24-26` | The default still names a fixed loopback database (`postgres@127.0.0.1:55433/qreat_gate015`); no credentials, overridable, trust auth. | Accepted / recorded |

No secret, token, JWT key, credential-bearing URL or PII was found in code,
tests, run log or evidence.

## Acceptance criteria (corrected code)

| AC | Result | Basis |
|---|---|---|
| 1 | met | concurrent cold subscribers → one client, one `LISTEN` per channel |
| 2 | met | concurrent `initialize()` → no second client; post-success no-op |
| 3 | met for the tested paths and the R-02 interleaving | mutants A/C; gates null after rejection |
| 4 | met | 5→10 union test; D10 accepted |
| 5 | met | single route hunk; body otherwise byte-identical |
| 6 | met | `PG_EVENTS`, payloads, mapper, tenant filter untouched |
| 7 | met | unit emission test; end-to-end `duplicateFrames 0` from committed JSON, not re-run |
| 8 | met | disconnect/cleanup/give-up tests |
| 9 | met | 2 suites / 17, 5, full 1659 passed |
| 10 | met | 137/1 suites, type-check 0, build PASS, 0 owned lint findings |
| 11 | met | 4 tracked files + run dir; no schema/migration/auth/payment change |
| 12 | not re-verified | artefacts internally consistent and deterministic across three runs |

## Independent command results

| Command | Result |
|---|---|
| focused pub/sub suites | 2 suites, 17 tests |
| `staff-sse-signals` | 1 suite, 5 tests |
| full tests | 137 passed / 1 skipped; 1659 passed / 11 skipped |
| type-check | exit 0 |
| build | PASS with ephemeral placeholders |
| lint | 61/11 baseline, 0 in owned files |
| prettier (owned) | PASS |
| mutation runs | 8, each failing only the intended test(s) |
| probes | 3 (`cleanup`-mid-`initialize` reproduced F-1; gates clean) |

## Not verified

- End-to-end integration not re-run (no disposable DB in a read-only review);
  artefacts, consistency and committability were verified instead.
- The cycle-0 library used for `correction-red-proof.txt` is not preserved as an
  artefact; the mechanism was corroborated by rebuilding the mutant.
- Harness execution with defaults (parse/resolve only).
- Node 24.15.0 only; CI Node 20 unverified.
- No UX/accessibility surface; cross-repo consumption out of scope.

## Residual risk

- **F-1 / R-06 (low):** `cleanup()` interleaved with an in-flight `initialize()`
  can leave two live LISTEN clients and duplicate frames.
- N-2: unverifiable hash line in the run log.
- N-3: route guard can false-fail on comment/reformat edits.
- Pre-existing: `AME-016` (reconnect drops per-connection handlers),
  `AME-017` (two LISTEN sessions per process), half-subscribed session after a
  mid-pass failure relying on `pg` error/end signalling.
- Numbers measured on Node 24, not CI Node 20.

## Routing

**PASS WITH NOTES.** R-01–R-05 are closed; R-06 is partly closed and recorded as
F-1 (low); N-2 must be corrected before the commit gate so the evidence trail is
accurate. Lead recommendation: one bounded correction cycle 2 for F-1 and N-2
(a stale-epoch check before publishing the session, plus a regression test that
fails on the current code), then `REVIEW-03`, then the commit gate. No blocker or
high finding; no contract, schema, auth or payment change.
