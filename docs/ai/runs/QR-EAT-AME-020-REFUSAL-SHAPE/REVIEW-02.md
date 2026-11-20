# Review 02 — QR-EAT-AME-020-REFUSAL-SHAPE

**Reviewer:** fresh `ame-verifier` (independent of the implementer, read-only)
**Date:** 2026-11-20
**Spec:** `TASK.md` revision 2 (D1–D8, S0–S4 incl. S2b, AC1–AC11)
**Verdict:** **PASS WITH NOTES**
**Risk:** R2

## Diff binding

| Item | Value |
|---|---|
| Base | `main` `195a96d4b268312d38852c7fcfc6c1eb22c30cde` |
| Tracked diff | `sha256:ffbc349f29055d02a1f347c4f657b5cf5e129c6fc8d4cd84db601da87140b7d9` |
| Untracked committable manifest (26 files, AME-007 excluded) | `sha256:edfee850697abd7873b7e1e685b0874ade980b480163f0d93ac215669bd2645f` |
| Combined | `sha256:1b10a0250e1a5572481dc2b147d484d739a30d8b0ddf3c2b6da69a5190c1b571` |

Writing this review changes the untracked manifest; the tracked diff hash is the
stable binding.

## F-1 — closed

Real `PATCH /api/orders/{id}/status` on a disposable PostgreSQL, two tenants with
signed tokens:

| Probe | Result |
|---|---|
| cross-tenant | `404 {success:false, error:'Order not found', code:'ORDER_NOT_FOUND'}` |
| missing | byte-identical body and headers (except `date`/`etag`) |
| B's order after refusal | status/version unchanged; recall row untouched |
| own `CONFIRMED→PREPARING` | `200`, version 1→2 |
| cross-tenant `SERVED` on a recalled foreign order | `404` identical; the recall query never runs, so no recall state leaks |
| own `SERVED` on a recalled ticket | `409 ORDER_RECALLED` (unchanged) |
| invalid status / `CANCELLED` | `400` / `409 USE_CANCEL_ENDPOINT`, both id-invariant |
| non-admin with no current restaurant | `404` identical |
| platform admin | `200` and mutates the foreign order — pre-existing, unchanged by D8 |

Mutation proofs: reverting the tenant `404` to `403` fails 5/9 unit tests and the
harness; moving the recall block back above the boundary reintroduces the `409`
leak and fails the recall test.

## Full order-route sweep (independent)

Sixteen order-id routes plus the shared adjustment helper were read and the
reachable ones probed: `orders/[id]` GET/PATCH/DELETE/void/refund/items/status/
ready/recall/modify, `counter/.../ticket|pay|send|print-tickets|print-ack|bill|
member`, `pos/payment`, `owner/restaurants/[id]/orders/[orderId]`.

**No remaining route distinguishes a foreign id from a missing one.** `modify`
returns an identical generic `500` for both (safe, inconsistent). Receipt lookup
is public by design and not an order-id probe.

## Findings

| ID | Severity | Location | Issue | Disposition |
|---|---|---|---|---|
| R-01 | low | `ACTIVE.md`, `BACKLOG.md` | Lead navigation edits outside the implementer's ownership, and `BACKLOG` also carries the unrelated AME-007/AME-021 rows. | **Lead bookkeeping**, recorded explicitly in the commit gate; they ride with this commit because the AME-007 closure and this task's status are recorded there. |
| R-02 | low | `order-get-route.test.ts:155-170, 253-273` | The unit test named “maps a missing order to the identical 404 body” reuses a 403 rejection for both calls, so its equality assertion is trivially true. Real equality is proven by the harness and the verifier's probes. | Accepted as a test-clarity note. Mutation C shows the mapping itself is guarded. |
| R-03 | low | `orders/[id]/modify/route.ts:46, 433-435` | `modify` returns an identical generic `500` for foreign and missing — no leak, but inconsistent with the `404` contract. | Accepted follow-up; recorded in the residual list. |
| N-01 | note | `orders/[id]/route.ts:351` | `PATCH` permission denial `500 → 403`: disclosed, correct, tested. | Accepted. |
| N-02 | note | `bill`, `print-tickets`, `print-ack` | A malformed id returns `400` before the access check — caller-controlled format, not a tenancy signal. | Accepted. |
| N-03 | note | `status/route.ts:89, 172-173` | Platform admins can still mutate a foreign order's status, and can therefore distinguish existence there. | Deliberate D8 boundary; tracked as a policy question. |
| N-04 | note | `events/orders/route.ts:164-174` | SSE 401 relies on a message-string match; the audit row is written before the throw. | Accepted. |
| N-05 | note | harness | The recall-ordering invariant is unit-only; the harness has no recalled foreign order. The unit test would still catch a regression. | Accepted; candidate harness improvement. |
| N-06 | note | five route files | `ORDER_NOT_FOUND_BODY` is duplicated (shared module not owned). | Accepted; a shared helper is a future refactor. |

No blocker, high or medium finding.

## Independent command results

```text
focused refusal suites            4 suites, 31/31
add-items/cancel/print suites     4 suites, 65/65
full suite                        143 passed / 1 skipped; 1709 passed / 11 skipped
type-check                        exit 0
build (ephemeral placeholders)    exit 0
owned eslint / prettier           clean
integration (own cluster)         18/18 twice
real-handler probe (9 tests)      all pass, incl. headers, recall, admin, bill/modify/ready/recall/void
mutations A–D                     each fails the intended tests
```

## Not verified

- CI (`verify` + `integration`) — branch not pushed.
- Android client behaviour (contract unchanged).
- POS payment with a real device context; own-tenant happy paths for `bill` and
  `/member` on a real DB.
- Owner token with a null restaurant on `/status` (covered by the equivalent staff
  token and the unit test's owner-mismatch case).
- Header equality beyond `date`/`etag`; timing side channels.

## Residual risk

- Platform-admin status mutation (policy, D8) — the admin can still distinguish
  existence on that route. Tracked separately.
- Recall-ordering invariant is unit-only in the harness (N-05).
- SSE auth mapping is a message-string check (N-04).
- `modify` generic `500` (R-03).
- Other resource helpers (`requireTableAccess`, `requireStaffAccess`,
  `requireRestaurantAccess`) share the raw-403 pattern and remain out of scope.
- Handler-level tests do not exercise middleware.

## Routing

**PASS WITH NOTES.** F-1 is closed; revision 2 introduced no defect; the order-id
class is closed across sixteen routes. Ready for the R2 commit gate with R-01
recorded as Lead bookkeeping and R-02/R-03 accepted. CI remains unproven and must
be green on the pushed branch before merge.
