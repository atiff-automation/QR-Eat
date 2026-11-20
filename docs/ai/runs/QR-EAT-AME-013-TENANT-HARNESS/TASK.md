# Task — QR-EAT-AME-013-TENANT-HARNESS

**Status:** ready_to_commit
**Revision:** 2
**Approved revision:** 2 (revision 1 code, revision 2 scope wording)
**Approved by:** Atiff
**Approval date:** 2026-11-20
**Approval basis:** “Approve rev 2 + AME-020 (Recommended)” — S3.1 asserts the
security invariant and records the observed refusal; D9/AC11 added; `AME-020`
accepted as the follow-up for the route normalisation
**Approval hash:** revision 1
`sha256:69f0b1fdd77fae185640546bc7b51953ae6fe3bfbd052e7ec1cf31b5b156e135`;
revision 2
`sha256:7aeaedb2bb6a543c2716b0e96a76fa59f9dd67d3b540929b9c6585816d0635b2`
(pre-stamp content; stamping changes only the header and approval blocks)
**Next actor:** human (commit authorization; the integration CI job is unproven)
**Implementer session:** `ses_e093cb0d4ffe9beD2qbKSt0IWn` (implementation +
correction cycle 1)
**Verifier session:** `ses_e091d631effeA4wzFEZh3SDxZT` (REVIEW-01);
`ses_e08e9f5c4ffeHO9znSIaoxJwkv` (REVIEW-02)
**Diff base:** `main` `1747e3cb503ec53486aa1707bffa756d956f7af8`
**Diff hash:** REVIEW-02 bound tracked
`sha256:121c79559f40e888dfafbda61653f2ac5fa0c3e2f94e3bb9b085bbd5e3d5d2e2`;
implementer-owned tracked subset
`sha256:d57224265edcf453e07049acf9fdebb1d7882d65cfae7a1f6a6fc573e2c5260b`;
untracked committable set
`sha256:c4d4377c3372c9584d4098902c075cdd95a88d83b4cd9b01545b6dd7a40438d6`
(recorded before the Lead's L-01/L-03/L-04 fixes and this review file)
**Review file:** `REVIEW-01.md` PASS WITH NOTES; `REVIEW-02.md` PASS WITH NOTES
(R-01/R-02 closed; L-02 residual; CI unproven)
**Implementer:** ame-implementer
**Risk:** **R2** — tenant isolation is the security boundary; the harness becomes
release evidence
**Complexity:** L2
**Workflow:** FEATURE (test infrastructure) + contract-free
**Branch:** `feat/ame-013-tenant-harness` (create from `main` `1747e3c`; do not
push until the CI gate)
**Source item:** `docs/ai/BACKLOG.md` → `AME-013`
**Related:** B3-S manual gate (`docs/ai/runs/QR-EAT-B3-S-COUNTER-FEED/evidence/`),
`docs/ai/PROJECT_PROFILE.md` tenant-isolation risks
**Updated:** 2026-11-20

> Planning only. This revision is not approval to edit code. No deploy,
> migration on a shared database, seed or production configuration change.

## Revision history

| Rev | Date | Change | Basis |
|---|---|---|---|
| 1 | 2026-11-20 | Initial approved contract (D1–D8) | Owner approval |
| 2 | 2026-11-20 | S3.1 reworded: the suite asserts the security invariant (refused, no order payload, no other-tenant identifiers) and records the observed refusal shape, because `GET /api/orders/[id]` returns 403 for a cross-tenant id and 404 for a missing one. Normalising the route is `AME-020`, out of scope. Adds D9 and AC11. No code, fixture or CI change. | Implementer finding + Lead verification of `requireOrderAccess` (`src/lib/rbac/resource-auth.ts:41-55`) |

**Implementation status:** implemented on `feat/ame-013-tenant-harness`
(uncommitted). The isolation suite, guard, fixtures, runner and CI job exist and
pass locally twice; revision 2 is an acceptance-wording amendment only.

## Objective

Replace "we tested tenant isolation once, manually" with a repeatable,
two-tenant integration harness that runs against a real PostgreSQL database,
exercises the routes that carry tenant data, and fails if any of them crosses
tenants. It must run locally on demand and in CI on every push, and it must
refuse to run against anything that is not a disposable database.

## Verified facts that shape the plan

Evidence read on 2026-11-20 at `main` `1747e3c`.

1. **Unit tests mock Prisma everywhere.** The full suite (1678 tests) runs with no
   database. Tenant isolation is therefore proven by mock assertions, not by row
   visibility or query scoping.
2. **The only real-database evidence is manual.** The B3-S gate ran a two-tenant
   HTTP harness once, from `.cjs` scripts under
   `docs/ai/runs/QR-EAT-B3-S-COUNTER-FEED/evidence/`. Those scripts hardcode a
   worktree path and a disposable DB URL (`fixtures.cjs` lines 10-17) and a
   redacted signing key; they are evidence, not infrastructure.
3. **CI has no database.** `.github/workflows/ci.yml` has a single job with
   `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/qreat_test` and no
   `services:` block; the URL is never connected to. Unit tests never touch it.
4. **CI is green as of `1747e3c`.** The build no longer needs runtime secrets
   (`AME-019`), so adding an independent integration job is safe and visible.
5. **Route handlers are testable without booting Next.** Routes import
   `next/server` and read tenant context from request headers via
   `getTenantContext`; the existing suite already mocks `server-only`. Calling a
   handler with a constructed `NextRequest` avoids a `next start` boot while
   still exercising the route's own tenant checks.
6. **Domain services are the actual scoping layer.** `requireOrderAccess`,
   `canReceiveRestaurantEvent` and the restaurant-change writer are the choke
   points a regression would break, so the harness must assert both "own tenant
   works" and "other tenant is refused or invisible".
7. **`tsx`, Jest 29 and Prisma 6 are already available**; no new dependency is
   needed. `prisma migrate deploy` is the production-safe migration command.

## Binding decisions

| # | Decision | Consequence |
|---|---|---|
| D1 | The harness runs against a **real** PostgreSQL database | It provisions nothing itself in CI (the job provides the service); locally it accepts an explicit URL. It never runs against production or Railway. |
| D2 | Hard safety guard on the database | Refuse to start unless the URL host is loopback and the database name matches a disposable pattern (for example `*_integration` or `qreat_it*`). Print the host/database name only, never credentials. |
| D3 | Two tenants, real rows, real RBAC | Fixtures create two restaurants, staff with role templates, permissions, stations and menu items, and at least one order per tenant. Emails use `@gate.invalid`. |
| D4 | Route-level fidelity without booting a server | Exercise at least the order read, order status/change feed, print-ticket and staff-event routes by invoking their handlers with a constructed `NextRequest` and authenticated headers. If a route cannot be invoked that way, stop and report rather than silently testing a weaker seam. |
| D5 | A separate Jest project, not the unit suite | `npm run test:integration` uses its own config and `testMatch`; the default `npm test` stays database-free and fast. |
| D6 | CI gains an independent blocking job | A `postgres:16` service, `prisma migrate deploy`, then the integration suite. The existing verify job is unchanged. If the job is flaky, fix it; do not mark it optional. |
| D7 | The harness proves it can fail | A mutation check in the task evidence: break one tenant filter (or scope) in a throwaway copy and show the suite fails with a clear cross-tenant assertion. |
| D8 | Cleanup is deterministic | The harness truncates or deletes only the rows it owns, in `afterAll`, and leaves the schema intact. CI uses a fresh database per run. |
| D9 | Product gaps found by the harness are recorded, not fixed here | The suite must not edit routes to pass. A refusal that returns 5xx for anonymous callers, or a cross-tenant 403 that distinguishes a real order from a missing one, is recorded as an observation and opened as a follow-up (`AME-020`). |

## Scope

### S0 — Baseline and guardrails

- Create `feat/ame-013-tenant-harness` from `main` `1747e3c`; confirm a clean
  tree.
- Record the real baseline: `npm test -- --runInBand`, `npm run type-check`,
  `npm run build` (ephemeral placeholders only), owned-file lint.
- Confirm the safety guard rejects a non-loopback or production-looking URL
  before writing anything (test it).

### S1 — Database guard and connection

- A single module (for example `src/tests/integration/support/db.ts`) that reads
  the test URL, validates host and database name, creates one `PrismaClient`, and
  exposes `assertDisposableDatabase()` with a clear error.
- Use a dedicated variable (for example `INTEGRATION_DATABASE_URL`) so a local
  `.env` cannot silently point the harness at a shared database. If unset, fail
  with instructions.

### S2 — Two-tenant fixtures

- `src/tests/integration/support/fixtures.ts` (TypeScript, Prisma):
  - permissions and role templates needed by cashier/manager (reuse the B3-S
    list; do not invent new permission semantics);
  - two restaurants with distinct tax/service snapshots;
  - one cashier and one manager per restaurant, with `UserRole` rows and the
    permission sets the routes require;
  - two stations, category-to-station mappings, a few menu items;
  - one order per tenant with items, a ticket and a change row where the
    producer would create one.
- Idempotent for repeated local runs (upsert or unique suffix), deterministic
  cleanup in `afterAll`.

### S3 — Isolation suite

`src/tests/integration/tenant-isolation.test.ts` covering at least:

1. **Order read:** tenant A can read its own order; a cross-tenant id is refused
   with a non-2xx response that carries no order payload and no other-tenant
   identifiers. The suite records the observed status. *Rev 2:* the current route
   returns `403 FORBIDDEN` for a cross-tenant id and `404 NOT_FOUND` for a missing
   one (`src/lib/rbac/resource-auth.ts:41-55`), which is an existence signal;
   normalising it to `404 ORDER_NOT_FOUND` for both is `AME-020`, out of scope.
2. **Order list/changes:** A's list and `/api/counter/changes` cursor return only
   A's rows; B's rows never appear.
3. **Mutation:** A cannot add items to or cancel B's order; the response is the
   not-found/forbidden shape the route defines, and B's order is unchanged.
4. **Print tickets/ack:** A cannot fetch or ack B's tickets.
5. **Staff event filtering:** the SSE filter (`canReceiveRestaurantEvent`) drops
   B's events for an A connection, fails closed on missing/empty ids, and allows
   A's own.
6. **RBAC:** a staff user without the required permission is refused; the same
   user with the permission succeeds (proves the harness is not passing
   trivially).
7. **Positive control:** every negative assertion is paired with a successful
   own-tenant call, so a route that simply returns 404 for everything cannot
   pass.

### S4 — Runner, scripts and CI

- New `jest.integration.config.js` (Node environment, `testMatch`
  `src/tests/integration/**/*.test.ts`, `maxWorkers: 1`, longer timeout).
- `package.json`: add `test:integration` only (no other script changes).
- `.github/workflows/ci.yml`: add a `integration` job with a `postgres:16`
  service and health check; steps: checkout, Node 20, `npm ci`,
  `npx prisma generate`, `npx prisma migrate deploy`, `npm run test:integration`.
  Pass the job a disposable database name that satisfies the guard. Leave the
  existing `verify` job untouched.
- Local workflow documented: start a disposable cluster under `/tmp/opencode`,
  `createdb qreat_integration`, `migrate deploy`, `npm run test:integration`.

### S5 — Docs and evidence

- `docs/ai/runs/QR-EAT-AME-013-TENANT-HARNESS/` gets the contract, run log,
  evidence of the mutation check, the local run and the CI run.
- Update `PROJECT_PROFILE.md` testing section to name the two suites and what each
  proves (unit: mocked; integration: real DB isolation).
- Do not change `docs/PRODUCT/**` or any contract.

## Non-goals

- Replacing unit tests or reducing their coverage.
- Testing payment provider callbacks, webhooks or external services.
- Load, performance or fuzz testing.
- A production or staging run against real tenants; no production data.
- `AME-017` (one LISTEN session per process) and any product behaviour change.
- New dependencies.
- Deploy, seed in production, or migration on any shared database.

## Ownership

**Files/modules owned (implementer):**

```text
src/tests/integration/support/db.ts                     (new)
src/tests/integration/support/fixtures.ts               (new)
src/tests/integration/tenant-isolation.test.ts          (new)
jest.integration.config.js                              (new)
package.json                                            (test:integration script only)
.github/workflows/ci.yml                                (new integration job only)
docs/ai/PROJECT_PROFILE.md                              (testing section only)
docs/ai/runs/QR-EAT-AME-013-TENANT-HARNESS/**           (run log, evidence)
```

**Do not touch:**

```text
src/app/**  (any route or middleware)
src/lib/**  (domain, auth, tenant guards)
prisma/schema.prisma, prisma/migrations/**, prisma/seed.ts
docs/PRODUCT/**
.env* / .railway-env-*.txt / any secret
TASK.md / NEXT.md (Lead-owned)
```

If a route cannot be exercised without changing it, stop and report: that is a
design finding, not permission to edit the route.

## Context budget

**Must read:**

- `AGENTS.md`, `docs/ai/PROJECT_PROFILE.md`, this `TASK.md`
- `docs/ai/runs/QR-EAT-B3-S-COUNTER-FEED/evidence/fixtures.cjs` (patterns only)
- `docs/ai/runs/QR-EAT-B3-S-COUNTER-FEED/evidence/gate.cjs` (case 2/5/6 shapes)
- `.github/workflows/ci.yml`
- the routes named in S3 and their tenant helpers

**Read only if unclear:**

- `src/lib/counter/tenant-guards.ts`, `src/lib/auth-utils.ts` (read-only)
- `src/lib/restaurant-changes.ts`
- the B3-S run log case descriptions

**Do not read by default:**

- the whole repository or the whole `docs/ai/` tree
- `../Tabtep-App`
- `.env`, `.env.local`, `.railway-env-*.txt`
- generated build output

## Test plan

- The isolation suite itself, run twice in a row against the same disposable
  database (idempotence and cleanup).
- Unit suite unchanged and still database-free: `npm test -- --runInBand` must
  pass with no `INTEGRATION_DATABASE_URL` set.
- Guard tests: non-loopback host rejected; production-looking name rejected;
  unset variable gives an actionable error.
- Mutation check (D7): in a throwaway copy, remove one tenant predicate and show
  the suite fails, then restore. Record the output.
- CI: the new job green; the existing `verify` job still green.

## Acceptance criteria

1. `npm run test:integration` runs two-tenant isolation checks against a real
   disposable PostgreSQL database and exits non-zero on any cross-tenant access.
2. Every negative assertion has a paired positive control; a route that returns
   not-found for everything fails the suite.
3. The suite refuses a non-loopback or non-disposable database before any write,
   and prints no credentials.
4. The mutation check demonstrates the suite catches a removed tenant filter.
5. `npm test -- --runInBand` still passes with no database and is not slowed or
   coupled to the integration config.
6. CI has a separate blocking integration job with `postgres:16`; the existing
   verify job is unchanged and still green.
7. Fixtures are idempotent and clean up their own rows; a second consecutive run
   passes.
8. No route, domain, tenant-guard, schema, migration, seed or contract change; no
   new dependency.
9. `PROJECT_PROFILE.md` testing section distinguishes unit and integration
   evidence accurately.
10. No deploy, production database access, seed run or secret in code, logs or
    evidence.
11. Any route whose refusal shape leaks existence, or that answers anonymous
    callers with 5xx, is recorded as an observation with evidence and opened as a
    follow-up; the suite still asserts the security invariant and is not weakened
    to make the product pass.

## Verification commands

```text
git status --porcelain --untracked-files=all
npm test -- --runInBand                     # no DB, must stay green
npm run type-check
npm run build                               # ephemeral placeholders only
npm run test:integration                    # with INTEGRATION_DATABASE_URL set
npm run test:integration                    # second consecutive run
```

Local disposable database:

```text
/usr/lib/postgresql/16/bin/initdb -D /tmp/opencode/ame013/pg -A trust -U postgres --no-sync
/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/opencode/ame013/pg -o "-p 55434 -c listen_addresses=127.0.0.1" start
createdb -h 127.0.0.1 -p 55434 -U postgres qreat_integration
npx prisma migrate deploy
INTEGRATION_DATABASE_URL=... npm run test:integration
```

Never print the URL with credentials. If a run needs a JWT signing value, use a
disposable local value and keep it out of committed files.

## Review focus

- The guard genuinely prevents a non-disposable target; no bypass path.
- Isolation assertions are meaningful (positive controls, no 404-for-everything
  pass).
- Route-level fidelity is real; no silent fallback to a weaker seam.
- Cleanup and idempotence; no leftover rows that could poison a later run.
- Unit suite remains database-free and unchanged.
- CI job is blocking, isolated, and does not weaken the existing job.
- No fixture data that resembles real people, restaurants or PII.
- No route/domain/schema change smuggled in to make a test pass.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Guard is wrong and the harness touches a shared database | Data damage | Strict loopback + name pattern check before any write; dedicated env var; test the guard |
| Route handlers cannot be invoked in Jest cleanly | Weaker fidelity or a blocked task | Stop and report; do not edit routes to make tests pass |
| CI job flaky (port/health/startup) | Red builds again | Health-checked service, `maxWorkers: 1`, generous timeout, run twice locally |
| Fixtures drift from real producers | False confidence | Build fixture rows through the same Prisma models the producers use; cover the fields the routes read |
| Cleanup deletes too much | Data loss in a dev database | Delete only rows created by this run; guard prevents non-disposable targets |
| Integration suite slows the release loop | Bypassed suite | Keep it a separate job and a separate script; unit suite unchanged |

## Approval

**Approval applies to this exact revision only.** A material change requires a new
revision and new approval. Approval includes the R2 allowance to add the CI job
and the `test:integration` script; it is not deploy, push to `main`, production
database access or seed permission.

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
test(integration): add two-tenant isolation harness on real PostgreSQL

- add guarded disposable-database support and two-tenant fixtures
- cover order, changes, tickets, staff-event and RBAC isolation with positive controls
- add a separate Jest project and test:integration script
- run the suite in a blocking CI job with a postgres:16 service
- record the mutation check and the unit/integration split in the project docs
```

**Exact path list (21 files, base `1747e3c`):**

```text
.github/workflows/ci.yml
package.json
jest.integration.config.js
src/tests/integration/support/db.ts
src/tests/integration/support/fixtures.ts
src/tests/integration/support/guard.ts
src/tests/integration/support/setup.ts
src/tests/integration/tenant-isolation.it.ts
docs/ai/ACTIVE.md
docs/ai/BACKLOG.md
docs/ai/PROJECT_PROFILE.md
docs/ai/runs/QR-EAT-AME-013-TENANT-HARNESS/TASK.md
docs/ai/runs/QR-EAT-AME-013-TENANT-HARNESS/RUN_LOG.md
docs/ai/runs/QR-EAT-AME-013-TENANT-HARNESS/NEXT.md
docs/ai/runs/QR-EAT-AME-013-TENANT-HARNESS/REVIEW-01.md
docs/ai/runs/QR-EAT-AME-013-TENANT-HARNESS/REVIEW-02.md
docs/ai/runs/QR-EAT-AME-013-TENANT-HARNESS/evidence/local-run-1.txt
docs/ai/runs/QR-EAT-AME-013-TENANT-HARNESS/evidence/local-run-2.txt
docs/ai/runs/QR-EAT-AME-013-TENANT-HARNESS/evidence/guard-rejections.txt
docs/ai/runs/QR-EAT-AME-013-TENANT-HARNESS/evidence/mutation-check.txt
docs/ai/runs/QR-EAT-AME-013-TENANT-HARNESS/evidence/cleanup-sentinel.txt
```

`ACTIVE.md` and `BACKLOG.md` are Lead bookkeeping (navigation plus the AME-020
row), recorded as such (REVIEW-02 N-02). No product route, domain, schema,
migration, seed, dependency or `jest.config.js` change; no `.env` or secret.

**Commit authorized by:** Atiff
**Authorization date:** 2026-11-20
**Authorization scope:** one local commit with the exact path list and message
above, plus pushing `feat/ame-013-tenant-harness` to run both CI jobs. Merge is
not authorized until both are green.

## Residual risks and follow-ups

- **`AME-020` (found by this harness, `R2`).** `GET /api/orders/[id]` answers
  `403 FORBIDDEN` for another tenant's order and `404 NOT_FOUND` for a missing
  one, so it distinguishes "exists elsewhere" from "does not exist". The
  adjustment endpoints already normalise to 404; this read route does not.
  `GET /api/events/orders` without credentials answers `500` (generic catch)
  instead of `401`, though it fails closed. The suite records both as
  observations; fixing them requires a route change and its own approval.
- Route-handler invocation in Jest is not the full HTTP stack: middleware and
  header parsing are simulated. The B3-S manual gate remains the end-to-end
  reference until a server-boot harness exists.
- The harness proves isolation for the covered routes, not the whole API; new
  tenant-bearing routes must be added to it.
- Fixtures write the canonical permission and role-permission reference rows
  (copied from `prisma/seed.ts`) and leave them in place; only tenant-scoped and
  run-written rows are removed.
- CI runtime increases by roughly one to two minutes.
- `AME-017` remains deferred.

## Return format

```text
Summary:
Files changed:
Commands run and results (incl. second run, mutation check, CI job):
Deviations:
Blockers:
Residual risks:
Recommended next action:
```
