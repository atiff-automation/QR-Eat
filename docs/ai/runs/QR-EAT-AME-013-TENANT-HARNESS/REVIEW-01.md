# Review 01 — QR-EAT-AME-013-TENANT-HARNESS

**Reviewer:** fresh `ame-verifier` (session `ses_e091d631effeA4wzFEZh3SDxZT`),
independent of the implementer, read-only
**Date:** 2026-11-20
**Spec:** `TASK.md` revision 2 (approved); D1–D9, S0–S5, AC1–AC11
**Verdict:** **PASS WITH NOTES**
**Risk:** R2

## Diff binding

| Item | Value |
|---|---|
| Base | `main` `1747e3cb503ec53486aa1707bffa756d956f7af8` |
| Tracked diff | `1611327b8a43018544724eae11d2b4ca074395a5909b6127cd04e57ac9f80668` |
| Untracked committable set | `ea70c52eea974f1e70ab5f22ce9c4fde8b659111310430e9b862489b92828fba` |
| Combined | `8200b902403eacc35a6688d5bb8df083dc519b7d2517a8a6ee4c18f032504c57` |

## Findings

| ID | Severity | Location | Issue | Disposition |
|---|---|---|---|---|
| R-01 | low | `src/tests/integration/support/fixtures.ts:111-130` vs `prisma/seed.ts` | The comment says the role templates are “copied from the real seed”, but the `manager` template is a harness subset (adds `orders:counter_serve`/`orders:kitchen`/`orders:update`/`staff:write`, omits `restaurant:read`, `tables:qr`, `analytics:read`, loyalty/promotion/member permissions). `cashier` and `kitchen_staff` match. No test depends on the manager set today. | **Correction cycle 1**: make the claim true — either align with the seed or label it explicitly as a harness subset. |
| R-02 | low | `src/tests/integration/support/fixtures.ts:892-899` | Cleanup deletes `security_event` and `rbac_log` by `createdAt >= startedAt`, not by ownership, so a concurrent writer's rows would also be deleted. D8 says cleanup deletes only the rows it owns. Low risk (disposable DB, one worker) but the promise is narrower than stated. | **Correction cycle 1**: delete by known actor/restaurant ids, or amend D8 explicitly. |
| R-03 | low | `docs/ai/ACTIVE.md:9`; `docs/ai/BACKLOG.md:19,23` | Stale Lead navigation ("task branch not created", AME-013 still "planning"), and the AME-002 lint count 62→61 was an unrelated Lead drive-by from the AME-019 review. | **Fixed by the Lead**: ACTIVE/BACKLOG refreshed; the AME-002 change is recorded as Lead bookkeeping, not an implementer change. |
| R-04 | low | `TASK.md:199-207` ownership list | The contract names `db.ts`, `fixtures.ts` and `tenant-isolation.test.ts`, not the four support modules actually added (`guard.ts`, `setup.ts`). No product code involved. | **Recorded in `RUN_LOG.md`** as an accepted deviation; the contract list is not rewritten for a naming-only difference. |
| R-05 | note | `support/guard.ts:16,23-24` | The guard is a heuristic: a loopback port-forward, `/etc/hosts`, or any `*_integration` name is trusted. No URL form defeated it (49 probes). | Accepted; inherent limitation of D2. Treat `INTEGRATION_DATABASE_URL` as operator-controlled. |
| R-06 | note | `tenant-isolation.it.ts:369-374` | “Records the observed refusal shape” is a static comment plus run-log evidence, not a runtime record. | Accepted; AC11 still holds. Wording could be softened in a future revision. |
| R-07 | note | `fixtures.ts:182-202` | A fresh migrated DB has 2 permissions / 4 role-permissions; after the suite 18/32. The extra rows are fixture-created reference data left in place, not all pre-existing seed rows. | Accepted with R-01 wording fix. |
| R-08 | note | `evidence/guard-rejections.txt` | Command lines use `<fake-credential>` placeholders, so they are not byte-reproducible; the guard messages themselves are credential-free. | Accepted; placeholders are appropriate. |
| R-09 | note | `NEXT.md:11` | Stale navigation at review time. | **Fixed by the Lead** with the phase update. |

No blocker, high or medium finding.

## Guard attack results (49 probes)

- **Rejected:** `localhost.`, `127.1`, `2130706433`, `0x7f.0.0.1`, `0177.0.0.1`,
  `[::ffff:127.0.0.1]`, extra path, encoded slash/NUL, `qreat_production`,
  `QREAT_INTEGRATION`, `?host=`, `?HOST=`, `?%68ost=`, `?hostaddr=`, `?dbname=`,
  `?service=`, `?socket=`, multi-host lists, userinfo confusion, backslash
  authority, empty host/path, `http:`, scheme-less, percent host.
- **Accepted and confirmed harmless:** `127.0.0.1`, `[::1]`,
  `[0:0:0:0:0:0:0:1]`, `%71reat_integration`, `qreat_it`, `?schema=public`,
  `?options=…`, loopback userinfo, fragment, stripped tab/newline, trimmed
  whitespace.
- `db.ts` rejects a mismatched `DATABASE_URL`; `setup.ts` precedes test imports so
  a local `.env` cannot redirect the suite. Unset variable exits in 0.108 s
  before any connection.

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| 1 real-DB isolation, non-zero on cross-tenant | PASS | 17/17 twice; mutation exits 1 |
| 2 positive controls; 404-for-everything fails | PASS | every test pairs own-tenant success; mutation |
| 3 guard refuses non-disposable before write | PASS | 49 probes; unset exits before connection |
| 4 mutation catches a removed filter | PASS | reproduced independently |
| 5 unit suite database-free | PASS | 139/1 suites, 1678 passed with no variable; `.it.ts` not listed |
| 6 CI job | **PASS WITH NOTE — unproven** | YAML and command order valid; job never executed |
| 7 idempotent, own-row cleanup | PASS WITH NOTE | two runs; only migrations/permissions/role_permissions remain; R-02 |
| 8 no product/schema/dependency change | PASS WITH NOTE | no `src/app`, `src/lib`, `prisma`, `jest.config.js`; R-03/R-04 bookkeeping |
| 9 docs distinguish unit/integration | PASS | `PROJECT_PROFILE.md` testing section |
| 10 no deploy/prod/seed/secret/PII | PASS | synthetic `@gate.invalid`; redacted evidence |
| 11 leaks recorded, not encoded | PASS WITH NOTE | 403/404 and anonymous 500 confirmed; `AME-020` opened |

## Independent command results

```text
unit suite (no INTEGRATION_DATABASE_URL)   139 passed / 1 skipped; 1678 passed
test:integration without the variable      exit 1 in 0.108 s, guard error, no connection
test:integration run 1 / run 2             17/17 both, 2.3 s / 2.3 s
type-check                                 exit 0
build (ephemeral placeholders)             exit 0
owned-file eslint / prettier               clean
repo lint                                  61 / 11 (pre-existing)
mutation A (remove GET requireOrderAccess) 1 failed / 16 passed, cross-tenant 200
mutation B (remove staff restaurantId check) order read + print tickets fail
post-run row scan                          only _prisma_migrations, permissions, role_permissions
```

## Not verified

- **GitHub Actions**: the `integration` job has never run; Node 20 install,
  service networking/health timing, `migrate deploy` in Actions and branch
  protection are unproven.
- Full HTTP stack: handlers invoked directly; middleware and header parsing are
  simulated.
- Concurrency: the time-window cleanup was not exercised with a second writer.
- Operator networking: whether loopback forwards to a remote database.
- The implementer's evidence files were not authenticated byte-for-byte; results
  were reproduced independently.
- `.env` was not read (policy).
- Repo-wide lint remains the pre-existing red baseline.

## Residual risk

- The new CI job may fail on first push for environment reasons.
- The guard cannot detect a loopback tunnel to a remote database.
- Cleanup deletes security/RBAC logs by time window (R-02).
- Fixtures leave reference rows and the manager template is a subset (R-01/R-07).
- SSE delivery depends on NOTIFY/LISTEN timing inside one process.
- Handler-level tests do not prove middleware/header behaviour.

## Routing

**PASS WITH NOTES.** R-01 and R-02 go to one bounded correction cycle; R-03/R-09
are fixed by the Lead; R-04 is recorded as an accepted deviation; R-05–R-08 are
accepted notes. After the cycle: a fresh `REVIEW-02`, then commit, push, and
require **both** CI jobs green (the integration job is unproven until it runs).
No merge, push, deploy, migration or seed by this review.
