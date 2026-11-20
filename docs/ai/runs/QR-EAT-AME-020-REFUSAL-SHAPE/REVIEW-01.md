# Review 01 — QR-EAT-AME-020-REFUSAL-SHAPE

**Reviewer:** fresh `ame-verifier`, independent of the implementer, read-only
**Date:** 2026-11-20
**Spec:** `TASK.md` revision 1 (D1–D7, S0–S4, AC1–AC10)
**Verdict:** **PASS WITH NOTES**
**Risk:** R2

## Diff binding

| Item | Value |
|---|---|
| Base | `main` `195a96d4b268312d38852c7fcfc6c1eb22c30cde` |
| Tracked diff | `sha256:6bf7fa6266770061c3d7d1071cd9f9eb388a0e312be017ea92b57cab17a29c3c` |
| Task untracked aggregate (15 files) | `sha256:b4262c47215840d6600b9b8968c81a8d114c9af7fa228e7767a041cd2bca4611` |
| AME-007 verification doc | `a3b9aa2c…`, untouched, excluded from the aggregate |

## Delivered change — verified

- `GET`/`PATCH /api/orders/{id}`: cross-tenant, missing and platform-admin
  refusals are byte-identical `404 {success:false, error:'Order not found',
  code:'ORDER_NOT_FOUND'}`, own `200`, and PATCH does not mutate the other
  tenant's order.
- Independent audit of all ten `requireOrderAccess` callers: **none remains
  leaky**. The four extras (`counter/.../ticket`, `.../pay`, `.../send`,
  `pos/payment`) are normalised; `modify` returns the same generic `500` for both.
- Anonymous SSE `401` with a code, the anonymous audit row is still written, and
  genuine setup failures remain `500`.
- Harness tightened to exact `404` with body equality and exact `401`; mutation
  proof shows it fails if the leak returns or the SSE status regresses.
- Independent runs: focused 22/22 and 65/65, full suite **1700 passed / 11
  skipped**, type-check, build, integration **17/17 twice**.
- Deliberate, correct change: `PATCH` permission denial `500 → 403`. No existing
  test or documented client depended on the old value.

## Findings

| ID | Severity | Location | Issue | Disposition |
|---|---|---|---|---|
| F-1 | **medium** | `src/app/api/orders/[id]/status/route.ts:91-92, 172-179` | **Same class of leak on another order route.** `PATCH /orders/{id}/status` returns `404` for a missing id but `403` for a foreign id; it scopes manually instead of using `requireOrderAccess`, so the S2 audit legitimately missed it. Reproduced on a real handler: cross `403`, missing `404`, own `200`. The same route also lets `context.isAdmin` set `canUpdateOrder = true`, so a platform admin can mutate tenant order status. | **Owner decision required** (below). The delivered diff is correct; merging it does not close this separate route. |
| F-2 | low | `src/tests/counter-order-refusal-shape.test.ts`; `ACTIVE.md`; `BACKLOG.md` | The added counter test, plus stale navigation (`ACTIVE` says the branch is not created; `BACKLOG` says `planning`) sit outside the stated path list. | **Lead reconciles** the path list and status before the commit gate. |
| F-3 | note | `docs/PRODUCT/API-CONTRACT.md:415` | A stale register row (P7-8) still claims counter **bill** routes return 403; those routes already collapse to 404. Pre-existing docs defect, not a contradiction of this change. | Recorded; no edit in this task. |

No high or critical finding in the delivered diff.

## Acceptance criteria

| AC | Result |
|---|---|
| 1 GET identical refusals | met |
| 2 PATCH identical, no mutation | met |
| 3 audit of every caller | met as written (10/10); F-1 is a non-caller route |
| 4 anonymous SSE 401 + audit preserved | met |
| 5 happy/permission/validation unchanged | met with disclosed PATCH `500→403` |
| 6 harness stricter | met, mutation-proven |
| 7 tests tightened, not weakened | met |
| 8 tests/type-check/build/lint | met locally; CI not run |
| 9 no helper/RBAC/contract/schema change | met |
| 10 no deploy/seed/Tabtep edit | met in this tree |

## Not verified

- CI (`verify` + `integration`) — branch not pushed.
- Real platform-admin token path (reasoned, unit-mocked).
- Real POS-payment and printing routes at runtime.
- Header byte equality (bodies/status compared; same constructor used).
- Android client behaviour.

## Residual risk

- **F-1** — status route leak plus admin status mutation (pre-existing).
- Other resource helpers (`requireTableAccess`, `requireRestaurantAccess`) may
  share the refusal-shape pattern; deferred.
- SSE auth mapping still uses a message string.
- Handler-level tests do not exercise middleware.

## Routing

**PASS WITH NOTES.** The delivered diff is correct and independently verified.
F-1 needs an owner decision: fix the status route now under a revision 2 (one
more implement/verify cycle, no deploy in between), or accept this diff and open
a follow-up task. F-2 is reconciled by the Lead before the commit gate.
