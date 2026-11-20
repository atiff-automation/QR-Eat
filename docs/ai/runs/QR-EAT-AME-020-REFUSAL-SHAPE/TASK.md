# Task — QR-EAT-AME-020-REFUSAL-SHAPE

**Status:** ready_to_commit
**Revision:** 2
**Approved revision:** 2 (revision 1 code plus the status-route addition)
**Approved by:** Atiff
**Approval date:** 2026-11-20
**Approval basis:** “Fix status route now (rev 2, recommended)” — refusal
normalisation plus a harness assertion for `PATCH /orders/[id]/status`; platform
admin mutation behaviour stays unchanged and is tracked separately
**Approval hash:** revision 1
`sha256:0f4e5f7ac4259bed1057763057b71714a4f352f254c5271d8b3997969317f293`;
revision 2
`sha256:2128bf4817de1f7ff55a6d1c996de7ad0a009751495870aea1855cf9071b5c97`
(content written from the owner's explicit decision; no separate re-approval
round for the wording)
**Next actor:** human (commit authorization; CI unproven)
**Implementer session:** `ses_e0806981affeDuIAa2YjgJMuAY` (rev 1 + rev 2)
**Verifier session:** REVIEW-01 (rev 1); REVIEW-02 (rev 2, session recorded by
the Lead)
**Diff base:** `main` `195a96d4b268312d38852c7fcfc6c1eb22c30cde`
**Diff hash:** REVIEW-02 tracked
`sha256:ffbc349f29055d02a1f347c4f657b5cf5e129c6fc8d4cd84db601da87140b7d9`;
untracked manifest (pre-REVIEW-02)
`sha256:edfee850697abd7873b7e1e685b0874ade980b480163f0d93ac215669bd2645f`
**Review file:** `REVIEW-01.md` (rev 1); `REVIEW-02.md` — PASS WITH NOTES, F-1
closed, 16-route sweep clean
**Implementer:** ame-implementer
**Implementer session:**
**Verifier session:**
**Diff base:**
**Diff hash:**
**Review file:**
**Risk:** **R2** — authentication and tenant boundary; response-shape change on an
order route
**Complexity:** L2
**Workflow:** BUG (information leak found by the AME-013 harness)
**Branch:** `fix/ame-020-refusal-shape` (create from `main` `195a96d`; do not push
until the CI gate)
**Source item:** `docs/ai/BACKLOG.md` → `AME-020`
**Found by:** `docs/ai/runs/QR-EAT-AME-013-TENANT-HARNESS/REVIEW-02.md`
**Updated:** 2026-11-20

**Implementation status:** implemented on `fix/ame-020-refusal-shape`
(uncommitted). Revision 1 reviewed (`REVIEW-01.md`, PASS WITH NOTES); revision 2
implements the status-route normalisation F-1 required and awaits `REVIEW-02`.

## Revision history

| Rev | Date | Change | Basis |
|---|---|---|---|
| 1 | 2026-11-20 | Initial approved contract (D1–D7) | Owner approval |
| 2 | 2026-11-20 | Adds `orders/[id]/status` refusal normalisation (D8, S2b, AC11) after REVIEW-01 F-1. Admin mutation behaviour unchanged. | Owner decision “Fix status route now (rev 2)” |

## Objective

Stop `GET /api/orders/{id}` from revealing whether an order exists in another
tenant, and stop the anonymous staff event stream from answering `500`. A
cross-tenant order must be indistinguishable from a missing one, and an
unauthenticated stream request must be a clean `401`.

## Verified facts that shape the plan

Evidence read on 2026-11-20 at `main` `195a96d`.

1. **The leak.** `GET /api/orders/{id}` calls `requireOrderAccess`
   (`src/app/api/orders/[id]/route.ts:28`), which throws `403 FORBIDDEN` for
   another tenant's order and `404 NOT_FOUND` for a missing one
   (`src/lib/rbac/resource-auth.ts:41-55`). The route's catch returns the thrown
   status verbatim (`:210-217`), so a staff user can distinguish "exists
   elsewhere" from "does not exist".
2. **PATCH has the same leak.** The same file calls `requireOrderAccess` at
   `:241` and maps `RBACError` to its status at `:311-318`.
3. **The correct pattern already exists.** `POST /api/orders/{id}/items` wraps
   `requireOrderAccess` and maps `403` and `404` to a single
   `404 { code: 'ORDER_NOT_FOUND' }` (`src/app/api/orders/[id]/items/route.ts:34-48`),
   with tests asserting it (`src/tests/order-add-items-route.test.ts:142`). The
   cancel path does the same (`src/tests/order-cancel-route.test.ts:198`). The
   read and status routes were simply missed.
4. **No client breakage.** The Android Counter treats `403` and `404` identically
   on station calls (`Tabtep-App/app/src/main/java/app/tabtep/core/StationService.kt:602`),
   and the API contract does not document a distinct cross-tenant `403` for order
   reads. The change is a refusal-shape normalisation, not a contract change.
5. **Anonymous SSE answers 500.** `requireAuth` throws a plain
   `Error('Authentication required')` after writing an audit event
   (`src/lib/tenant-context.ts:445-459`); the SSE route's single catch returns
   `500` (`src/app/api/events/orders/route.ts:158-166`). Other routes already map
   that message to `401` by string check (for example the orders list route).
6. **The harness that found this is now in CI.** `AME-013` exercises the read
   route and the anonymous stream on every push
   (`src/tests/integration/tenant-isolation.it.ts`), and currently accepts
   `[403, 404]` for the cross-tenant read. After the fix it must assert `404`
   exactly.

## Binding decisions

| # | Decision | Consequence |
|---|---|---|
| D1 | Cross-tenant and missing orders are indistinguishable | Both return `404` with the same body: `{ success: false, error: 'Order not found', code: 'ORDER_NOT_FOUND' }`, matching the add-items/cancel pattern. |
| D2 | The shared helper keeps its semantics | `requireOrderAccess` still throws `403`/`404` internally; the HTTP boundary normalises. This keeps the RVBAC layer expressive and the wire contract uniform. Do not change `requireOrderAccess` itself. |
| D3 | Apply to every order route that currently returns the raw status | At minimum `GET` and `PATCH` on `/api/orders/{id}`. Audit the other `requireOrderAccess` call sites (`items`, `modify`, `pos/payment`, `counter/.../ticket`, print-ticket fetch/ack): any that return a raw `403` for a cross-tenant order must use the same `404` shape, or the leak remains. Report the audit result. |
| D4 | Platform admins also get the not-found shape on these routes | An admin probing business data must not learn existence. `BUSINESS_DATA_FORBIDDEN` remains for routes that already use it outside the order-access path; note any inconsistency rather than broadening this task. |
| D5 | Anonymous SSE is `401`, other setup failures stay `500` | Map the `Authentication required` failure to `401 { error, code: 'AUTHENTICATION_REQUIRED' }` and keep a genuine setup failure at `500`. Preserve the existing anonymous audit event. |
| D6 | The harness tightens, not weakens | `tenant-isolation.it.ts` asserts exactly `404` for cross-tenant and missing reads with identical bodies, and `401` for the anonymous stream, keeping the own-tenant positive control. |
| D7 | No response-shape change on success or on permission denial | Own-tenant reads and writes are unchanged; a staff user lacking `orders:read`/`orders:write` still gets `403` from `requirePermission` before resource access. |
| D8 | The status route is in scope (rev 2) | `PATCH /orders/[id]/status` scopes manually and returns `403` for a foreign order vs `404` for a missing one. Non-admin callers whose current restaurant differs from the order's restaurant get the same `404 ORDER_NOT_FOUND`; missing orders already match. Platform-admin mutation behaviour on this route is **unchanged** and is tracked separately (it is a policy question, not a refusal-shape fix). |

## Scope

### S0 — Baseline and guardrails

- Create `fix/ame-020-refusal-shape` from `main` `195a96d`; confirm a clean tree.
- Record the real baseline: full tests, type-check, build (ephemeral
  placeholders), both owned-file lint, and the integration suite against a
  disposable database.
- Reproduce the leak before changing anything: cross-tenant GET → `403`,
  missing → `404`, anonymous stream → `500`. Record it.

### S1 — Normalise the order read and status routes

- In `src/app/api/orders/[id]/route.ts`, wrap `requireOrderAccess` for `GET` and
  `PATCH` with the same mapping the items route uses: `403` and `404` become
  `404 ORDER_NOT_FOUND` with no order data.
- Reuse one small local helper rather than duplicating the block; do not change
  `requireOrderAccess`.
- Keep every other error path as it is: `requirePermission` denial stays `403`,
  validation stays `400`, unexpected failures stay `500`.

### S2 — Audit the remaining order-access call sites

- Inspect `items`, `modify`, `pos/payment/[orderId]`,
  `counter/orders/[orderId]/ticket`, the print-ticket fetch/ack routes and any
  other `requireOrderAccess` caller.
- For each: does a cross-tenant id produce a client-visible status that differs
  from a missing id? If yes, normalise it in this task and list it. If already
  normalised, record it as verified.
- If a route's contract deliberately distinguishes the two (documented), stop
  and report instead of changing it.

### S2b — Status route (rev 2)

- In `src/app/api/orders/[id]/status/route.ts`, after the missing-order check,
  return the `404 ORDER_NOT_FOUND` body for any non-admin caller whose current
  restaurant differs from the order's restaurant. Keep the platform-admin path
  exactly as it is.
- Do not change the transition/authority logic, the cashier counter-serve rule or
  the `USE_CANCEL_ENDPOINT` 409.
- Extend the refusal-shape test to cover this route: cross-tenant `404` identical
  to missing, missing `404`, own-tenant permitted call still succeeds, admin path
  not turned into `404`.

### S3 — Anonymous SSE is 401

- In `src/app/api/events/orders/route.ts`, map the `Authentication required`
  failure to `401` with a code, following the existing string-check pattern used
  elsewhere; keep other setup errors at `500`.
- Keep the anonymous audit event and the existing response headers unchanged for
  authenticated requests.

### S4 — Tests

- Route tests for `GET` and `PATCH`: own `200`; cross-tenant `404` with
  `ORDER_NOT_FOUND`; missing `404` with the identical body; staff without the
  permission still `403`; admin gets the not-found shape.
- SSE route test: anonymous `401`; a genuine setup failure still `500`.
- Harness: tighten the order-read assertions to exact `404` + identical body and
  add the anonymous `401` assertion.
- Any existing test that asserted `403` for these paths must be updated and the
  change explained in the run log.

## Non-goals

- Changing `requireOrderAccess`, RBAC semantics, identity or session handling.
- Broadening `BUSINESS_DATA_FORBIDDEN` policy across the API.
- Changing order payloads, success responses, events, tickets or the contract.
- `AME-021` (RLS defense-in-depth), `AME-017`.
- Deploy, migration, seed, production configuration.
- Any `../Tabtep-App` edit.

## Ownership

**Files/modules owned (implementer):**

```text
src/app/api/orders/[id]/route.ts
src/app/api/orders/[id]/status/route.ts           (rev 2)
src/app/api/orders/[id]/items/route.ts            (only if audit proves a gap)
src/app/api/orders/[id]/modify/route.ts           (only if audit proves a gap)
src/app/api/pos/payment/[orderId]/route.ts        (only if audit proves a gap)
src/app/api/counter/orders/[orderId]/ticket/route.ts  (only if audit proves a gap)
src/app/api/events/orders/route.ts
src/tests/order-get-route.test.ts                 (new or existing read-route test)
src/tests/events-orders-auth.test.ts               (new)
src/tests/integration/tenant-isolation.it.ts       (tighten assertions)
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/RUN_LOG.md
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/evidence/**
```

**Do not touch:**

```text
src/lib/rbac/resource-auth.ts
src/lib/tenant-context.ts
src/lib/rbac/**  (permissions, sessions, jwt)
prisma/**
docs/PRODUCT/**   (unless a documented 403 must be corrected — stop and ask first)
src/lib/postgres-pubsub.ts
TASK.md / NEXT.md (Lead-owned)
.env* / any secret
```

## Context budget

**Must read:**

- `AGENTS.md`, `docs/ai/PROJECT_PROFILE.md`, this `TASK.md`
- `src/app/api/orders/[id]/route.ts`, `src/app/api/orders/[id]/items/route.ts`
  (the mapping pattern), `src/lib/rbac/resource-auth.ts` (read-only)
- `src/app/api/events/orders/route.ts`, `src/lib/tenant-context.ts` (`requireAuth`)
- `src/tests/integration/tenant-isolation.it.ts` (the order-read and
  anonymous-stream tests)
- `src/tests/order-add-items-route.test.ts` (mapping test pattern)

**Read only if unclear:**

- `docs/PRODUCT/API-CONTRACT.md` (error tables)
- `docs/PRODUCT/COUNTER-FEED-CONTRACT.md` §errors
- the other `requireOrderAccess` call sites during the S2 audit

**Do not read by default:**

- the whole repository or the whole `docs/ai/` tree
- `../Tabtep-App` beyond the read-only client check already recorded
- `.env`, `.env.local`, `.railway-env-*.txt`
- generated build output

If a required document contradicts this task, stop and report it.

## Test plan

Covered by S4. Behaviour matrix:

| Case | Before | After |
|---|---|---|
| Own order `GET` | 200 | 200 (unchanged) |
| Cross-tenant `GET` | 403 `FORBIDDEN` | 404 `ORDER_NOT_FOUND` |
| Missing order `GET` | 404 `NOT_FOUND` | 404 `ORDER_NOT_FOUND`, identical body |
| Cross-tenant `PATCH` | 403 | 404 `ORDER_NOT_FOUND` |
| Staff without `orders:read` | 403 | 403 (unchanged) |
| Platform admin `GET` | 403 | 404 `ORDER_NOT_FOUND` |
| Anonymous SSE | 500 | 401 `AUTHENTICATION_REQUIRED` |
| SSE setup failure | 500 | 500 (unchanged) |

## Acceptance criteria

1. A cross-tenant `GET /api/orders/{id}` and a missing id return the same status,
   code and body, with no order data or other-tenant identifiers.
2. `PATCH /api/orders/{id}` behaves the same way.
3. Every other `requireOrderAccess` caller is audited and either normalised or
   recorded as already safe, with evidence.
4. Anonymous `GET /api/events/orders` returns `401` with a code; genuine setup
   failures still return `500`.
5. Authenticated happy paths, permission denials and validation errors are
   unchanged.
6. The AME-013 harness asserts exact `404`/identical body and the anonymous `401`,
   with the positive control intact.
7. Existing tests are updated rather than deleted; no assertion is weakened
   without an explanation in the run log.
8. Full tests, type-check, build and both CI jobs pass; owned files add no lint
   findings.
9. No change to `requireOrderAccess`, RBAC semantics, contract, schema,
   migration, auth helpers or dependencies.
10. No deploy, seed, production data or `../Tabtep-App` edit.
11. (rev 2) `PATCH /api/orders/{id}/status` returns the same `404 ORDER_NOT_FOUND`
    for a cross-tenant and a missing order, keeps own-tenant transitions working,
    and leaves platform-admin behaviour unchanged; the harness covers it.

## Verification commands

```text
git status --porcelain --untracked-files=all
npx jest src/tests/order-get-route.test.ts src/tests/events-orders-auth.test.ts --runInBand
npx jest src/tests/order-add-items-route.test.ts src/tests/order-cancel-route.test.ts --runInBand
npm test -- --runInBand
npm run type-check
npm run build
# disposable database:
INTEGRATION_DATABASE_URL=... npm run test:integration
# after pushing the branch only:
gh run watch <run-id> --exit-status
```

The build needs the usual non-secret placeholders in the shell only. Never write
`.env*`, never print `DATABASE_URL` or tokens. Do not claim a command passed
unless it was run.

## Review focus

- The two refusal paths are byte-identical, so nothing distinguishes existence.
- No other order route still returns the raw `403` for a foreign id.
- `requirePermission` denial is still `403`; the change did not swallow it.
- Success responses are unchanged.
- SSE `401` preserves the anonymous audit event and keeps real failures at `500`.
- The harness got stricter, not weaker.
- No auth helper, RBAC or contract change.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Broad catch maps permission denial to 404 | Hides real authorization errors from operators | Map only the `requireOrderAccess` call, not the whole handler; test the 403 path |
| A route's contract distinguishes 403/404 | Client behaviour change | S2 audit; stop and report if documented |
| Admin policy becomes inconsistent | Confusing responses | Record the inconsistency rather than broad-brushing the API |
| String match for auth failure is brittle | Wrong status after refactor | Follow the existing pattern, add a test; note it |
| Harness assertion too loose after change | Leak could return unnoticed | Assert exact status and identical body |

## Approval

**Approval applies to this exact revision only.** A material change requires a new
revision and new approval. Approval includes the R2 allowance to edit the order
routes and the SSE route listed above; it is not deploy, push to `main`, or
production-database permission.

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
fix(orders): make cross-tenant and missing orders indistinguishable

- return 404 ORDER_NOT_FOUND for foreign and missing order reads/writes
- audit every requireOrderAccess caller and normalise the status route
- answer anonymous staff event streams with 401 instead of 500
- tighten the isolation harness to exact 404/401 assertions
```

**Exact path list (38 files, base `195a96d`):**

```text
docs/ai/ACTIVE.md
docs/ai/BACKLOG.md
docs/ai/runs/QR-EAT-AME-007-TENANT-VERIFY/VERIFICATION.md
src/app/api/orders/[id]/route.ts
src/app/api/orders/[id]/status/route.ts
src/app/api/events/orders/route.ts
src/app/api/counter/orders/[orderId]/ticket/route.ts
src/app/api/counter/orders/[orderId]/pay/route.ts
src/app/api/counter/orders/[orderId]/send/route.ts
src/app/api/pos/payment/[orderId]/route.ts
src/tests/order-get-route.test.ts
src/tests/order-status-refusal-shape.test.ts
src/tests/events-orders-auth.test.ts
src/tests/counter-order-refusal-shape.test.ts
src/tests/integration/tenant-isolation.it.ts
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/TASK.md
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/RUN_LOG.md
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/NEXT.md
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/REVIEW-01.md
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/REVIEW-02.md
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/evidence/baseline.md
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/evidence/repro-before-after.md
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/evidence/s2-audit.md
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/evidence/status-route-before-after.md
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/evidence/focused-route-tests.txt
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/evidence/full-suite.txt
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/evidence/type-check.txt
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/evidence/build.txt
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/evidence/owned-lint.txt
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/evidence/integration.txt
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/evidence/rev2-focused-tests.txt
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/evidence/rev2-full-suite.txt
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/evidence/rev2-type-check.txt
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/evidence/build-rev2.txt
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/evidence/rev2-owned-lint.txt
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/evidence/rev2-prettier.txt
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/evidence/integration-rev2-run1.txt
docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/evidence/integration-rev2-run2.txt
```

`ACTIVE.md`, `BACKLOG.md` and the AME-007 verification record are Lead
bookkeeping: navigation, the AME-020/AME-007 status, and the AME-021 deferred row.
No `src/lib/**`, auth helper, RBAC, contract, schema, migration, seed, dependency
or `.env` change.

**Commit authorized by:** Atiff
**Authorization date:** 2026-11-20
**Authorization scope:** one local commit with the exact path list and message
above, plus pushing `fix/ame-020-refusal-shape` to run both CI jobs. Merge is not
authorized until both are green.

**Post-commit state:** commit `e1e2da6`; CI run `44748587813` **success**
(verify 2m43s, integration 18 assertions); merge `8487f08`; Railway deployment
`8f775ad3-a60c-488e-875d-6c6a4a5d8e11` `SUCCESS`; health UP, SSE 401, no
migration. Smoke found a pre-existing anonymous-500 on the order read route,
recorded as `AME-023`.

## Residual risks and follow-ups

- `AME-021` (RLS defense-in-depth) remains deferred.
- Handler-level harness tests still do not exercise middleware; B3-S remains the
  end-to-end reference.
- Other resource helpers (`requireTableAccess`, staff, payment) may have the same
  refusal-shape pattern; this task covers order routes only. Audit them in
  `AME-021` or a follow-up if the pattern is found there.
- The SSE auth mapping uses the existing message check; a typed error would be
  cleaner but is a wider auth change.

## Return format

```text
Summary:
Files changed:
Commands run and results (incl. before/after leak reproduction and CI run):
Deviations:
Blockers:
Residual risks:
Recommended next action:
```
