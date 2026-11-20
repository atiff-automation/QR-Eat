# Task — QR-EAT-AME-023-ORDER-REFUSALS

**Status:** ready_to_commit
**Revision:** 1
**Approved revision:** 1
**Approved by:** Atiff
**Approval date:** 2026-11-20
**Approval basis:** “approve revision 1” — D1–D6 binding, orders surface only,
table/restaurant routes audited with `AME-024` as the follow-up
**Approval hash:** `sha256:752106518bad5833215610369d12c2eec65c3904facf088cb722664767df9d56`
(revision-1 content as presented for approval, before this approval block was
stamped)
**Next actor:** human (commit authorization; CI unproven)
**Implementer session:** `ses_e06b4e329ffe6ImWmqc6b3hojt`
**Verifier session:** REVIEW-01 (session recorded by the Lead)
**Diff base:** `main` `6bca423803b8662288f20da2e159b43560563bec`
**Diff hash:** product-only
`sha256:ac4f067e119d2af0e4b0dbfaf32eeb95b6ae20ebd3f8994b77ea311d8c9dbe53`;
tracked `sha256:a3213a6c20bb8ddd53708d0b44e0455e09a2134de7355265f2f524954539584a`
**Review file:** `REVIEW-01.md` — PASS WITH NOTES (L-01–L-03, N-01–N-03)
**Implementer:** ame-implementer
**Implementer session:**
**Verifier session:**
**Diff base:**
**Diff hash:**
**Review file:**
**Risk:** **R2** — authentication and tenant boundary; response-shape changes across
order routes
**Complexity:** L2
**Workflow:** BUG (consistency defects found by the AME-020 review and the
deployment smoke)
**Branch:** `fix/ame-023-order-refusals` (create from `main` `6bca423`)
**Source item:** `docs/ai/BACKLOG.md` → `AME-023`
**Updated:** 2026-11-20

**Implementation status:** implemented on `fix/ame-023-order-refusals`
(uncommitted), awaiting independent review. Evidence is in `RUN_LOG.md` →
“Implementation evidence” and `evidence/`.

## Objective

Finish the refusal-shape work for the **order** surface: an unauthenticated
request must get `401`, not `500`, and `PATCH /orders/{id}/modify` must return the
same `404 ORDER_NOT_FOUND` as every other order route instead of a generic `500`.
Then audit the other resource helpers (tables, restaurants) as evidence, without
fixing them here.

## Verified facts that shape the plan

Evidence read on 2026-11-20 at `main` `6bca423`, plus the AME-020 deployment
smoke.

1. **Anonymous order reads answer 500.** `GET /api/orders/{id}` without a token
   returns `500 {"error":"Failed to fetch order"}` in production, while
   `GET /api/orders` returns `401`. `getTenantContext` returns `null`,
   `requireAuth` throws `Error('Authentication required')`, and the `[id]`
   handler's catch has no auth branch.
2. **The same gap exists on sibling order routes.** `PATCH /orders/{id}` and
   `PATCH /orders/{id}/status` have catch blocks with no auth mapping; `status`
   returns a plain `500` for every unexpected error, including auth. `modify`
   maps validation `400` and permission `403`, then falls through to `500`.
3. **`modify` still leaks nothing but returns the wrong class.** REVIEW-02 R-03:
   a foreign id and a missing id both return the identical generic
   `500 {"error":"Failed to modify order"}`. No existence signal; inconsistent
   with the `404 ORDER_NOT_FOUND` contract the rest of the order surface now uses.
4. **A shared pattern already exists.** `orders/[id]/items`, `pos/payment`,
   `reservations`, `reports`, several admin routes and the SSE route map
   `'Authentication required'` to `401` inline. There is no shared helper, so the
   mapping is copy-pasted and easy to miss — which is exactly how these gaps
   appeared.
5. **Table and restaurant helpers throw the raw shape.** `requireTableAccess`
   (10 production call sites) and `requireRestaurantAccess` (about 30, across
   members, promotions, settings, restaurants, reports) throw `403` for a
   cross-tenant id and `404` for a missing one — the same pattern AME-020 fixed
   for orders. `requireStaffAccess` has no production callers.
6. **No client depends on 500/403 here.** The Android client treats non-2xx as
   failure; the contract does not document these statuses for anonymous access.

## Binding decisions

| # | Decision | Consequence |
|---|---|---|
| D1 | One shared refusal helper | New `src/lib/api/refusals.ts` exports the auth predicate, the `401` body/response and the `404 ORDER_NOT_FOUND` body/response. Order routes use it instead of copy-pasted checks. It must not import Prisma, RBAC or domain modules (response shaping only). |
| D2 | Anonymous order requests are `401` | Every order route reachable without a token returns `401 { error, code: 'AUTHENTICATION_REQUIRED' }` before any lookup, and still writes the anonymous audit event through `requireAuth`. |
| D3 | `modify` joins the order contract | A foreign or missing id returns the same `404 ORDER_NOT_FOUND` body as the rest of the order surface. Validation stays `400`, permission stays `403`, unexpected stays `500`. |
| D4 | No new authority changes | `requireOrderAccess`, RBAC and auth helpers are untouched. The change is at the HTTP boundary only. |
| D5 | Tables and restaurants are audited, not fixed | Produce a per-call-site table (route, cross status, missing status, leak?) for `requireTableAccess` and `requireRestaurantAccess`, and open a follow-up (`AME-024`) for whichever need normalising. Do not edit those routes in this task. |
| D6 | The harness grows, never weakens | Add an anonymous `GET /api/orders/{id}` → `401` assertion and a `modify` cross-vs-missing equality assertion. Existing AME-020 assertions stay exact. |

## Scope

### S0 — Baseline and guardrails

- Create `fix/ame-023-order-refusals` from `main` `6bca423`; confirm a clean tree.
- Record baseline: full tests, type-check, build (ephemeral placeholders), owned
  lint, and the integration suite on a disposable database.
- Reproduce: anonymous `GET/PATCH /orders/{id}` → `500`; `modify` foreign vs
  missing → identical `500`. Record it.

### S1 — Shared refusal helper

- `src/lib/api/refusals.ts` (new):
  - `isAuthenticationFailure(error): boolean` — the existing
    `'Authentication required'` check, in one place;
  - `authenticationRequiredResponse()` → `401` with
    `{ error: 'Authentication required', code: 'AUTHENTICATION_REQUIRED' }`;
  - `ORDER_NOT_FOUND_BODY`, `orderNotFoundResponse()` → `404` with
    `{ success: false, error: 'Order not found', code: 'ORDER_NOT_FOUND' }`.
- No Prisma, RBAC or domain imports. Unit-test the helper directly.

### S2 — Order routes

- `orders/[id]` GET and PATCH, `orders/[id]/status`, `orders/[id]/modify`,
  `orders/[id]/ready`, `orders/[id]/recall`: map an authentication failure to the
  shared `401` before the generic `500`. Keep every existing branch: permission
  `403`, validation `400`, business rules, RBAC error statuses.
- `modify`: wrap `requireOrderAccess` (or map its `403`/`404`) to the shared
  `404` body; keep the existing `400`/`403` branches.
- Do not change payloads, success responses or business rules.

### S3 — Audit other resource helpers (read-only)

- Enumerate every `requireTableAccess`, `requireStaffAccess` and
  `requireRestaurantAccess` call site. For each, record: route, method, status for
  a foreign id, status for a missing id, and whether the response body differs.
- Produce the table as evidence and open `AME-024` with the affected routes. Do
  not edit them.

### S4 — Tests and harness

- Route tests: anonymous `401` for `GET`/`PATCH /orders/{id}`, `status`, `modify`,
  `ready`, `recall`; `modify` foreign vs missing identical `404` with no data;
  permission `403` and validation `400` unchanged.
- Harness: anonymous `GET /api/orders/{id}` → exact `401` body; `modify` cross vs
  missing → exact equal `404`. Keep the own-tenant positive control for every
  negative.
- Existing AME-020 assertions must remain exact.

### S5 — Docs and evidence

- Run log with the before/after reproduction, the audit table, and the test
  output. No contract change expected; if one is needed, stop and report.

## Non-goals

- Changing `requireOrderAccess`, `requireTableAccess`, `requireRestaurantAccess`,
  `requireStaffAccess`, RBAC, sessions or auth helpers.
- Fixing table/restaurant/member/settings routes (audit only; `AME-024`).
- The platform-admin policy question (`AME-022`).
- RLS (`AME-021`), `AME-017`.
- Payloads, contracts, schema, migrations, seed, dependencies.
- Deploy, production data, `../Tabtep-App`.

## Ownership

**Files/modules owned (implementer):**

```text
src/lib/api/refusals.ts                          (new)
src/app/api/orders/[id]/route.ts
src/app/api/orders/[id]/status/route.ts
src/app/api/orders/[id]/modify/route.ts
src/app/api/orders/[id]/ready/route.ts
src/app/api/orders/[id]/recall/route.ts
src/tests/api-refusals.test.ts                   (new)
src/tests/order-anonymous-auth.test.ts           (new)
src/tests/order-modify-refusal-shape.test.ts      (new)
src/tests/integration/tenant-isolation.it.ts     (add assertions only)
docs/ai/runs/QR-EAT-AME-023-ORDER-REFUSALS/RUN_LOG.md
docs/ai/runs/QR-EAT-AME-023-ORDER-REFUSALS/evidence/**
```

**Do not touch:**

```text
src/lib/rbac/**
src/lib/tenant-context.ts
src/lib/postgres-pubsub.ts
src/app/api/tables/**, counter/**, pos/**, members/**, promotions/**
prisma/**
docs/PRODUCT/**
TASK.md / NEXT.md (Lead-owned)
.env* / any secret
```

If a route needs a business-rule change to satisfy the outcome, stop and report.

## Context budget

**Must read:**

- `AGENTS.md`, `docs/ai/PROJECT_PROFILE.md`, this `TASK.md`
- the six order routes named above
- `src/lib/rbac/resource-auth.ts` (read-only), `src/lib/tenant-context.ts`
  (`requireAuth` only)
- `REVIEW-02.md` (R-03) and the AME-020 run log's Release section (smoke finding)
- `src/tests/integration/tenant-isolation.it.ts` (the order suites)

**Read only if unclear:**

- `src/app/api/orders/[id]/items/route.ts` (mapping pattern)
- `src/app/api/orders/route.ts` (401 pattern)
- the table/restaurant call sites during the S3 audit

**Do not read by default:**

- the whole repository or the whole `docs/ai/` tree
- `../Tabtep-App`
- `.env`, `.env.local`, `.railway-env-*.txt`
- generated build output

## Test plan

Covered by S4. Behaviour matrix:

| Case | Before | After |
|---|---|---|
| Anonymous `GET /orders/{id}` | 500 | 401 `AUTHENTICATION_REQUIRED` |
| Anonymous `PATCH /orders/{id}` | 500 | 401 |
| Anonymous `status` / `modify` / `ready` / `recall` | 500 | 401 |
| `modify` foreign id | 500 generic | 404 `ORDER_NOT_FOUND` |
| `modify` missing id | 500 generic | 404 `ORDER_NOT_FOUND`, identical |
| Authenticated own-tenant calls | unchanged | unchanged |
| Permission denied | 403 | 403 |
| Validation | 400 | 400 |

## Acceptance criteria

1. Every order route named in S2 returns `401` with the shared body for an
   unauthenticated request, and writes the anonymous audit event as before.
2. `PATCH /orders/{id}/modify` returns the same `404 ORDER_NOT_FOUND` body for a
   foreign and a missing id, with no order data, and does not mutate anything.
3. Authenticated happy paths, permission denials, validation errors and business
   rules are unchanged.
4. The shared helper is the only auth/refusal mapping used in the order routes
   (no newly copy-pasted checks), and it imports no Prisma/RBAC/domain module.
5. The table/staff/restaurant audit table is produced with a follow-up
   (`AME-024`); those routes are untouched.
6. The harness gains exact `401` and `modify` equality assertions; all previous
   assertions remain exact.
7. Full tests, type-check, build and owned lint pass; both CI jobs pass.
8. No change to RBAC, auth helpers, contract, schema, migration, dependencies or
   the routes listed in the non-goals.
9. No deploy, seed, production data or `../Tabtep-App` edit.

## Verification commands

```text
git status --porcelain --untracked-files=all
npx jest src/tests/api-refusals.test.ts src/tests/order-anonymous-auth.test.ts src/tests/order-modify-refusal-shape.test.ts --runInBand
npx jest src/tests/order-get-route.test.ts src/tests/order-status-refusal-shape.test.ts --runInBand
npm test -- --runInBand
npm run type-check
npm run build
INTEGRATION_DATABASE_URL=... npm run test:integration
```

Build needs the usual non-secret placeholders in the shell only. Never write
`.env*`, never print `DATABASE_URL` or tokens. Do not claim a command passed
unless it was run.

## Review focus

- Anonymous order requests get `401` before any lookup, on every named route.
- `modify` refusals are byte-identical to missing orders, no data, no mutation.
- No auth/RBAC/contract change; the helper is response-only.
- The table/restaurant audit is evidence, not a silent fix.
- Test/harness assertions are exact and cannot pass with the old 500.
- No route outside the owned list changed.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A route's catch is restructured and loses an existing branch | Silent behaviour change | Keep existing branches; test permission/validation paths |
| Shared helper drifts into domain logic | Coupling | Import restriction in D1 |
| Audit becomes a de-facto fix | Scope creep | S3 explicitly read-only; `AME-024` |
| `modify` mapping hides genuine failures | Lost diagnostics | Map only RBAC 403/404 from `requireOrderAccess`; keep 500 logging |
| Harness assertion duplicated/inconsistent | Weak guard | One assertion per behaviour, exact bodies |

## Approval

**Approval applies to this exact revision only.** A material change requires a new
revision and new approval. Approval includes the R2 allowance to add
`src/lib/api/refusals.ts` and edit the six order routes; it is not deploy, push to
`main`, or production-database permission.

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
fix(orders): return 401 for anonymous order requests and 404 for modify refusals

- add a shared response-only refusal helper
- answer unauthenticated order routes with 401 instead of 500
- normalise modify refusals to the order-not-found contract
- audit the table and restaurant access call sites for a follow-up
- extend the route tests and the isolation harness
```

**Exact path list (25 files, base `6bca423`):**

```text
docs/ai/ACTIVE.md
docs/ai/BACKLOG.md
src/lib/api/refusals.ts
src/app/api/orders/[id]/route.ts
src/app/api/orders/[id]/status/route.ts
src/app/api/orders/[id]/modify/route.ts
src/app/api/orders/[id]/ready/route.ts
src/app/api/orders/[id]/recall/route.ts
src/tests/api-refusals.test.ts
src/tests/order-anonymous-auth.test.ts
src/tests/order-modify-refusal-shape.test.ts
src/tests/integration/tenant-isolation.it.ts
docs/ai/runs/QR-EAT-AME-023-ORDER-REFUSALS/TASK.md
docs/ai/runs/QR-EAT-AME-023-ORDER-REFUSALS/RUN_LOG.md
docs/ai/runs/QR-EAT-AME-023-ORDER-REFUSALS/NEXT.md
docs/ai/runs/QR-EAT-AME-023-ORDER-REFUSALS/REVIEW-01.md
docs/ai/runs/QR-EAT-AME-023-ORDER-REFUSALS/evidence/before-after.md
docs/ai/runs/QR-EAT-AME-023-ORDER-REFUSALS/evidence/s3-resource-refusal-audit.md
docs/ai/runs/QR-EAT-AME-023-ORDER-REFUSALS/evidence/focused-tests.txt
docs/ai/runs/QR-EAT-AME-023-ORDER-REFUSALS/evidence/regression-tests.txt
docs/ai/runs/QR-EAT-AME-023-ORDER-REFUSALS/evidence/full-suite.txt
docs/ai/runs/QR-EAT-AME-023-ORDER-REFUSALS/evidence/type-check.txt
docs/ai/runs/QR-EAT-AME-023-ORDER-REFUSALS/evidence/build.txt
docs/ai/runs/QR-EAT-AME-023-ORDER-REFUSALS/evidence/integration-run1.txt
docs/ai/runs/QR-EAT-AME-023-ORDER-REFUSALS/evidence/integration-run2.txt
```

`ACTIVE.md`/`BACKLOG.md` are Lead bookkeeping (navigation and the refined
`AME-024` scope). No RBAC, auth helper, contract, schema, migration, dependency or
`.env` change.

**Commit authorized by:** Atiff
**Authorization date:** 2026-11-21
**Authorization scope:** one local commit with the exact path list and message
above, plus pushing `fix/ame-023-order-refusals` to run both CI jobs. Merge is not
authorized until both are green.

## Residual risks and follow-ups

- `AME-024`: table and restaurant refusal-shape normalisation, informed by the S3
  audit.
- `AME-022`: platform-admin business-data mutation policy.
- `AME-021`: RLS defense-in-depth.
- Other anonymous `500`s exist outside the order surface (for example some admin
  and settings routes); this task deliberately limits itself to orders.
- Handler-level tests do not exercise middleware.

## Return format

```text
Summary:
Files changed:
Commands run and results (incl. before/after and audit table):
Deviations:
Blockers:
Residual risks:
Recommended next action:
```
