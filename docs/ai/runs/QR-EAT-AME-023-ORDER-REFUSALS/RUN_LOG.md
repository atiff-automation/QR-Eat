# Run Log — QR-EAT-AME-023-ORDER-REFUSALS

**Title:** Anonymous order 401 and modify 404; audit other resource refusals
**Type:** bug (response consistency)
**Risk:** R2
**Spec level:** L2
**Owner:** Atiff
**Date:** 2026-11-20
**Branch/commit:** `fix/ame-023-order-refusals` (created from `main` `6bca423`;
implementation uncommitted)
**Task revision:** 1
**Approved revision:** 1 (2026-11-20, Atiff; “approve revision 1”)
**Task contract:** `TASK.md`
**Resume bookmark:** `NEXT.md`
**Latest review:** —

## Request

Close the remaining order-surface refusal inconsistencies found by the AME-020
review and the deployment smoke: anonymous order requests answer `500` instead of
`401`, and `modify` returns a generic `500` for both foreign and missing ids.
Plan first, stop for approval.

## Classification

- Type: BUG. No data leak; wrong status class and inconsistency, and monitoring
  noise.
- Risk R2: authentication and tenant boundary.
- Level L2: a new response-only helper, six order routes, three test files, the
  harness, and an audit table.

## Scope

In scope:

- shared refusal helper (`src/lib/api/refusals.ts`);
- anonymous `401` on the six named order routes;
- `modify` refusals → `404 ORDER_NOT_FOUND`;
- read-only audit of `requireTableAccess` / `requireRestaurantAccess`;
- exact tests and harness assertions.

Non-goals:

- RBAC/auth helpers, tables/restaurants/settings routes (audit only);
- platform-admin policy, RLS, `AME-017`;
- contract, schema, migrations, dependencies;
- deploy, seed, production data, `../Tabtep-App`.

## Context

**Context budget used:**

- Must read: the six order routes, `resource-auth.ts`, `requireAuth`,
  `REVIEW-02.md` R-03, the AME-020 release note, the harness.
- Read only if unclear: the items route mapping, the orders list 401 pattern, the
  table/restaurant call sites during the audit.
- Not read: the wider repository, `.env*`, generated output.

## Investigation / specification

Confirmed at `main` `6bca423`:

1. `GET /api/orders/{id}` unauthenticated returns `500 {"error":"Failed to fetch
   order"}` in production; `GET /api/orders` returns `401`.
2. The `[id]`, `status` and `modify` handlers have no auth branch in their catch;
   `status` returns a blanket `500`.
3. `modify` maps validation `400` and permission `403`, then falls through to
   `500` for RBAC 403/404 from `requireOrderAccess` (REVIEW-02 R-03).
4. The `'Authentication required' → 401` mapping is copy-pasted across roughly 20
   routes and missing from these ones — hence a shared helper.
5. `requireTableAccess` (10 production call sites) and `requireRestaurantAccess`
   (~30) throw raw `403`/`404`, the pattern AME-020 fixed for orders.
6. No client or contract depends on `500`/`403` for anonymous access.

## Plan

1. Add the response-only helper and unit-test it.
2. Map auth failures to `401` and `modify` refusals to `404` without touching
   other branches.
3. Audit table/restaurant call sites; open `AME-024` with the affected routes.
4. Extend route tests and the isolation harness with exact assertions.
5. Reproduce before/after; run the full gates and both CI jobs.

## Approvals

| Gate | What was approved | Approved by | Date | Conditions |
|---|---|---|---|---|
| Design/plan | Revision 1 as presented: D1–D6, orders surface only, tables/restaurants audited | Atiff | 2026-11-20 | Approval hash `75210651…` (pre-stamp content) |
| Build | Bounded implementation by one `ame-implementer` | Atiff | 2026-11-20 | Covered by the revision-1 approval |
| Commit | — | — | — | Not requested; R2 review + commit gate |
| Release | — | — | — | Out of scope; merge decided after CI green |

## Commit gate

- [x] Review PASS (REVIEW-01, PASS WITH NOTES; no code correction required)
- [x] Exact path list published (`TASK.md` commit gate, 25 files)
- [x] Exact commit message published
- [x] Human approved (Atiff, 2026-11-21; commit + branch push for CI)
- [x] No unrelated changes (ACTIVE/BACKLOG are Lead bookkeeping)

## Execution

Files changed:

- `docs/ai/runs/QR-EAT-AME-023-ORDER-REFUSALS/TASK.md` (new)
- `docs/ai/runs/QR-EAT-AME-023-ORDER-REFUSALS/RUN_LOG.md` (new)
- `docs/ai/runs/QR-EAT-AME-023-ORDER-REFUSALS/NEXT.md` (new)

Commands run:

```text
curl https://tabtep.app/api/orders/<uuid>      -> 500 (deploy smoke)
curl https://tabtep.app/api/orders             -> 401
grep -rn "Authentication required" src/app/api | ...
grep -rn "requireTableAccess\|requireRestaurantAccess" src/app/api | ...
sed -n '420,445p' src/app/api/orders/[id]/modify/route.ts
```

## Verification

Verdict: not started (planning)

Findings:

- Confirmed in production for the order read route; confirmed by code for the
  rest.

Not verified:

- Runtime reproduction of every route (belongs to the implementation task).

## Residual risk

- Outside orders, other anonymous `500`s remain (admin/settings routes).
- Table/restaurant leaks, if any, are audited not fixed (`AME-024`).

## Release

- Deployed: no
- Smoke test: n/a
- Rollback: n/a
- Monitoring: n/a

## Lessons

- What worked: the deployment smoke caught the anonymous `500` that unit tests and
  the harness did not cover.
- What to change: one shared auth-refusal helper instead of copy-pasted checks.
- Follow-ups: `AME-024`, `AME-022`, `AME-021`, pilot gate.

## Implementation evidence

**Date:** 2026-11-20
**Implementer:** ame-implementer
**Branch:** `fix/ame-023-order-refusals` (base `main` `6bca423`; uncommitted)
**Task revision:** 1 (D1–D6, S0–S5, AC1–AC9)

### Files changed

- `src/lib/api/refusals.ts` (new) — response-only helper:
  `isAuthenticationFailure`, `authenticationRequiredResponse`,
  `ORDER_NOT_FOUND_BODY`, `orderNotFoundResponse`. No Prisma, RBAC or domain
  imports.
- `src/app/api/orders/[id]/route.ts` — GET/PATCH map an authentication failure
  to the shared `401`; the local `ORDER_NOT_FOUND_BODY` copy is replaced by the
  shared `404` response helper. Existing RBAC, permission and generic branches
  are unchanged.
- `src/app/api/orders/[id]/status/route.ts` — the null-context branch uses the
  shared `401`; the catch maps an authentication failure to `401` before the
  generic `500`; the two `404` bodies use the shared helper.
- `src/app/api/orders/[id]/modify/route.ts` — `requireOrderAccess` `403`/`404`
  are normalised to the shared `404 ORDER_NOT_FOUND` before body parsing; the
  catch maps authentication failure to `401`; Zod `400`, permission `403`,
  conflict `409` and genuine `500` logging are unchanged.
- `src/app/api/orders/[id]/ready/route.ts` — a request with no credentials is an
  authentication failure: `requireAuth(null)` writes the anonymous audit event
  and the catch returns the shared `401`. Kitchen/permission `403` and version
  `409` branches are unchanged.
- `src/app/api/orders/[id]/recall/route.ts` — same anonymous guard and `401`
  mapping; recall-disabled, permission, version and business branches are
  unchanged.
- `src/tests/api-refusals.test.ts` (new) — direct helper tests.
- `src/tests/order-anonymous-auth.test.ts` (new) — anonymous `401` on all six
  named routes and the `requireAuth`/audit path.
- `src/tests/order-modify-refusal-shape.test.ts` (new) — foreign vs missing
  identical `404`, no transaction, permission `403`, validation `400`, genuine
  `500`.
- `src/tests/integration/tenant-isolation.it.ts` — anonymous `GET
  /api/orders/{id}` exact `401` + audit-row claim + own-tenant positive control;
  `modify` cross/missing exact equal `404`, no mutation, own-tenant modify
  positive control. Existing AME-020 assertions are unchanged.
- `docs/ai/runs/QR-EAT-AME-023-ORDER-REFUSALS/evidence/**` (new) — before/after,
  focused and regression output, full suite, type-check, build, two integration
  runs, S3 audit.

No change to `src/lib/rbac/**`, `tenant-context.ts`, `postgres-pubsub.ts`,
table/counter/pos/members/promotions routes, contract, schema, migrations, seed
or dependencies.

### Before / after

- Anonymous `GET /api/orders/{id}`: production smoke at AME-020 was
  `500 {"error":"Failed to fetch order"}`; after, the handler returns
  `401 {"error":"Authentication required","code":"AUTHENTICATION_REQUIRED"}`
  before any lookup.
- `PATCH /orders/{id}/modify`: REVIEW-02 R-03 recorded identical generic `500`
  for foreign and missing; after, both are
  `404 {"success":false,"error":"Order not found","code":"ORDER_NOT_FOUND"}`
  with no transaction and no mutation.

### S3 read-only audit

Evidence: `evidence/s3-resource-refusal-audit.md`.

| Helper | Call sites | Distinct foreign/missing body | Identical generic 500 |
|---|---:|---:|---:|
| `requireTableAccess` | 11 | 6 (`403`/`404`) | 5 |
| `requireStaffAccess` | 0 | — | — |
| `requireRestaurantAccess` | 35 | 27 (15 `403`/`404`, 12 `403`/`500`) | 8 |

No table, staff or restaurant route was edited. Follow-up `AME-024` covers the
normalisation.

### Commands run and results

| Command | Result |
|---|---|
| `npx jest api-refusals order-anonymous-auth order-modify-refusal-shape --runInBand` | PASS — 3 suites, 15 tests |
| `npx jest order-get order-status-refusal add-items cancel print-tickets print-ack ready --runInBand` | PASS — 7 suites, 91 tests |
| `npm test -- --runInBand` | PASS — 146 passed + 1 skipped suites, 1724 passed + 11 skipped tests |
| `npm run type-check` | PASS |
| `npm run build` (ephemeral placeholders, shell only) | PASS |
| owned `eslint` on changed files | PASS — no output |
| owned `prettier --check` on changed files | PASS after formatting |
| `npm run test:integration` (fresh disposable PostgreSQL 16, `migrate deploy`, no seed) | PASS — 20/20 |
| second consecutive `npm run test:integration` | PASS — 20/20 |

### Deviations

- `status` keeps its existing direct null-context `401` path (now using the
  shared body) rather than routing that branch through `requireAuth`. The route
  did not write an anonymous audit event before, so this preserves "as before";
  the catch still maps an authentication failure to `401`.
- `ready` and `recall` add an explicit no-credential guard because
  `resolveKitchenActor` collapses "no token" and "authenticated but not
  kitchen" into `null`. A supplied but invalid token still reaches the existing
  `403` kitchen/permission branch; distinguishing it would need a change to
  `kitchen-actor`.

### Residual risks

- Invalid (not absent) credentials on `ready`/`recall` still return `403`.
- Handler-level tests do not exercise middleware.
- Table and restaurant refusal shapes remain inconsistent until `AME-024`.
- Platform-admin status mutation and RLS remain separate policies (`AME-022`,
  `AME-021`).

### Recommended next action

Fresh `ame-verifier` review of the integrated diff, then the R2 commit gate.

## Lead check — 2026-11-20

- **Scope:** the new response-only helper, five order route files, the harness
  and three test files, plus evidence. No `src/lib/rbac/**`, `tenant-context.ts`,
  schema, contract or dependency change.
- **Helper:** `src/lib/api/refusals.ts` imports only `next/server`; the 401 body,
  the auth predicate and the 404 order body live in one place. This is what the
  order routes now use.
- **Orders `[id]` GET/PATCH:** the existing `requireAuth` call still runs (so the
  anonymous audit event is written), and the catch maps the auth failure to the
  shared 401.
- **`status`:** already returned 401 before the change but without calling
  `requireAuth`, so it wrote no anonymous audit event — and still does not. The
  deviation is behaviour-preserving; D2's audit clause is only partly met here,
  and that is pre-existing, not a regression.
- **`ready`/`recall`:** no credentials now call `requireAuth(null)` (audit event
  written) and return 401; authenticated-but-not-kitchen still 403. The guard
  uses `getTokenFromRequest`, which reads the cookie tokens as well as Bearer, so
  cookie clients are covered.
- **`modify`:** `requireOrderAccess` 403/404 → shared 404 with no transaction;
  its 400/403 branches and the 500 log path are preserved.
- **S3 audit:** 11 `requireTableAccess` sites (6 with differing refusals, 5 with
  an identical generic 500) and 35 `requireRestaurantAccess` sites (27 with
  differing refusals — 15 `403/404`, 12 `403/500` — and 8 identical 500).
  `requireStaffAccess` has no production callers. That makes `AME-024` larger
  than this task assumed; the table is evidence, not a fix.
- **Evidence:** 15 focused tests, 91 regression, full suite 1724 passed / 11
  skipped, integration 20/20 twice.
- **Not verified by the Lead:** the CI runs and the cookie-vs-Bearer variants.
  Routed to `REVIEW-01`.
