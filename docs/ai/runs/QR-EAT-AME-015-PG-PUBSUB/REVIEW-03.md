# Review 03 — QR-EAT-AME-015-PG-PUBSUB

**Reviewer:** fresh `ame-verifier` (session `ses_e0cf4e15fffeIVe0x1gR0SLy02`),
independent of the implementer, read-only
**Date:** 2026-11-19
**Spec:** `TASK.md` revision 2 (D1–D10, S0–S5, AC1–AC12)
**Scope:** closure of REVIEW-02 F-1/R-06 and N-2, plus regression from
correction cycle 2
**Verdict:** **PASS WITH NOTES**
**Risk:** R2

## Diff identity

| Item | Value |
|---|---|
| Base commit | `024f22d8e49818a4779a2cade5ffc216fd6e9241` |
| Tracked diff | `sha256:2b158915eee9874828c2c85a1b6dffca2eaea00aeb73fb9528a086fd427ab468` |
| `src/lib/postgres-pubsub.ts` | `sha256:50b926fd7e70178e76b0e8eccca7e31b49d8fec2863141af309648e18e22b07f` |
| `src/app/api/events/orders/route.ts` | `sha256:cfc8bd881b9d8a98093444eb693db3c09d6e9c5b01207e8a8fc055d3944a399c` (unchanged from REVIEW-02) |
| `src/tests/postgres-pubsub-single-flight.test.ts` | `sha256:e97f4804ae41b68757d02419d34d20067b9bb8bc59a9a6e7168c8efb253672c9` |
| Untracked set (29 files, pre-REVIEW-03) | `sha256:9448cb464eadc236da050226b8da46ae4f98cd44689b533f1319e7bb05d17795` |

Recipe for the untracked aggregate:
`git ls-files --others --exclude-standard -z | sort -z | xargs -0 sha256sum | sha256sum`.
Writing this review changes that aggregate; the three source hashes and the
tracked diff hash are the stable code binding.

## Findings

| ID | Severity | Location | Issue | Status |
|---|---|---|---|---|
| F-1 / R-06 | — | `src/lib/postgres-pubsub.ts:247-258, 308-315, 329-354, 749-757` | Cleanup concurrent with an in-flight initialize could publish a second live LISTEN session. | **Closed.** Independent probe: stale pass rejects; one live listener, one handler, one `LISTEN`, one emission; stale client ended. Cycle-1 rebuild reproduces the original failure (`live:3`, `liveWithHandler:2`, `emissions:2`). |
| N-2 | — | `RUN_LOG.md:641-646`, `evidence/README.md:190-194` | Unverifiable hash quoted for an unnamed file. | **Closed.** The quoted `50b926fd…` equals `sha256sum` of the current file; the file is named; the stale value survives only in the immutable REVIEW-02 record. |
| N-6 | **low (new)** | `src/lib/postgres-pubsub.ts:422, 753` | During `cleanup()` inside an in-flight NOTIFY `connect()`, `openNotifyClient()` assigns `this.notifyClient` after the await; the abandoned pass's NOTIFY client is adopted and the replacement's is orphaned (connected, unreferenced, never ended). Probe: `liveNotifyLike:2`. Present since correction cycle 1, not introduced by cycle 2. No duplicate handlers, emissions or wrong LISTEN state. | **Open — follow-up only.** Needs a generation/identity gate on NOTIFY publication. Rare: only SIGINT/SIGTERM/reconnect cleanup. |
| N-7 | note | `evidence/README.md:190-200` | Contradictory wording: quotes a hash, then says “No hash value is quoted.” Intent is correct (the cycle-0/1 moment-in-time hash is not reproducible). | **Fixed by Lead** in this cycle (docs wording only). |
| N-1 | note | `src/lib/postgres-pubsub.ts:681-696` | `handleDisconnect()` keeps the session token so a retry can `LISTEN` on the surviving client. | Accepted with rationale. |
| N-3 | note | test `580-611` | Route guard is a source-text regex; conservative, can false-fail on a comment or reformat. | Accepted. |
| N-4 | note | test `400-435` | Publish-after-NOTIFY is not independently mutated; the token is the load-bearing guard. | Accepted. |
| N-5 | low | `evidence/fixtures-local.cjs:17`, `run-focus.cjs:26` | Passwordless fixed loopback default, overridable via `GATE_DB_URL`. | Accepted. |
| R-07 | note | `src/lib/postgres-pubsub.ts:731-738` | `await end()` precedes `listeningClient = null`; pre-existing. | Unchanged, not scored. |

## Closure status

**REVIEW-01:** R-01–R-05 closed; R-06 now closed; R-07 unchanged.
**REVIEW-02:** F-1 and N-2 closed; N-1/N-3/N-4/N-5 accepted. New: N-6 (low),
N-7 (note, Lead-fixed).

## Regression checks on the cycle-2 change

- Failed LISTEN `connect()` still clears state and the next `subscribe()`
  rebuilds — passes on both cycle-1 and current, so unchanged.
- Failed NOTIFY `connect()` with no concurrent session is atomic and clean —
  passes on both.
- With a replacement published, the catch does not reset
  `isListening`/`subscribedChannels` (probe: after a stale rejection the
  replacement keeps `["channel_a","channel_b"]`, `isListening: true`).
- Normal path unchanged: one LISTEN + one NOTIFY client, one token,
  post-success `initialize()` no-op, subscribe guard and remainder retry intact.
- Harder F-1 variants pass: cleanup during NOTIFY connect, cleanup with no
  replacement, two cleanups in one pass, stale pass after the replacement has
  already subscribed.
- Red proof corroborated independently: rebuilt cycle-1 shape → implementer
  suite **2 failed / 15 passed** (exactly the two abandonment tests); the
  verifier's own 9-test probe **6 failed / 3 passed** on cycle-1, **9/9** on
  current.

## Acceptance criteria

| AC | Result |
|---|---|
| 1 | met |
| 2 | met |
| 3 | met for the tested paths and both failure interleavings |
| 4 | met (per module instance, D10) |
| 5 | met |
| 6 | met |
| 7 | met (unit one-emission; cc2 evidence `duplicateFrames: 0`, not re-run) |
| 8 | met |
| 9 | met (focused 19, staff 5, full 1661) |
| 10 | met |
| 11 | met |
| 12 | met on evidence; not re-verified live |

## Independent command results

| Command | Result |
|---|---|
| focused pub/sub suites | 2 suites, 19 tests |
| `staff-sse-signals` | 1 suite, 5 tests |
| full tests | 137 passed / 1 skipped; 1661 passed / 11 skipped |
| type-check | exit 0 |
| build | PASS with ephemeral placeholders |
| lint | 61/11 baseline, 0 in owned files |
| prettier (owned) | PASS |
| probes (current / cycle-1) | 9/9 / 6 failed 3 passed |

## Not verified

- End-to-end integration not re-run in the review; cc2 evidence checked for
  consistency and repeatability across two runs.
- `pg_stat_activity` not re-observed live.
- R-01/R-04 mutation matrix carried from REVIEW-02 (tests present and green).
- Real-`pg` behaviour of the N-6 NOTIFY leak not exercised; mock + code reading.
- Node 24.15.0 only.
- No UX/accessibility surface; cross-repo consumption out of scope.

## Residual risk

- **N-6 (low):** one idle PG connection can leak per cleanup-vs-NOTIFY-connect
  race. No duplicate frames, no wrong LISTEN state.
- **Route mute window (code reading):** the route registers its `message`
  handler only after `await subscribe(...)`, and the catch logs-and-continues;
  a subscribe rejected by a concurrent cleanup leaves that stream open without
  a handler. Same class as `AME-016`; route behaviour unchanged by this task.
- **Cleanup/initialize overlap:** an `initialize()` starting while `cleanup()` is
  between awaits is abandoned and rejects (safe; caller retries).
- Carried: `AME-016` reconnect handler loss, `AME-017` two LISTEN sessions per
  process, half-subscribed session reliance on pg error/end, Node 24 vs CI 20.

## Routing

**PASS WITH NOTES.** F-1/R-06 and N-2 are closed with independent red/green
evidence; the cycle-2 conditional reset does not regress the atomic-failure,
normal or replacement-preservation paths. The only new low item is N-6 (NOTIFY
connection leak), which is rare, non-user-visible and separate from the
single-flight LISTEN guarantee.

Lead decision: accept N-6 as residual with a follow-up backlog item rather than
open a third correction cycle against the NOTIFY publish path, which is
load-bearing for every event. N-7 corrected by the Lead as documentation.
Proceed to the commit gate subject to explicit owner authorization; no merge,
push, deploy, migration or seed by this review.
