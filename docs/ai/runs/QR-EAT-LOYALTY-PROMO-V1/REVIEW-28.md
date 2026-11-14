# Review 28 — QR-EAT-LOYALTY-PROMO-V1 · P11-prep

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · P11-prep
**Verifier:** `ses_e239155e1ffeFQuCLsLt1uLj76` (PASS WITH NOTES)
**Implementer:** `ses_e23a0afbbffel5PGsOGkRwOqyr`
**Date:** 2026-11-15 · **Risk:** R2 · **Base:** `61580a8`
**Tracked diff hash:** `7962804dfbc9b334a73178821f6e59b530befb4da7a7b8cfb40c2b5032889a0c`
**Combined hash (22 paths):** `5aabb66eafd1485c1119e640c3a9a2d5b12eaeb11e050f5b871586b576585583`

## Verdict

**PASS WITH NOTES.** No correction cycle. Low notes only.

## The finding that mattered

**P9-2 was real.** QR create incremented `DiningSession.billRevision` while holding only the
`tables` row lock. The payment path never takes that lock — it takes `loyalty-day` then
`loyalty-bill`. So a payment could read the bill, validate `expectedBillRevision` against a
stale revision, and commit while a create was in flight; the new order would then join an
already-settled bill.

The fix takes the same `loyalty-bill:{restaurantId}:{sessionId}` advisory lock **before**
`tx.order.create`, inside the order transaction. Lock order is `tables` row → `loyalty-bill`,
and no payment, bill or modify path takes the `tables` row lock, so the ordering is acyclic.

## What else changed

| Item | Result |
|---|---|
| **D-1** | `DELETE` pre-checks orders, batches, business days, members, visits and discounts; any history → `409 RESTAURANT_HAS_HISTORY` with the deactivate guidance; `P2003` maps to the same 409; an empty tenant still deletes. Closing a restaurant forever is `isActive: false`, documented in `DATA-RETENTION.md` with the erasure procedure. |
| **D-2** | Recorded, no behaviour change: the order contact phone is order-contact data, not member PII; member phones stay masked and gated. |
| **P8-8** | The Z, the sales page and the 7-day totals now use the same half-open cutoff window as the P&L and the loyalty report. `AFTER_CLOSE_ACTIVITY` marks a payment or refund between `closedAt` and the cutoff end. The filed `BusinessDay.snapshot` is untouched. |
| **P9-3** | An unrecognised `P2002` is a typed conflict (`BILL_CHANGED` 409, `CUSTOMER_CONFLICT` 422, `CONFLICT` 409), never a 500. Four route mappers handle the new class. |

## Verified

- **Early-close case:** day closed 01:00, refund 02:00, cutoff 04:00 → the Z includes the refund
  and flags `AFTER_CLOSE_ACTIVITY`; the sales page, the daily totals, the P&L and the loyalty
  report all attribute it to the same business date.
- **Half-open boundary:** a payment exactly at the cutoff is excluded from all of them.
- **Lock ordering deadlock-free:** every `FOR UPDATE` on `tables` and every advisory lock read;
  no `loyalty-bill → tables` edge.
- **No 500 path left** on the four in-scope services.
- **Drill:** the Lead ran `npx tsx scripts/rehearse-concurrency.ts` after the lock change —
  **47/47**, barriers `waiters=2/2`.
- **No regression:** 1418 passed / 11 skipped / 1429 total; type-check and build green; no schema,
  migration or dependency change; no Tabtep file.

## Notes carried

| ID | Note | Route |
|---|---|---|
| L-1 | The P9-2 test proves invocation order, not that the lock is inside the transaction | Optional hardening |
| L-2 | The D-1 test does not assert the count calls are tenant-scoped | Optional hardening |
| L-3 | `CUSTOMER_CONFLICT` 422 is proven at the service layer, not the route response | Optional |
| L-4 | The addendum said the `P2003` fallback also carries `history` counts | **Fixed by the Lead** |
| L-5 | An unrecognised `P2002` on a receipt collision reports `BILL_CHANGED`, slightly inaccurate | Backlog |
| L-6 | `AFTER_CLOSE_ACTIVITY` is strict at exactly `closedAt` | Accepted |
| L-7 | The Z window is a superset of the old range; out-of-window activity moves to the correct date | Intended |

## Residual risk

- `getCounterDayOrders` (the day's order list) still uses the old window; an order created after
  an early close can be missing from the list while its payment is in the Z.
- `hashtext` is a 32-bit lock space; collisions serialize unrelated bills (contention only).
- The drill evidence is the Lead's run, not the verifier's.
- Same-model verification; P11 is the different-model four-lens pass.
