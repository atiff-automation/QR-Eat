# Review 01 — QR-EAT-AME-015-PG-PUBSUB

**Reviewer:** fresh `ame-verifier` (session `ses_e0d9ffbf4ffeYFpxWBGqBTFnEs`),
read-only
**Spec:** `TASK.md` revision 2 (approved); D1–D10, S0–S5, acceptance 1–12
**Diff base:** `main` `024f22d8e49818a4779a2cade5ffc216fd6e9241`
**Diff hash:** tracked diff `sha256:4b536b52089e4491b1ee614cc9690994bfc7a159a22fc452cb58cd4ebe48df8b`;
committable untracked set
`sha256:b9f7a61e978003f22c28bc71c308b11d23a796646506457250ddd66829d77`
(excludes four `*.log` files — R-03)
**Verdict:** **PASS WITH NOTES**
**Risk:** R2

## Summary

The defect is fixed and the fix is correctly scoped. Single-flight
initialization, additive per-session subscription, lifecycle reset and the route
call-site change all behave as specified, and the measured end-to-end result
matches the hypothesis: `duplicateFrames` 2 → 0 with tenant isolation intact.
The diff touches only owned files and no contract, schema, auth or payment
surface.

The notes are not cosmetic. R-01 and R-02 are weaknesses in the guard and in one
state-machine interleaving of the very invariant this task exists to guarantee;
R-03 would silently drop the cited evidence from the repository at commit time.

## Findings

| ID | Severity | Location | Issue | Required outcome | Verifier evidence |
|---|---|---|---|---|---|
| R-01 | medium | `src/tests/postgres-pubsub-single-flight.test.ts:140-153` | The additive-coverage tests do not discriminate against a first-caller-wins implementation. Test 3 issues two **identical** concurrent sets after a completed pass, so an implementation that coalesces on the first caller passes all 9 tests. That is the exact defect D3 names and the mitigation for the top risk row. | A test must start a **smaller** set in flight (gate the first `LISTEN` on a deferred promise) and issue a concurrent larger set **inside that window**, then assert the union is `LISTEN`ed exactly once. A first-caller-wins mutant must fail it. | Mutation: `if (previous) return previous;` in a copy → **9/9 pass**. Delivered code chains correctly. |
| R-02 | medium | `src/lib/postgres-pubsub.ts:259-292, 301-319, 431-443` | Bookkeeping can be written after a failed `initialize()` cleared it. `openListenSession()` publishes `this.listenClient` **before** awaiting `connectNotifyClient()`. On a NOTIFY-connect failure the catch clears the client and `subscribedChannels`; a `subscribe()` pass already in flight on that client then adds channels and sets `isListening`. A later `subscribe()` opens a fresh client, filters those channels out as "already subscribed", issues no `LISTEN`, and `isConnected()` reports true → one channel silently never listened, no state triggers a rebuild. Violates AC3 for that interleaving. | Channel bookkeeping written by a pass must not survive the closing of the session that produced it, and a new LISTEN session must start from empty bookkeeping. AC3 must hold for this interleaving, not only the tested ones. | State-machine reproduction on a controlled mock in `/tmp/opencode/ame015-race`: post-failure `{listenClient:null, subscribedChannels:["channel_a"], isListening:true}`; next `subscribe` issued `LISTEN channel_a` on the ended client and none on the fresh one. Impossible in the measured two-graph layout; possible in the shared-instance layout D10 requires to be safe. |
| R-03 | medium | `RUN_LOG.md:224-230` vs `.gitignore:45` (`*.log`) | `unit-red-proof.log`, `focus-post.log`, `focus-prefix.log` and `server-startup.log` are gitignored, so the red/green proof and startup lines the claims depend on would not exist in the repository after commit. The run log presents them as the evidence set. | Cited evidence must be committable, or the run log must stop citing it as repository evidence. The commit path list must not name ignored paths. | `git check-ignore -v` → `.gitignore:45:*.log` for all four; `git status --untracked-files=all` omits them. |
| R-04 | low | new test matrix | No test for a mid-pass partial failure retrying only the remainder (S2), duplicate-argument collapse (S2), or the route's 10-channel list (AC4 is asserted against a duplicated literal, not the route). | A mid-pass failure test that asserts only the remainder is re-issued. Duplicate-argument and route-channel-list regressions must fail a test. | Code reading; behaviour is correct but unguarded. |
| R-05 | low | `evidence/fixtures-local.cjs:5,10` | Hardcodes the implementer's absolute worktree path and the disposable DB URL/port, while the README calls the harness reproducible. Not a secret (loopback, trust auth, `@gate.invalid` synthetic accounts). | The reproducibility claim must match what the committed script can actually do. | Read/`git grep`. |
| R-06 | note | `src/lib/postgres-pubsub.ts:675-706` | `cleanup()` nulls the gates while passes may be in flight; a late pass can write into a new session. Same class as R-02. | Covered by the R-02 outcome. | Code reading; not separately reproduced. |
| R-07 | note | `src/lib/postgres-pubsub.ts:681-688` | `await listenClient.end()` precedes `listenClient = null`, so the `end` handler can still see itself as current and schedule a second reconnect during its own `cleanup()`. **Pre-existing ordering**, unchanged by this diff; the identity guard cannot help while the reference is still current. | Not scored against this change; record only. | Code reading; pre-fix identical. |

## Spec findings

- **AC1/AC2** met: one LISTEN client for concurrent cold `subscribe()`, one
  in-flight `initialize()`, post-success `initialize()` adds no client.
- **AC3** met for the tested paths (failed first `LISTEN` releases the client;
  failed init closes and clears) but **not universally** — see R-02.
- **AC4** met as delivered and measured. Test-strength caveat R-01; per-graph
  guarantee D10 separately confirmed.
- **AC5** met: route diff is only the call site; `messageHandler`,
  `activeConnections`, keep-alive, catch-up and `cleanup()` are byte-identical
  to `024f22d`; no `isConnected()` check-then-init remains.
- **AC6** met: `PG_EVENTS`, payload interfaces, `staffSseEventTypeForChannel`,
  SSE types and `canReceiveRestaurantEvent` untouched.
- **AC7** supported by unit emission test and evidence; `duplicateFrames` 2 → 0
  reproduced from committed JSON.
- **AC8** met: disconnect clears state, give-up releases the client (red pre-fix),
  `cleanup()` resets gates.
- **AC9/AC10** met by independent re-run.
- **AC11** met: owned files only, plus Lead docs.
- **AC12** met as evidence-bound: `duplicateFrames: 0`, `leaked: []`,
  `tableBOnA: 0`, `tableBOnB: 1`, 5/5 checks; pre-fix `duplicateFrames: 2`.

## Standards findings

- No new dependency, no new pattern, comments explain the non-obvious gates.
- Error handling keeps the existing log-and-continue contract; no contract
  drift.
- The new test reuses the existing `jest.mock` shape and leaves
  `src/tests/postgres-pubsub.test.ts` unchanged.

## F-1 / D10 — independently confirmed

The verifier rebuilt the app and inspected the artefact rather than trusting the
run log: `.next/server/instrumentation.js` loads chunk 6044 and
`.next/server/app/api/events/orders/route.js` loads chunk 2625; each chunk holds
its own `EventEmitter` subclass and module-level singleton, and no other built
file contains the module. F-1's factual basis is therefore confirmed structurally.

Safety argument judged **sound in both layouts**: with separate graphs only the
route graph registers `message` handlers, so shared channels still yield one
frame per connection; with a shared instance there is one client, one handler and
an additive union. Cross-tenant leakage is independent of listener count because
filtering is per connection, and the pre-fix evidence shows `leaked: []` even
with duplicates present.

## Independent command results

| Command | Result |
|---|---|
| focused pub/sub suites | 2 suites, 11/11 |
| `staff-sse-signals` | 1 suite, 5/5 |
| full tests | 137 passed / 1 skipped, 1653 passed / 11 skipped |
| type-check | exit 0 |
| build | PASS with ephemeral format-valid placeholders (pre-existing key-format sensitivity, not this diff) |
| lint | 61 errors / 11 warnings, zero in owned files |
| red proof | reproduced 6 failed / 3 passed on pre-fix source in a copy |

## Not verified

- Disposable-database integration gate not re-run (read-only review); artefacts,
  harness logic and bundle layout were verified instead.
- `pg_stat_activity` not re-observed on a running server; the two-session claim
  is corroborated structurally from an independent build.
- Node 24.15.0 only; CI Node 20 unverified.
- No UX/accessibility surface touched.
- Cross-repo (`Tabtep-App`) consumption not verified; contract files unchanged.

## Residual risk

- R-01: additive guarantee is correct in code but weakly guarded by tests.
- R-02: silent channel loss requires a NOTIFY-connect failure concurrent with a
  subscription pass in one module instance; impossible in the measured layout,
  self-heals only on a later disconnect in a shared-instance layout.
- Pre-existing `AME-016`: reconnect drops per-connection handlers.
- Pre-existing `AME-017`: two LISTEN sessions per process, one extra idle
  connection, no duplicate frames measured.
- Half-subscribed session after a mid-pass failure relies on pg `error`/`end`
  signalling (untested).
- Numbers measured on Node 24, not CI Node 20.

## Routing

`PASS WITH NOTES` — the Lead records the notes and the owner decides. Lead
recommendation: run **correction cycle 1** for R-01, R-02, R-03, R-04 and R-05
before the commit gate, then take a fresh `REVIEW-02` on the exact corrected
diff. R-02 is a correctness gap against AC3 in a layout D10 calls safe; R-01
removes the guard for the top risk; R-03 would break the evidence trail at
commit. No blocker or high finding; no contract, auth, payment, schema or
migration change.
