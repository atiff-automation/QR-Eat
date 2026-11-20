# Run Log — QR-EAT-AME-013-TENANT-HARNESS

**Title:** Two-tenant isolation harness on real PostgreSQL
**Type:** feature (test infrastructure)
**Risk:** R2
**Spec level:** L2
**Owner:** Atiff
**Date:** 2026-11-20
**Branch/commit:** not created; base `main` `1747e3c`
**Task revision:** 1
**Approved revision:** 1 (2026-11-20, Atiff; revision 1 as presented)
**Task contract:** `TASK.md`
**Resume bookmark:** `NEXT.md`
**Latest review:** —

## Request

Plan `AME-013` as the next task after the staff-feed fixes: a repeatable
two-tenant isolation harness on a real database, runnable locally and in CI.
Stop for approval of the exact `TASK.md` revision.

## Classification

- Type: FEATURE (test infrastructure). No product behaviour change.
- Risk R2: tenant isolation is the security boundary, and the harness becomes
  release evidence. A weak or bypassable harness is worse than none.
- Level L2: new test support modules and one suite, a separate Jest config, one
  npm script, one CI job, and a docs section.

## Scope

In scope:

- guarded disposable-database connection;
- reusable two-tenant fixtures (restaurants, staff, RBAC, stations, menu, orders);
- route-level isolation assertions with positive controls;
- mutation proof that the suite can fail;
- `test:integration` script + separate Jest config;
- blocking CI job with `postgres:16`;
- testing-section update in `PROJECT_PROFILE.md`.

Non-goals:

- product code, routes, tenant guards, schema, migrations, seed;
- payment/webhook/external providers; load or fuzz testing;
- production or staging data;
- `AME-017`; new dependencies;
- deploy.

## Context

**Context budget used:**

- Must read: `AGENTS.md`, `PROJECT_PROFILE.md`, the B3-S fixtures/gate evidence,
  `.github/workflows/ci.yml`, the routes named in S3.
- Read only if unclear: `tenant-guards.ts`, `auth-utils.ts`,
  `restaurant-changes.ts`, the B3-S run log.
- Not read: the wider repository, `../Tabtep-App`, `.env*`, generated output.

## Investigation / specification

Confirmed at `main` `1747e3c`:

1. All 1678 unit tests mock Prisma; there is no database anywhere in the suite.
   Tenant scoping is asserted against mocks, not rows.
2. The only real two-tenant evidence is the B3-S gate, run manually from `.cjs`
   scripts under the run directory. They hardcode a worktree path and DB URL and
   a redacted signing key — evidence, not reusable infrastructure.
3. CI has one job with no `services:` block; its `DATABASE_URL` points at a
   localhost database that never exists. Nothing connects to it.
4. CI is green as of `1747e3c` (`AME-019`), so a second job will be visible and
   trustworthy.
5. Route handlers read tenant context from request headers via
   `getTenantContext`, so a constructed `NextRequest` can exercise the route's own
   tenant checks without booting Next. `server-only` is already mocked in the
   suite.
6. The choke points a regression would break are `requireOrderAccess`,
   `canReceiveRestaurantEvent` and the restaurant-change writer.
7. `tsx`, Jest 29 and Prisma 6 are present; no dependency is needed.

Planning notes:

- Local Node is 24; CI is 20. The integration job pins Node 20.
- The B3-S gate used HTTP against a started server. This task deliberately trades
  full HTTP fidelity for speed and stability, and records that gap.
- A disposable PostgreSQL cluster under `/tmp/opencode` is the local pattern used
  by the last two tasks.

## Plan

1. Guard first: refuse anything but a loopback, disposable-named database, using
   a dedicated `INTEGRATION_DATABASE_URL`.
2. Fixtures: two tenants with the RBAC and menu/station/order shape the routes
   read, created through the same Prisma models the producers use.
3. Suite: order read, order write, changes feed, tickets/ack, staff-event filter
   and RBAC, each negative paired with a positive control.
4. Runner: separate Jest config and `test:integration`; unit suite untouched.
5. CI: independent blocking job with a health-checked `postgres:16` service.
6. Prove the suite fails: remove a tenant predicate in a throwaway copy.

## Approvals

| Gate | What was approved | Approved by | Date | Conditions |
|---|---|---|---|---|
| Design/plan | Revision 1 as presented: D1–D8, S0–S5 | Atiff | 2026-11-20 | Approval hash `69f0b1fd…` (pre-stamp content) |
| Build | Bounded implementation by one `ame-implementer` | Atiff | 2026-11-20 | Covered by the revision-1 approval |
| Design/plan (rev 2) | S3.1 invariant wording, D9/AC11, `AME-020` follow-up | Atiff | 2026-11-20 | Approval hash `7aeaedb2…`; docs only, no code change |
| Verify (rev 2) | `REVIEW-01.md` PASS WITH NOTES; R-01–R-09 recorded; CI job unproven | Independent `ame-verifier` | 2026-11-20 | Correction cycle 1 for R-01/R-02 authorized by the Lead recommendation |
| Commit | — | — | — | Not requested; R2 review + commit gate |
| Release | — | — | — | Out of scope; merge decided after CI green |

## Commit gate

- [x] Review PASS (REVIEW-02, PASS WITH NOTES; R-01/R-02 closed)
- [x] Exact path list published (`TASK.md` commit gate, 21 files)
- [x] Exact commit message published
- [x] Human approved (Atiff, 2026-11-20; commit + branch push for CI)
- [x] No unrelated changes (ACTIVE/BACKLOG are Lead bookkeeping, recorded)

## Execution

Files changed:

- `docs/ai/runs/QR-EAT-AME-013-TENANT-HARNESS/TASK.md` (new)
- `docs/ai/runs/QR-EAT-AME-013-TENANT-HARNESS/RUN_LOG.md` (new)
- `docs/ai/runs/QR-EAT-AME-013-TENANT-HARNESS/NEXT.md` (new)

Commands run:

```text
sed -n '1,60p' docs/ai/runs/QR-EAT-B3-S-COUNTER-FEED/evidence/fixtures.cjs
node -e "..."   # package scripts and devDependencies
sed -n '1,60p' .github/workflows/ci.yml
```

## Verification

Verdict: not started (planning)

Findings:

- Root gap confirmed: no database in the test suite, no CI service, manual-only
  real-database evidence.

Not verified:

- Whether every named route can be invoked in Jest without Next internals. This is
  the main implementation risk and is called out in the task: if a route cannot,
  stop and report rather than change the route.

## Residual risk

- Route-handler-level tests are not the full HTTP stack; middleware and header
  parsing are simulated.
- Coverage is limited to the routes listed; new tenant-bearing routes must be
  added.
- CI runtime grows by roughly one to two minutes.

## Release

- Deployed: **yes** — Railway service `QR-Eat` (project `grand-tranquility`,
  production), deployment `76a24002-f404-43bb-b223-2bc89f877dff`, commit
  `df4b6bf` (merge of `f92599e`), status `SUCCESS`, 2026-11-20.
- CI (branch `feat/ame-013-tenant-harness`, commit `f92599e`): run
  `44685856443` **success** — `verify` 1m47s (type-check, tests, build on Node 20)
  and `integration` 53s (postgres:16 service, health check, `prisma migrate
  deploy`, 17-test isolation suite). First real execution of the integration job.
- Smoke test:
  - `GET https://tabtep.app/api/health` → 200, `status: UP`,
    `database: CONNECTED`, `env: production`, latency 19 ms, uptime 25 s.
  - `GET https://tabtep.app/` → 200.
  - `GET https://tabtep.app/api/events/orders` unauthenticated → 401.
  - Startup log: pub/sub initialised, LISTEN client connected; error sweep
    (`❌`, `Failed to publish`, `FATAL`) → 0.
- Rollback: redeploy `1747e3c`. This release adds test infrastructure and CI only;
  the application code is byte-identical to the previous deployment.
- Monitoring: none added; the harness is CI-side. The next tenant-bearing route
  should be added to `tenant-isolation.it.ts` as part of its own task.

## Lessons

- What worked: the last three tasks produced a repeatable disposable-database
  pattern that this harness can reuse.
- What to change: isolation evidence should be a command, not a run-directory
  script.
- Follow-ups: pilot pre-gate; B3-C; `AME-017` deferred.

## Implementation evidence

**Implementer:** ame-implementer (DeepSeek V4.1 Flash 1017 session)
**Date:** 2026-11-20
**Branch:** `feat/ame-013-tenant-harness` (from `main` `1747e3c`; uncommitted)
**Task revision:** 1 (approved)

### Files added / changed

```text
src/tests/integration/support/guard.ts        (new) disposable-database guard
src/tests/integration/support/setup.ts        (new) Jest setupFiles; validates and points the app at the guarded DB
src/tests/integration/support/db.ts           (new) one Prisma client + guard re-exports
src/tests/integration/support/fixtures.ts     (new) two tenants, RBAC, order/ticket/change rows, cleanup
src/tests/integration/tenant-isolation.it.ts  (new) 17 isolation/guard tests
jest.integration.config.js                    (new) node env, .it.ts match, maxWorkers 1
package.json                                  (test:integration script only)
.github/workflows/ci.yml                      (new integration job; verify untouched)
docs/ai/PROJECT_PROFILE.md                    (new Testing section only)
docs/ai/runs/QR-EAT-AME-013-TENANT-HARNESS/evidence/*.txt (new)
```

No route, domain, tenant-guard, schema, migration or seed change. No dependency
added. No secret committed.

### Commands and results

```text
npm test -- --runInBand                    PASS 140 suites (139 passed, 1 skipped), 1678 passed, 11 skipped; no INTEGRATION_DATABASE_URL set
npx tsc --noEmit                           PASS
npx eslint <new files>                     PASS (no findings)
npx prettier --check <new files>           PASS
npm run build                              PASS (ephemeral placeholder env only)
npm run test:integration (run 1)           PASS 17/17, 3.072 s, exit 0
npm run test:integration (run 2)           PASS 17/17, 2.497 s, exit 0
guard: non-loopback host                   exit 1 before write (db.railway.internal rejected)
guard: host-override query parameter       exit 1 before write (?host= rejected)
guard: qreat_production on loopback        exit 1 before write (name rejected)
guard: INTEGRATION_DATABASE_URL unset      exit 1 before write (actionable message)
mutation check (remove requireOrderAccess) exit 1, cross-tenant read returned 200; restored; git diff clean
```

Evidence: `evidence/local-run-1.txt`, `evidence/local-run-2.txt`,
`evidence/guard-rejections.txt`, `evidence/mutation-check.txt`.

The local database was a disposable cluster under `/tmp/opencode` (port 55434,
trust auth, database `qreat_integration`, `prisma migrate deploy`). It was not
Railway, staging or any shared database, and it was deleted after the runs.

### Deviations

1. **Integration spec extension.** The task named
   `tenant-isolation.test.ts`; the default `jest.config.js` `testMatch`
   (`src/**/*.{test,spec}.ts`) would pick that up and break the database-free
   unit suite. Per the dispatch instruction the spec is
   `tenant-isolation.it.ts` and `jest.integration.config.js` matches
   `src/tests/integration/**/*.it.ts`. `jest.config.js` was not edited. Filename
   only; no design change.
2. **S3.1 shape gap (product finding, not fixed).** `GET /api/orders/[id]`
   maps a cross-tenant `requireOrderAccess` 403 to `403 FORBIDDEN` with the
   reason text, while a missing id is `404 NOT_FOUND`. The task expected the
   same not-found shape. Fixing the route is outside this task's ownership, so
   the suite asserts the security invariant (non-200, no `order` payload, no B
   identifiers), accepts either refusal shape and records the observed codes.
   Recommended follow-up: normalise this route to `404 ORDER_NOT_FOUND` for both
   cases; the test stays green when that happens.
3. **Anonymous staff-event request returns 500, not 401.** The SSE route's
   generic catch maps `requireAuth`'s error to 500. It still fails closed (no
   stream). The suite asserts "no 200 and no stream"; the status-code polish is a
   separate route change.
4. **Global RBAC reference rows are not deleted.** `permissions` and
   `role_permissions` rows are canonical data copied from `prisma/seed.ts` and
   are upserted, never invented. Cleanup removes all tenant-scoped rows and the
   run's RBAC/security/audit logs; reference rows stay so another local run or a
   dev database is not stripped of seed data.
5. **Cross-tenant `GET` has an existence signal but no data access.** This is
   the finding behind deviation 2; it is recorded here rather than silently
   changed.

### Blockers

None. Every named route was invokable in Jest with a constructed `NextRequest`
and a real signed session token.

### Residual risks

- Route-handler invocation is not the full HTTP stack (middleware and header
  parsing are simulated). The B3-S manual gate remains the end-to-end reference.
- The SSE delivery test depends on PostgreSQL NOTIFY/LISTEN timing inside one
  process; it passed in every run (2 s range) but uses a 10 s deadline.
- Coverage is the covered routes only; new tenant-bearing routes must be added.
- CI runtime grows by roughly one to two minutes.

## Lead check — 2026-11-20

- **Diff scope:** four support modules and one suite under
  `src/tests/integration/`, `jest.integration.config.js`, one `package.json`
  script, one appended CI job, the `PROJECT_PROFILE.md` testing section, and the
  run directory. No `src/app`, `src/lib`, `prisma/**` or dependency change;
  `jest.config.js` is untouched. Confirmed by `git status`: no product file
  appears in the diff.
- **Guard:** exact loopback host set (no suffix matching), disposable-name
  regex, refusal of URL query parameters that could redirect the connection
  (`host`, `hostaddr`, `dbname`, …), messages that name host/database only, and a
  second validation in `db.ts` plus a `DATABASE_URL` equality check. The
  redirect-parameter case is a real bypass class and is tested.
- **Runner isolation:** the integration project matches `**/*.it.ts`, so the
  default `jest.config.js` `testMatch` does not pick it up; the unit suite stays
  database-free. Deviation accepted and recorded.
- **CI:** one appended `integration` job with a health-checked `postgres:16`
  service, `npm ci`, `prisma generate`, `migrate deploy`, then the suite. The
  existing `verify` job is unchanged.
- **Evidence:** two consecutive 17/17 runs on a disposable cluster (port 55434)
  with all tenant-scoped row counts zero afterwards; four guard rejections with
  zero credential occurrences; a mutation check that removed one
  `requireOrderAccess` call, failed 1/17 with a cross-tenant 200, and was
  restored (repository shows no route change). I read the evidence files; the
  numbers and assertions match the described runs.
- **Finding F-1 (product, not harness).** `GET /api/orders/[id]` returns
  `403 FORBIDDEN` for another tenant's order and `404 NOT_FOUND` for a missing
  one — I verified this in `src/lib/rbac/resource-auth.ts:41-55`. The suite
  correctly asserts the security invariant (non-2xx, no order payload, no other
  tenant identifiers) and records the observed status rather than encoding the
  leak as expected behaviour. `GET /api/events/orders` also answers anonymous
  callers with `500` from the generic catch. Both are opened as `AME-020`; the
  harness must not be weakened and the routes must not be edited here.
- **Resolution:** `TASK.md` revision 2 rewords S3.1, adds D9 and AC11, and adds
  the `AME-020` residual. No implementation change follows from F-1.
- **Not verified by the Lead:** the new CI job has not run (branch not pushed);
  the suite's own runtime behaviour beyond the recorded evidence. Routed to a
  fresh `ame-verifier` after revision 2 approval.

## Lead disposition — REVIEW-01

- **R-01/R-02** → correction cycle 1 (fixture template fidelity and
  ownership-based cleanup). Both concern the truth of claims the harness makes
  about itself; the second concerns deleting rows.
- **R-03/R-09** → fixed by the Lead (`ACTIVE.md`, `BACKLOG.md`, `NEXT.md`). The
  AME-002 lint count 62→61 is Lead bookkeeping carried over from the AME-019
  review R-05, not an implementer change, and is documented here so it is not
  mistaken for scope creep.
- **R-04** → accepted deviation: the contract names three support files; the
  implementation added four modules (`guard.ts`, `setup.ts`). Same directory, no
  product code; the contract list is not rewritten for a naming difference.
- **R-05–R-08** → accepted notes (the guard is a heuristic by design; "records"
  is static evidence; reference rows are fixture-created; evidence placeholders
  are appropriate).
- **CI** → the `integration` job remains unproven until the branch is pushed.
  Both jobs must be green before merge.
- No commit, push, deploy, migration or seed.

## Lead check — correction cycle 1

- **Scope:** only `support/fixtures.ts`, the isolation suite (anonymous log
  attribution) and `evidence/cleanup-sentinel.txt`, plus the run-log append.
  Guard, runner, CI job, docs and `package.json` unchanged; no product code.
- **R-01:** `manager` is now the seed's 23-permission set; `cashier` 10 and
  `kitchen_staff` 3; the comment states exactly what is copied and from where. I
  read the list: it matches the seed's membership the verifier quoted in
  REVIEW-01.
- **R-02:** no time predicate remains. `security_event` is deleted by
  `restaurantId`/`staffId`/`orderId`/`tableId`; `rbac_log` by staff/owner ids
  plus the exact anonymous row ids the test observes (set difference against a
  pre-request snapshot, not a timestamp). The sentinel evidence shows two
  mid-run and two future-dated foreign rows surviving both runs.
- **Residual accepted:** `RBACLog` has no run id for `anonymous`, so the
  attribution is a set-difference window; `SecurityEvent` has no session column,
  so it relies on its four ownership columns. Both are recorded in the run log
  and evidence.
- **Not re-run by the Lead:** build (test-support only; `tsc --noEmit` covers
  it) and the suite. Routed to `REVIEW-02` for independent confirmation.

## Correction cycle 1

**Scope:** R-01 and R-02 from `REVIEW-01.md`, authorized by the owner. No other
finding changed. `TASK.md`, `NEXT.md` and `REVIEW-01.md` were not edited.

### R-01 — template claim made true: fixed by aligning `manager` with the seed

`support/fixtures.ts` now copies the three templates verbatim from
`prisma/seed.ts` (`roleTemplates`) and creates exactly the permission definitions
those templates reference, with the seed's descriptions and categories:

- `cashier` — 10 permissions (unchanged; already matched).
- `manager` — 23 permissions. Removed the harness-only additions
  (`orders:counter_serve`, `orders:kitchen`, `orders:update`, `staff:write`) and
  added the seed omissions (`restaurant:read`, `tables:qr`, `analytics:read`,
  `loyalty:configure`, `loyalty:report`, `promotions:manage`, `members:read`,
  `members:pii`, `members:consent_withdraw`).
- `kitchen_staff` — 3 permissions (unchanged; already matched).

The code comment now states exactly what is copied and what is not: the seed's
other keys and templates (owner, platform admin, waiter) are not created.
Verified in the database after a run: `manager=23`, `cashier=10`,
`kitchen_staff=3`, and the manager set equals the seed list.

### R-02 — ownership-based cleanup: fixed by deleting only run-owned keys/ids

The `createdAt >= startedAt` deletes are gone (no time window anywhere in
`fixtures.ts`). Cleanup now deletes:

- `security_event` by `restaurantId`, `staffId`, `orderId`, `tableId` — only the
  run's restaurants/staff/orders/tables.
- `rbac_log` by `userId` in the run's staff/owner ids. The suite's anonymous
  refusal writes `userId = 'anonymous'`, which has no per-run id, so the test
  snapshots the existing anonymous ids, makes the request, and claims the exact
  new ids; cleanup deletes those ids. No time predicate.
- `audit_log`, notifications, pending events, idempotency receipts, order
  actions/discounts: unchanged, already ownership-scoped.

Residual (documented, not silent): `RBACLog` has no column that distinguishes one
run's anonymous rows from another's, so a concurrent anonymous write inside the
sub-second snapshot/request window could be claimed. `SecurityEvent` has no
session/user column; `restaurantId`, `staffId`, `orderId` and `tableId` are the
ownership columns the schema provides.

Evidence: `evidence/cleanup-sentinel.txt`.

### Commands and results

```text
fresh disposable PostgreSQL 16 cluster (/tmp/opencode, port 55434, qreat_integration,
  prisma migrate deploy, no db:seed)
npm run test:integration (run 1, mid-run sentinel present)  PASS 17/17, 3.102 s, exit 0
npm run test:integration (run 2, mid-run + future sentinels) PASS 17/17, 3.636 s, exit 0
sentinel survival after both runs                          all 4 sentinels present (1/1/1/1)
sentinel removal                                           DELETE 2 + DELETE 2
post-run row scan                                          40/40 restaurant-scoped tables = 0
  restaurants=0, restaurant_owners=0, staff=0, staff_roles=0, user_sessions=0,
  order_items=0, order_modifications=0, order_modification_items=0,
  station_categories=0, rbac_logs=0, security_events=0, refresh_tokens=0
reference rows left                                        permissions=26, role_permissions=37
  (cashier 10 + manager 23 + kitchen_staff 3 = 36 seed-template rows,
   plus 1 pre-existing restaurant_owner:menu:availability from a migration)
npm test -- --runInBand (no INTEGRATION_DATABASE_URL)      PASS 140 suites (139 passed, 1 skipped), 1678 passed, 11 skipped
npm run type-check                                         PASS
owned-file eslint / prettier                               PASS
```

### Deviations

- None new. The correction changed only `support/fixtures.ts`,
  `tenant-isolation.it.ts` (anonymous-row capture) and added
  `evidence/cleanup-sentinel.txt`.
- The cycle-0 run evidence files stay as the record of those runs; this
  correction's runs and row scan are recorded above and in
  `evidence/cleanup-sentinel.txt`.
- Reference-row counts moved from 18/32 (cycle 0) to 26/37 because R-01 aligned
  the manager template with the seed. R-07's note is now accurate: the extra
  rows are the seed's own definitions for the three templates, plus one
  pre-existing migration row.

### Blockers

None.

### Residual risks

- The anonymous RBAC capture window (see R-02 residual above) is the only
  remaining non-ownership attribution; it is narrow and documented.
- The CI integration job is still unproven until the Lead pushes.
