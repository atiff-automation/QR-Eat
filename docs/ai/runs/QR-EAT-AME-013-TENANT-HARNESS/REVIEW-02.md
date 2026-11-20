# Review 02 — QR-EAT-AME-013-TENANT-HARNESS

**Reviewer:** fresh `ame-verifier` (session `ses_e08e9f5c4ffeHO9znSIaoxJwkv`),
independent of the implementer, read-only
**Date:** 2026-11-20
**Spec:** `TASK.md` revision 2 (approved); D1–D9, S0–S5, AC1–AC11
**Verdict:** **PASS WITH NOTES**
**Risk:** R2

## Diff binding

| Item | Value |
|---|---|
| Base | `main` `1747e3cb503ec53486aa1707bffa756d956f7af8` |
| Tracked diff | `sha256:121c79559f40e888dfafbda61653f2ac5fa0c3e2f94e3bb9b085bbd5e3d5d2e2` |
| Implementer-owned tracked subset | `sha256:d57224265edcf453e07049acf9fdebb1d7882d65cfae7a1f6a6fc573e2c5260b` |
| Untracked committable set | `sha256:c4d4377c3372c9584d4098902c075cdd95a88d83b4cd9b01545b6dd7a40438d6` |
| Combined manifest | `sha256:58d7dd288aa1987c8365b59f4bbc39e2f4575460e59a39cd8cb9c20d7a2ea330` |

REVIEW-01's tracked hash is not reproducible after the Lead's R-03 edits to
`ACTIVE.md`/`BACKLOG.md`; the three implementer-owned tracked files are
unchanged since cycle 0.

## Closure

| Finding | Status | Evidence |
|---|---|---|
| R-01 fixture template fidelity | **Closed** | Programmatic comparison of `TEMPLATE_PERMISSIONS` against `roleTemplates` in `prisma/seed.ts`: cashier 10, manager 23, kitchen_staff 3 — zero missing, zero extra, same order. All 26 permissions match the seed's description and category. Idempotent upserts. Comment now states the truth. |
| R-02 time-window cleanup | **Closed** (with documented residual) | No `createdAt`/`startedAt` predicate remains. `security_event` by its four ownership columns; `rbac_log` by staff/owner ids plus captured anonymous ids. Verifier reproduced four foreign sentinels (mid-run and future-dated) surviving both runs; all tenant tables zero afterwards. |
| R-03 / R-09 navigation | Fixed by Lead | — |
| R-04 support-module naming | Accepted deviation | Recorded in the run log. |
| R-05–R-08 | Accepted notes | — |

## Findings

| ID | Severity | Location | Issue | Disposition |
|---|---|---|---|---|
| L-01 | low | `evidence/mutation-check.txt:42-45` | Line references are from the cycle-0 suite; the corrected suite moved them. The substantive result was reproduced twice. | **Annotated by the Lead** in the evidence file; no claim changed. |
| L-02 | low | `fixtures.ts:212,842-878,987-989` | Anonymous `rbac_log` attribution is a set-difference window, not literal ownership. Measured: 5 of 3000 concurrent anonymous rows (about 1 ms apart) were claimed; the window is 5–10 ms. | Accepted residual; documented. D8's intent (no broad time window) is met; a run-id column is the real fix if this DB is ever shared. |
| L-03 | low | `NEXT.md:11` | Stale revision line. | **Fixed by the Lead.** |
| L-04 | low | `TASK.md` header | Duplicate empty session/diff fields. | **Fixed by the Lead.** |
| N-01 | note | `guard.ts` | One backslash-authority variant is accepted, but `pg-connection-string` also resolves it to loopback; no guard/client mismatch in 17 adversarial variants, no bypass. | Accepted. |
| N-02 | note | `ACTIVE.md`, `BACKLOG.md` | Lead bookkeeping in the tracked diff. | Recorded in the commit gate as Lead changes. |
| N-03 | note | `.github/workflows/ci.yml` | The `integration` job is valid and separate but has never run. | Must be green before merge. |
| N-04 | note | `tenant-isolation.it.ts:371-376` | "Records the observed refusal shape" is a static comment plus run-log evidence. | Accepted; AC11 holds. |

No blocker, high or medium finding.

## Independent command results

```text
cluster                 fresh PostgreSQL 16, /tmp/opencode, port 55434, no seed
test:integration run 1  17/17, 2.581 s  (mid-run sentinels)
test:integration run 2  17/17, 2.491 s  (future-dated sentinels)
test:integration minimal env (CI-like)  17/17, 2.721 s
without the variable    exit 1 in 0.096 s, guard error, no connection
guard end-to-end        non-loopback / production name / ?host= all exit 1; no password in output
unit suite (no DB env)  139 passed / 1 skipped; 1678 passed, 11 skipped
type-check              exit 0
build (ephemeral)       exit 0
owned eslint/prettier   clean
mutation                1 failed / 16 passed, cross-tenant 200
sentinel survival       mid-run 1/1 and future 1/1 for security_event and rbac_log
row scan                40/40 restaurantId tables 0 after sentinel removal
template compare        0 missing / 0 extra / same order
anonymous concurrency   5 of 3000 concurrent anonymous rows claimed (5–10 ms window)
```

## Acceptance criteria

| AC | Result |
|---|---|
| 1 real-DB isolation | PASS |
| 2 positive controls; 404-for-everything fails | PASS |
| 3 guard refuses non-disposable, no credentials | PASS (35 probes) |
| 4 mutation catches a removed filter | PASS |
| 5 unit suite database-free | PASS |
| 6 CI job separate and blocking | **PASS WITH NOTE — unproven** |
| 7 idempotent own-row cleanup | PASS WITH NOTE (L-02) |
| 8 no product/schema/dependency change | PASS WITH NOTE (N-02) |
| 9 docs distinguish unit/integration | PASS |
| 10 no deploy/prod/seed/secret/PII | PASS |
| 11 leaks recorded, not encoded | PASS WITH NOTE (N-04) |

## Not verified

- **GitHub Actions `integration` job**: never executed; Node 20 install, service
  networking/health, `migrate deploy` in Actions and branch protection are
  unproven. Not green.
- Full HTTP stack: handlers invoked directly; middleware and header parsing are
  simulated.
- Prisma's Rust URL parser versus the guard (compared only against
  `pg-connection-string`; no mismatch found).
- Repo-wide lint (pre-existing red baseline).
- Byte-for-byte equality with the REVIEW-01 snapshot (old hash unreproducible
  after the Lead's edits).
- `.env` was not read.
- Concurrent writers beyond the anonymous `rbac_log` probe.

## Residual risk

- Anonymous `rbac_log` set-difference window (5–10 ms) on a disposable
  single-worker database.
- The CI job may fail on first push for environment reasons.
- The guard cannot detect a loopback tunnel to a remote database.
- Fixture templates are a static copy of the seed; no automated drift check.
- SSE delivery depends on NOTIFY/LISTEN timing inside one process.
- Handler-level tests do not prove middleware/header behaviour.

## Routing

**PASS WITH NOTES.** R-01 and R-02 are closed; the correction introduced no
regression. L-01/L-03/L-04 are handled by the Lead; L-02 and N-01–N-04 are
recorded. Ready for the R2 commit gate. The `integration` CI job must be observed
green on the pushed branch before merge; it is not proven. No merge, push, deploy,
migration or seed by this review.
