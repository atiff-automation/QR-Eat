# Run Log — QR-EAT-AME-020-REFUSAL-SHAPE

**Title:** Make cross-tenant and missing orders indistinguishable; anonymous SSE 401
**Type:** bug (information leak)
**Risk:** R2
**Spec level:** L2
**Owner:** Atiff
**Date:** 2026-11-20
**Branch/commit:** not created; base `main` `195a96d`
**Task revision:** 1
**Approved revision:** 1 (2026-11-20, Atiff; revision 1 as presented)
**Task contract:** `TASK.md`
**Resume bookmark:** `NEXT.md`
**Latest review:** —

## Request

Fix the two refusal-shape defects found by the AME-013 harness: a cross-tenant
order read is distinguishable from a missing order, and the anonymous staff event
stream answers 500 instead of 401. Plan first, stop for approval.

## Classification

- Type: BUG. Information disclosure at the tenant boundary; found by a real
  two-tenant test, not by inspection.
- Risk R2: authentication and tenant boundary; response shape changes on an order
  route.
- Level L2: two route files (plus any audited caller), two test files, the
  integration assertions, and docs. No schema or contract change.

## Scope

In scope:

- normalise cross-tenant/missing order reads and writes to `404 ORDER_NOT_FOUND`;
- audit every `requireOrderAccess` caller;
- anonymous SSE `401`;
- tighten the AME-013 harness;
- route tests for both behaviours.

Non-goals:

- `requireOrderAccess`, RBAC, session or auth semantics;
- broad `BUSINESS_DATA_FORBIDDEN` policy;
- order payloads, events, tickets, contract;
- `AME-021`, `AME-017`;
- deploy, seed, production data, `../Tabtep-App`.

## Context

**Context budget used:**

- Must read: the order route, the items route mapping, `resource-auth.ts`,
  the SSE route, `requireAuth`, the harness tests, the add-items route test.
- Read only if unclear: API contract error tables, other call sites.
- Not read: the wider repository, `.env*`, generated output.

## Investigation / specification

Confirmed at `main` `195a96d`:

1. `requireOrderAccess` throws `403` for another tenant's order and `404` for a
   missing one (`resource-auth.ts:41-55`). The GET and PATCH handlers return the
   thrown status verbatim (`orders/[id]/route.ts:210-217`, `311-318`).
2. The correct normalisation already exists on `POST /orders/[id]/items`
   (`items/route.ts:34-48`) and is tested
   (`order-add-items-route.test.ts:142`). Cancel does the same
   (`order-cancel-route.test.ts:198`). The read and status routes were missed.
3. The Android client treats `403` and `404` identically on station calls
   (`StationService.kt:602`), so normalising does not change client behaviour.
4. The API contract does not document a distinct cross-tenant `403` for order
   reads.
5. Anonymous SSE: `requireAuth` throws `Error('Authentication required')`
   (`tenant-context.ts:445-459`); the SSE catch returns `500`
   (`events/orders/route.ts:158-166`).
6. The AME-013 harness currently accepts `[403, 404]` for the cross-tenant read
   and asserts "no event stream" for anonymous; both assertions tighten after the
   fix.

Planning note: this task is a direct output of AME-013, which is now deployed and
runs in CI on every push.

## Plan

1. Add one local mapping helper in the order route file; use it for GET and PATCH.
2. Audit every `requireOrderAccess` caller; normalise any remaining raw 403;
   record the already-safe ones.
3. Map the SSE auth failure to 401, keep other failures at 500.
4. Route tests for GET/PATCH and the SSE; tighten the harness to exact
   status/body.
5. Reproduce the leak before, prove it gone after, both CI jobs green.

## Approvals

| Gate | What was approved | Approved by | Date | Conditions |
|---|---|---|---|---|
| Design/plan | Revision 1 as presented: D1–D7, order routes only | Atiff | 2026-11-20 | Approval hash `0f4e5f7a…` (pre-stamp content) |
| Build | Bounded implementation by one `ame-implementer` | Atiff | 2026-11-20 | Covered by the revision-1 approval |
| Design/plan (rev 2) | Add `orders/[id]/status` refusal normalisation + harness; admin mutation unchanged | Atiff | 2026-11-20 | Content hash `2128bf48…`, written from the owner's explicit decision |
| Commit | — | — | — | Not requested; R2 review + commit gate |
| Release | — | — | — | Out of scope; merge decided after CI green |

## Commit gate

- [x] Review PASS (REVIEW-02, PASS WITH NOTES; F-1 closed)
- [x] Exact path list published (`TASK.md` commit gate, 38 files)
- [x] Exact commit message published
- [x] Human approved (Atiff, 2026-11-20; commit + branch push for CI)
- [x] No unrelated changes (ACTIVE/BACKLOG/AME-007 record are Lead bookkeeping,
  recorded per REVIEW-02 R-01)

## Execution

Files changed:

- `docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/TASK.md` (new)
- `docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/RUN_LOG.md` (new)
- `docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/NEXT.md` (new)

Commands run:

```text
sed -n '20,60p' / '195,230p' src/app/api/orders/[id]/route.ts
sed -n '25,60p' src/app/api/orders/[id]/items/route.ts
sed -n '1,60p' / '55,90p' src/lib/rbac/resource-auth.ts
sed -n '39,75p' / '150,170p' src/app/api/events/orders/route.ts
grep -rn requireOrderAccess src
grep -rn 403 Tabtep-App/app/src/main/java
```

## Verification

Verdict: not started (planning)

Findings:

- Root cause and the existing correct pattern confirmed by code reading.

Not verified:

- Before/after behaviour at runtime (belongs to the implementation task).

## Residual risk

- Other resource helpers may have the same refusal-shape pattern; out of scope.
- Handler-level tests do not exercise middleware.

## Release

- Deployed: no
- Smoke test: n/a
- Rollback: n/a
- Monitoring: n/a

## Lessons

- What worked: the AME-013 harness found a real leak on its first run.
- What to change: apply the refusal-shape mapping through one helper so the next
  order route cannot miss it.
- Follow-ups: `AME-021` RLS deferred; pilot pre-gate after this.

## Implementation evidence

**Date:** 2026-11-20
**Implementer:** ame-implementer
**Branch:** `fix/ame-020-refusal-shape` (base `main` `195a96d`)
**Task revision:** 1 (D1–D7, S0–S4)

### Files changed

- `src/app/api/orders/[id]/route.ts` — one local `refuseUnlessOrderAccess`
  helper for GET and PATCH; both now return `404 { success:false,
  error:'Order not found', code:'ORDER_NOT_FOUND' }` for a cross-tenant,
  missing or admin-rejected order. `PATCH` also maps a `Permission denied`
  error to `403` (see deviations). The post-check `if (!order)` uses the same
  body.
- `src/app/api/events/orders/route.ts` — maps `Authentication required` to
  `401 { error, code:'AUTHENTICATION_REQUIRED' }`; other setup failures remain
  `500`. The anonymous audit event is written by `requireAuth` before the throw
  and was preserved.
- `src/app/api/counter/orders/[orderId]/ticket/route.ts` — normalises
  `requireOrderAccess` 403/404 to `404 ORDER_NOT_FOUND`.
- `src/app/api/counter/orders/[orderId]/pay/route.ts` — same normalisation
  (audit-proven raw 403; outside the task's file summary, see deviations).
- `src/app/api/counter/orders/[orderId]/send/route.ts` — same normalisation
  (audit-proven raw 403; outside the task's file summary, see deviations).
- `src/app/api/pos/payment/[orderId]/route.ts` — normalises the same call; its
  generic 500 previously leaked the helper message in `details`.
- `src/tests/order-get-route.test.ts` — new GET/PATCH route tests (own 200,
  cross 404, missing 404 with identical body, permission 403, admin 404,
  validation 400, unexpected 500).
- `src/tests/events-orders-auth.test.ts` — new SSE tests (anonymous 401,
  genuine setup failure 500).
- `src/tests/counter-order-refusal-shape.test.ts` — new audit-coverage tests for
  ticket, pay, send and POS-payment refusal shapes.
- `src/tests/integration/tenant-isolation.it.ts` — tightened the order read to
  exact `404` + identical body and the anonymous stream to exact `401` +
  `AUTHENTICATION_REQUIRED`; positive controls unchanged.
- `docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/evidence/**` — new evidence files.

No change to `requireOrderAccess`, `src/lib/rbac/**`, `tenant-context.ts`,
RBAC semantics, schema, migrations, seed, dependencies or `../Tabtep-App`.

### Commands and results

| Command | Result |
|---|---|
| `npm test -- --runInBand` (baseline) | PASS — 1678 passed, 11 skipped |
| `npm run type-check` (baseline) | PASS |
| `npm run build` (baseline, CI placeholders) | PASS |
| owned `eslint` (baseline) | PASS — 0 findings |
| `npm run test:integration` (baseline) | PASS — 17/17 |
| `npx jest src/tests/order-get-route.test.ts src/tests/events-orders-auth.test.ts src/tests/counter-order-refusal-shape.test.ts --runInBand` | PASS — 22/22 |
| `npx jest src/tests/order-add-items-route.test.ts src/tests/order-cancel-route.test.ts src/tests/counter-print-tickets-route.test.ts src/tests/counter-print-ack-route.test.ts --runInBand` | PASS — 65/65 |
| `npm test -- --runInBand` | PASS — 142 of 143 suites (1 skipped), 1700 passed, 11 skipped |
| `npm run type-check` | PASS |
| `npm run build` (CI placeholders) | PASS |
| owned `eslint` | PASS — 0 findings |
| owned `prettier --check` | PASS |
| `INTEGRATION_DATABASE_URL=<disposable loopback> npm run test:integration` | PASS — 17/17, tightened assertions |

Full logs: `evidence/focused-route-tests.txt`, `evidence/full-suite.txt`,
`evidence/type-check.txt`, `evidence/build.txt`, `evidence/owned-lint.txt`,
`evidence/integration.txt`. Before/after behaviour: `evidence/baseline.md` and
`evidence/repro-before-after.md`. Audit: `evidence/s2-audit.md`.

### Existing tests updated

No existing test asserted `403` for the order GET/PATCH read paths; the only
loose assertion was the AME-013 integration harness, which accepted `[403, 404]`
for a cross-tenant read and only required "not 200" for the anonymous stream.
Those assertions were **tightened** (exact `404` + identical body; exact `401` +
body) rather than deleted or weakened. The add-items, cancel and print-ticket
route tests already asserted `404 ORDER_NOT_FOUND` and still pass unchanged.

### Deviations

1. **PATCH permission denial.** The pre-change PATCH catch had no
   `Permission denied` mapping, so a missing `orders:write` returned `500`.
   D7/acceptance 5 and the S4 test plan require `403`; the catch now matches GET
   and returns `403`. This is a small pre-existing bug fix inside the owned
   route, not a broadening of the refusal-shape change.
2. **`counter/orders/{orderId}/pay` and `/send`.** S2/D3 and the Lead
   instruction require normalising every `requireOrderAccess` caller that
   returned a raw 403, but the task's owned-file summary did not name these two
   routes. The audit proved the leak; only their `requireOrderAccess` catch was
   changed. They should be added to the owned-file list when the Lead records
   the final path list.
3. **POS payment `details` leak.** The audit found the POS payment route
   returned the same `500` status but a different `details` string for cross vs
   missing. It was normalised under the "only if audit proves a gap" allowance.

### Residual risks

- The SSE auth mapping still relies on the existing message string; a typed
  error would be cleaner, as noted in the task.
- `PATCH /api/orders/{id}/modify` still returns a generic `500` for both cross
  and missing; it does not leak existence but is inconsistent with the `404`
  contract. Left as a follow-up to keep this task bounded.
- Handler-level tests do not exercise middleware; the B3-S end-to-end reference
  remains the integration proof.

## Revision 2 — status route

**Date:** 2026-11-20
**Trigger:** `REVIEW-01.md` F-1 — `PATCH /api/orders/{id}/status` scoped
manually and returned `403` for a foreign order vs `404` for a missing one.
**Scope:** D8, S2b, AC11. Refusal normalisation only; no shared helper/RBAC
change; platform-admin mutation behaviour intentionally unchanged.

### Change

- `src/app/api/orders/[id]/status/route.ts` — after the missing-order lookup,
  any **non-admin** caller whose current restaurant differs from
  `currentOrder.restaurantId` gets the shared
  `404 { success:false, error:'Order not found', code:'ORDER_NOT_FOUND' }`.
  The missing-order branch uses the same body, so the two refusals are
  byte-identical. The order-specific `SERVED` recall check moved from before
  the lookup to just after the tenant check, so a cross-tenant `SERVED` probe
  cannot read another tenant's recall state; own-tenant recall still returns
  `409 ORDER_RECALLED`. `context.isAdmin` skips the new branch; the transition,
  authority, cashier counter-serve and `USE_CANCEL_ENDPOINT` logic are
  untouched.
- `src/tests/order-status-refusal-shape.test.ts` (new) — own 200, cross 404,
  missing 404 with identical body, cross-tenant `SERVED` does not query recall,
  own-tenant recall still `409 ORDER_RECALLED`, owner mismatch 404, non-admin
  with no restaurant context 404, admin still 200 (not 404), `CANCELLED` still
  `409 USE_CANCEL_ENDPOINT`.
- `src/tests/integration/tenant-isolation.it.ts` — new real-database assertion:
  cross-tenant status update is exactly 404 with the same body as a missing id,
  B's order is unchanged, and A's manager moves A's own order
  `CONFIRMED -> PREPARING` with 200.
- Evidence: `evidence/status-route-before-after.md`,
  `evidence/rev2-focused-tests.txt`, `evidence/rev2-full-suite.txt`,
  `evidence/rev2-type-check.txt`, `evidence/build-rev2.txt`,
  `evidence/rev2-owned-lint.txt`, `evidence/rev2-prettier.txt`,
  `evidence/integration-rev2-run1.txt`, `evidence/integration-rev2-run2.txt`.

### Before/after

Before (revision 1 code): cross `403 {"error":"Access denied"}`, missing
`404 {"error":"Order not found"}`, own `200`, `crossEqualsMissing:false`.

After: cross and missing both exactly
`404 {success:false,error:"Order not found",code:"ORDER_NOT_FOUND"}` with
`crossEqualsMissing:true`; A's own status update `200` to `PREPARING`
(version 2); B's order remained `CONFIRMED` version 1. Full JSON in
`evidence/status-route-before-after.md`.

### Commands and results

| Command | Result |
|---|---|
| `npx jest src/tests/order-get-route.test.ts src/tests/events-orders-auth.test.ts src/tests/counter-order-refusal-shape.test.ts src/tests/order-status-refusal-shape.test.ts --runInBand` | PASS — 31/31 |
| `npm test -- --runInBand` | PASS — 143 of 144 suites (1 skipped), 1709 passed, 11 skipped |
| `npm run type-check` | PASS |
| `npm run build` (CI placeholders) | PASS |
| owned `eslint` (all changed order/SSE/test files) | PASS — 0 findings |
| owned `prettier --check` | PASS |
| `npm run test:integration` on fresh disposable PostgreSQL (run 1) | PASS — 18/18 |
| `npm run test:integration` on the same fresh disposable PostgreSQL (run 2) | PASS — 18/18 |

### Deviations

None for revision 2. The platform-admin status mutation gap flagged alongside
F-1 is deliberately not fixed here (D8): the admin path is unchanged and is a
separate policy question.

### Residual risk

- Platform admins can still mutate tenant order status on this route; that is
  the pre-existing behaviour D8 explicitly leaves unchanged.
- The new branch compares `currentOrder.restaurantId` to the caller's current
  `context.restaurantId`; an owner whose session has no current restaurant now
  gets a 404 on this route, which is the intended fail-closed behaviour.


## Lead check — 2026-11-20

- **Diff scope:** seven route files, the integration suite and three new test
  files, plus evidence. No `src/lib/**`, auth helper, RBAC, schema, migration,
  contract or dependency change. Confirmed by `git status` and `git diff`.
- **Core mapping (D1/D2):** `refuseUnlessOrderAccess` in
  `orders/[id]/route.ts` maps RBAC `403`/`404` to one `404 ORDER_NOT_FOUND` body
  for `GET` and `PATCH`; `requireOrderAccess` is untouched. The post-access
  "order vanished" branch reuses the same body.
- **Audit (D3):** the implementer normalised four additional call sites the
  named list did not enumerate — `counter/.../ticket`, `.../pay`, `.../send` and
  `pos/payment/[orderId]` — because each returned a distinguishable raw `403` (or
  a `500` whose `details` differed). That is inside D3's mandate even though the
  file list named only some of them; recorded as an accepted scope expansion.
- **PATCH permission denial:** previously `500`, now `403` via the same
  message check GET uses. This is a behaviour change beyond refusal-shape
  normalisation, but it aligns PATCH with the contract and with D7; flagged for
  the verifier rather than hidden.
- **SSE (D5):** auth failure maps to `401 AUTHENTICATION_REQUIRED`; the audit
  event still precedes the throw; genuine setup errors stay `500`.
- **Harness (D6):** tightened to exact `404` with `cross.body` equal to
  `missing.body`, and `401` for anonymous — stricter than before, and it now
  asserts body equality rather than status membership.
- **Evidence:** before/after (`403`+`404` → identical `404`; `500` → `401`),
  22 focused tests, full suite 1700 passed / 11 skipped, integration 17/17 on a
  disposable database.
- **Duplication note:** the counter routes repeat a short inline mapping block
  rather than sharing the order-route helper. Acceptable for four call sites; a
  shared helper would touch a non-owned module.
- **Not verified by the Lead:** the CI runs (branch not pushed). Routed to
  `REVIEW-01`.

## Lead check — revision 2 (status route)

- **Scope:** `orders/[id]/status/route.ts`, a new
  `order-status-refusal-shape.test.ts`, the harness assertion, and evidence. No
  shared module, RBAC, schema or contract change.
- **Boundary:** the tenant mismatch returns the shared `404 ORDER_NOT_FOUND`
  body; the missing-order branch reuses it, so the two are byte-identical. The
  check sits after the order lookup and before any order-specific work.
- **Recall ordering:** the implementer moved the `SERVED` recall check behind the
  tenant boundary. That is correct and beyond the literal instruction: a
  cross-tenant `SERVED` probe could otherwise learn recall state through a `409`.
  Own-tenant recall behaviour is covered by the unit test.
- **Admin path:** unchanged by design (D8); the policy question stays separate.
- **Evidence:** before `cross 403 / missing 404 / own 200`; after
  `cross == missing == 404`, own `200` to `PREPARING`, B unchanged. 31 focused
  tests, full suite 1709 passed / 11 skipped, integration **18/18 twice**.
- **Not verified by the Lead:** CI (branch not pushed) and the real admin-token
  path. Routed to `REVIEW-02` on the integrated diff.

