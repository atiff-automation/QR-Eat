# Review 22 — QR-EAT-LOYALTY-PROMO-V1 · P8 (reports)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · P8
**Verifiers:** `ses_e2733fe8dffekIWULh7e35gPqK` (**FAIL**) · `ses_e270536d3ffeEjnIKm4v7f7hd7` (PASS WITH NOTES) · `ses_e26d7435bffeb8l3pTA7rdTUKe` (PASS WITH NOTES) · `ses_e26ca987effeepkA20wReR2icB` (PASS WITH NOTES)
**Implementer:** `ses_e274172c6ffecMujy3lz6BA5yl` · `ses_e27162980ffefrAsPO5EYLJibr` · `ses_e26ddbf26ffes5qyAwVrnmSBfJ` · `ses_e26d1688affeexsZtGdaVE3W1P`
**Date:** 2026-11-14 · **Risk:** R3 · **Base:** `64f4dee`

## Verdict

**PASS WITH NOTES.** P8 closes. Three correction cycles.

## What P8 fixed — four defects, and one I caused

| # | Defect | Status |
|---|---|---|
| 1 | **P&L double-subtracted discounts.** `grossSales = Σ totalAmount` is already post-discount, then `− discounts` again. | Fixed |
| 2 | **Refunds were invisible.** Refunds are written as `Payment { amount: -x, status: 'PAID' }`; the P&L looked for `status: 'REFUNDED'` (matches nothing) and the loyalty report only read batch-attached payments. Refunds reported `0.00`. | Fixed — both read negative payments; batchless refunds included, attributed to the refund's own business date |
| 3 | **The Z had no rounding line**, so a drawer rounded to 5 sen never reconciled on paper. | Fixed — `roundingTotal`, cash-only, plus `cashExpected` includes it |
| 4 | **The Z's gross was post-tax**, contradicting §18.20.8 and the other two reports. | Fixed — `gross = Σ subtotalAmount` |

**The one I caused:** my Q1 recommendation (`gross = Σ subtotal`, `net = gross − discounts − refunds`) was arithmetically wrong — a refund is the full post-tax total, so it double-subtracted tax and service. A fully refunded taxed order reported **−(tax + service)**. The review caught it; Q4=A replaced it with `net = Σ totalAmount − refunds`, and the identity is now `gross − discounts + tax + service − refunds = net`.

**The pattern worth naming:** the first test "pinned the old vs new arithmetic" using **zero tax and service**, so it could not fail. A test that looks rigorous and isn't.

## Verified

- **Sale day:** subtotal 100, tax 6, service 9 ⇒ gross 100, net 115 — identical in the Z, the P&L and the loyalty report.
- **Refund day:** sale 115 on D, full refund on D+1 ⇒ the D+1 Z reports gross 0, refunds 115, net −115, order count 0 — matching the other two. The refund no longer drags the original order into the refund day's gross.
- **Revenue set:** orders with a positive `PAID` payment in the business-date range, no status filter — a paid-then-cancelled order nets to 0.
- **Dates:** business dates throughout, via the shared helper; a 01:30 refund lands on the previous business day in all three reports.
- **Money:** the new sums are `Decimal`, not `Number`.
- **PDF:** prints cash payable, received, change, rounding, and an honest reconciliation status — `Yes` / `No` / `Not checked (legacy)` / `No rounded cash batches`.

## Notes carried

| ID | Note | Route |
|---|---|---|
| P8-1 | **The Z's `grossSales` now means pre-tax subtotal** — a client-visible semantic change for any Counter build that displays it | **P10 / Counter handoff** |
| P8-2 | The Z lacks `discountBySource`, the reward line, and a "refunds against prior-period sales" line that §18.20.15 asks for | P9/P10 |
| P8-3 | The loyalty report's `net` is `Σ batch-attached payments + Σ batchless negative payments`; batchless **positive** payments (the legacy `/api/pos/payment/[orderId]` route) are omitted | P9/P10 |
| P8-4 | `getCounterDailyTotals` (7-day chart) still counts a refund-only order; `netSales` agrees with the Z | Backlog |
| P8-5 | Legacy snapshot PDFs print cash figures as `0.00` beside "Not checked (legacy)" | Cosmetic |
| P8-6 | `net` now includes tax and service by design (Q4=A) — gross profit and margins now include tax | **Accounting sign-off at P10** |
| P8-7 | P&L returns numbers, not decimal strings; pre-existing shape | Backlog |

## Not verified

- Real-Postgres aggregation semantics; tests use mocks.
- Early/late business-day close: the Z uses `openedAt`/`closedAt`, the P&L and loyalty report use the 04:00 cutoff. A refund after an **early** close can land in a different report period. **P9 should test it.**
- PDF visual layout; browser render of the P&L section.
- Android Counter consumption of the changed `grossSales` semantics (P8-1).

## Residual risk

- **P8-1** is the one to carry loudly: the Z's gross figure changes meaning.
- **P8-6** needs an accountant's view before anyone treats the P&L as statutory.
- Same-model verification shares blind spots; P11 still owes a different-model pass.
