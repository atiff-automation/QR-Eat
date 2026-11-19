# Review 01 — QR-EAT-AME-016-SSE-RECONNECT

**Reviewer:** fresh `ame-verifier` (independent of the implementer, read-only)
**Date:** 2026-11-19
**Spec:** `TASK.md` revision 1 (approved); D1–D6, S0–S4, AC1–AC10
**Verdict:** **PASS WITH NOTES**
**Risk:** R2
**Runtime:** Node 24.15.0 (CI Node 20; CI Build is red from `AME-019` and was not
used as a gate)

## Diff binding

| Item | Value |
|---|---|
| Base / HEAD | `e4ee15174c01eff152ef1251ebf137c6e9289d71` (0 commits ahead) |
| Tracked diff | `sha256:cdba56386de31538fb0651ebfecc63c07eb31fa8b3f3563c1e9d25bede906ed6` |
| Code-only diff (lib) | `sha256:dd9a7d926b7a4c04a8d43d2abc1d6999b26b32915d24313b3d2dd7e8f24637b1` |
| Code stat | `src/lib/postgres-pubsub.ts +77/−17` (whole-tree +82/−22 includes the two Lead docs) |
| Untracked committable set | `sha256:638efde8db0aa0bf99ed81269fcbf0f939cdfdadb59b4d43bfa167ded8a7348b` |
| Ignore check | all untracked files committable; none ignored |

## Findings

| ID | Severity | Location | Issue | Disposition |
|---|---|---|---|---|
| N-01 | low | `src/tests/postgres-pubsub-reconnect.test.ts:282-319`; `evidence/red-proof-prefix.txt` | The S4/NOTIFY test is red on pre-fix code only because `teardownSession()` does not exist (`TypeError`), not because it asserts the adoption/leak behaviour. The two contract-mandated red cases (subscriber survival, single cycle) are red for exactly the documented reasons, so D6 holds; S4's red proof is weaker. | Accepted. The S4 behaviour is independently proven by the verifier's probes P3/P4 and by code reading; rewriting the pre-fix harness would add churn without changing the verdict. Recorded as residual test-quality note. |
| N-02 | low | `RUN_LOG.md` (implementation evidence + Lead check) | The lib stat was recorded as `+82/−22`; actual code-file stat is `+77/−17`. The larger figure is the whole-tree diff including the two Lead docs. | **Corrected by the Lead** before the commit gate. |
| N-03 | low | `postgres-pubsub.ts:582-589` | A `notify()` that starts with `notifyClient === null` and whose in-flight connect is abandoned by teardown now returns without publishing (silent lazy-init catch). Pre-fix it adopted that client and published. Explicitly authorised by S4 (“reject or return the current one”). The event is still dual-written to the DB, and the contract treats SSE as a refresh hint with recovery via `/api/counter/changes`; an already-open stream has no catch-up until it reconnects, so one frame can be lost in that narrow window. | Accepted as residual. The alternative (retry inside the catch) risks publishing on a closed client; the contract tolerates a missed hint. |
| N-04 | note | `postgres-pubsub.ts:429-457` | The window the Lead asked the verifier to probe (“live replacement torn down between the ownership check and the return”) **does not exist**: there is no `await` between the check, the publish and the return. The genuine seam is after `openNotifyClient()` returns and before `notify()`'s `query()`, and it degrades to the retry path (probe P4: fresh client publishes, no hang, no leak). | Accepted. Recorded so the narrow window is not treated as unresolved. |
| N-05 | note | `evidence/real-pg-reconnect-probe.txt` | The implementer's probe source was deleted, so the transcript alone is not inspectable. The claim does not overreach: it is labelled module-level, and the run log states the HTTP SSE end-to-end was not run. | Accepted. The verifier rebuilt and re-ran an equivalent probe (below). Record the probe source alongside the transcript in future tasks. |
| N-06 | note | `docs/ai/ACTIVE.md`, `docs/ai/BACKLOG.md` | Both are dirty and outside the implementer-owned list (Lead bookkeeping). `AME-016` still said `planning`. | **Resolved by the Lead** before the commit gate: status refreshed and the two docs explicitly included in the path list. |
| N-07 | note | `postgres-pubsub.ts:742-757` | If `cleanup()` runs while a reconnect body is already past `teardownSession()`, the pass can still initialize a session with no listeners. Pre-existing class (old `cleanup()` was equally racy), shutdown-only, followed by `process.exit(0)`. | Accepted, unchanged. |

No **blocker**, **high** or **medium** findings.

## Verification of the named claims (independent)

1. **Subscriber survival (D1):** reproduced at the module seam. `teardownSession()`
   detaches and resets state, ends both clients, and leaves the emitter intact;
   `cleanup()` delegates then removes listeners. Call sites are exactly reconnect
   (soft), SIGINT/SIGTERM (full) and tests (full). With a route-shaped
   register/`off` pair the handler survives the reconnect and is still removed on
   close. The route file is byte-unchanged.
2. **One reconnect cycle (D3):** reproduced in both directions. Detach-before-
   `end()` suppresses deliberate-close re-entry; a genuine unexpected `error`/
   `end` still reconnects; a late duplicate from the replaced client cannot
   schedule another cycle. Pre-fix the single-cycle test fails `Expected 1,
   received 2`. Retry budget, 5 s delay, give-up release and counter reset are
   untouched.
3. **No duplicate delivery:** one listener, one notification handler, one
   emission after reconnect (test 2, probes P5/P6, real PostgreSQL).
4. **S4 / `AME-018`:** superseded client is closed, a live `notifyClient` is never
   overwritten, a waiting `notify()` gets the live replacement or a clean
   rejection, and the retry path recovers with a fresh client (P3/P4). See N-03
   and N-04.
5. **AME-015 guarantees intact:** generation guard, single-flight, additive
   subscription, remainder retry, give-up/self-heal and tenant filtering are
   unchanged; both existing suites are byte-unchanged and green.
6. **Red proof integrity:** the verifier rebuilt `e4ee151` via `git archive` and
   added only the new test: 5 failed / 1 passed, identical messages and line
   numbers to the committed evidence.
7. **Real-PostgreSQL probe, independently repeated:** post-fix — terminate the
   LISTEN backend, reconnect in **5049 ms**, new backend pid, listener received
   exactly one frame, suite exits cleanly. Pre-fix — reconnect in 5047 ms but the
   listener received **0** frames, and the suite would not exit because the
   self-scheduled reconnect kept chaining every 5 s. That independently confirms
   both the original defect and R-07.
8. **Test quality:** the single-cycle assertion is attempt-based (`initialize`
   call count, client count, a second full delay window) and cannot be satisfied
   by a masked second reconnect; pre-fix proves it detects the extra pass.

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| 1 — subscriber survives a forced reconnect | Met at the module/LISTEN seam (mock + real PG); HTTP SSE not run | test 1, probes P1/P5/P6, real-PG pre/post |
| 2 — exactly one reconnect cycle | Met | test 3 (red pre-fix with 2 passes), probes P1/P2 |
| 3 — teardown preserves listeners, full disposal removes; API consistent | Met | test 4, code |
| 4 — no duplicate emission after reconnect | Met | test 2, probes P4/P5, real PG |
| 5 — retry/give-up/generation/additive/tenant filter unchanged | Met | test 5, diff, 25 focused + full suite |
| 6 — NOTIFY ownership, no leak, no stuck publish | Met | test 6, probes P3/P4 |
| 7 — tests red pre-fix for the right reasons; evidence committable | Met with N-01 | red proof reproduced |
| 8 — tests, type-check, build, owned lint | Met | results below |
| 9 — no contract/route/schema/migration/auth/payment change | Met; Lead docs explicitly included | `git diff --name-only` |
| 10 — no push/deploy/migration/seed | Met | HEAD == base, no upstream |

## Independent command results

```text
focused pub/sub suites          3 suites / 25 tests PASS
staff-sse-signals               1 suite / 5 tests PASS
full suite                      138 passed / 1 skipped; 1667 passed / 11 skipped
type-check                      exit 0
build (ephemeral placeholders)  exit 0
eslint (owned files)            exit 0
prettier (owned files)          PASS
red proof (base e4ee151)        5 failed / 1 passed, matches evidence
probes P1–P6                    12/12 PASS
real PG 16.15 module probe      post-fix 5049 ms, 1 frame; pre-fix 5047 ms, 0 frames
```

## Not verified

- HTTP-level SSE end-to-end (authenticated staff session, real Next server,
  add/cancel frame flow). Needs a staff fixture and `db:seed`, which is out of
  scope. AC1 is verified at the module/LISTEN seam only.
- The implementer's original real-PG probe source (deleted; verifier rebuilt an
  equivalent probe).
- CI (`AME-019`); CI config untouched.
- Whole-repo lint; only owned-file attribution.
- Node 20 behaviour; all evidence on Node 24.15.0.

## Residual risk

- The listener registry now survives teardown by design; a future production
  caller that relied on `cleanup()` for a clean slate would get full reset only
  if it calls `cleanup()`. Current call sites are correct.
- A permanently failed reconnect still leaves open streams silent until the
  client reconnects.
- N-03: one publish racing a teardown can be dropped from the SSE fan-out (DB
  copy remains; recovery via `/api/counter/changes`).
- `AME-017` and the half-subscribed mid-pass case remain as recorded.

## Routing

**PASS WITH NOTES.** N-01 and N-03 are accepted with rationale; N-02 and N-06 are
resolved by the Lead; N-04/N-05/N-07 are recorded. The change fixes the
reconnect defect, preserves AME-015 guarantees, and does not touch the route or
contract. Ready for the R2 commit gate on the exact diff hashes above, subject to
explicit owner authorization; no merge, push, deploy, migration or seed by this
review.
