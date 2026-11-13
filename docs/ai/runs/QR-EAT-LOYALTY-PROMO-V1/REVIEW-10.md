# Review 10 — QR-EAT-LOYALTY-PROMO-V1 · P5 close-out

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · P5 close-out
**Verifier:** `ses_e2b97f14effeyUVdYA518PvbeX` (fresh, read-only)
**Implementer:** `ses_e2ba1ed40ffeepLapurhNzFKTs`
**Date:** 2026-11-13 · **Risk:** R3 · **Base:** `1fd2c37`

## Verdict

**PASS WITH NOTES. P5 can be closed.**

| Item | Value |
|---|---|
| Delta diff | `be394705fd8d178a652d08e09d5d8d752b74b0eebe67eb895ccd758be8d8aeed` |
| Five files, combined | `003c0245f8c9a2fda814f937f5e49ca3962d51676eb1905fe3d1a2a7595012cd` |

## Findings closed

| ID | Finding | Disposition |
|---|---|---|
| F-1 | `payment.order.items[]` narrower than legacy — an existing Counter receipt would lose quantity and price with the flag on | **FIXED** — `PAYMENT_ORDER_SELECT` now uses the **same constant** the legacy path uses (`ORDER_WITH_DETAILS_INCLUDE.items`), so the shape is equal by construction. `BILL_ORDER_SELECT` untouched; the bill read did not get heavier. |
| F-2 | Re-evaluation only handled `source='PROMOTION'`; a stale ACTIVE `LOYALTY_REWARD` row could survive a modify | **FIXED** — every ACTIVE row is removed/replaced regardless of source; `Order.discountAmount` returns to `0.00` |
| F-3 | `DiningSession.discountAmount/Source/Label` not refreshed on modify | **FIXED** — written in the same transaction as the ledger change |
| F-5 | Modify checked idempotency only before the lock | **FIXED** — re-checked under the lock, cached response returned with no write |
| F-6 | Offline `hasMember` used raw `customerId`, so a withdrawn member reported `NO_BENEFIT` | **FIXED** — derived from `status='ACTIVE'` + `consentAt` + no withdrawal; withdrawn ⇒ `GUEST` |

All five fixes are red-capable: each test fails on the pre-fix code.

## Follow-up found and closed in the same pass

**R-01** — the F-3 session aggregate summed **all** ACTIVE rows, while the payment writer sums only **payable** orders. A session with a paid order carrying a reward row, or a cancelled order carrying a promotion row, would make the two writers persist different session summaries. Fixed: the aggregate is scoped to `paymentStatus: 'PENDING'` + not `CANCELLED`, matching the payment path. Regression test added (pending `6.00` + paid `8.00` ⇒ summary `6.00`, not `14.00`).

**Verification gap recorded:** the two-line R-01 fix was not separately re-reviewed; it is test-covered and touches the same query the verifier had just reviewed. Carried into the P6 gate.

## Notes carried

| ID | Note | Owner |
|---|---|---|
| R-02 | `sessionDiscountLabel` now exists twice with different input shapes | F-7 cleanup |
| R-03 | F-5 makes a same-key duplicate with a stale version replay instead of 409 — document | P6/P10 docs |
| R-04 | The promotion-branch `superseded` widening is unreachable (one ACTIVE row per order) — harmless | none |
| R-05 | A flag-off modify still leaves the ledger untouched, by design | accepted |

## P5B invariants re-confirmed after the delta

No charge above the QR confirmation; validation before any write; money identities; card reset from `nextCardState`; lock order customer/day → bill/order unchanged; no `prisma/**` or `src/app/api/qr/**` change.

## Not verified

- Real Postgres lock serialisation and deadlock freedom — still mock-only (P9).
- A real Counter build parsing the widened `payment.order.items[]`.
- R-01's two original scenarios executed against data (reasoned and now unit-tested, not DB-tested).

## Residual risk

- P8 must read `OrderDiscount` directly for paid-order discount history; the cached session summary deliberately excludes paid/cancelled rows.
- F-10 (QR/counter order create do not take `loyalty-bill` before bumping the revision) remains the price-lock gap — P9.
- F-8 (promotion swap updates the ACTIVE row in place; redemption history relies on the audit log) — P8.
- Flag flipped off mid-service: a stale ACTIVE row can survive a modify and be re-applied if the flag returns before payment.
- Same-model verification shares blind spots; R3 still warrants a different-model or human pass before release.
