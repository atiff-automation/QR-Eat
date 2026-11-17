# Review 08 — QR-EAT-LOYALTY-PROMO-V1 · P5B (payment)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · phase P5B
**Verifiers:** `ses_e2c3d0643ffeioiTKvvKP7IsVT` (**FAIL**) · `ses_e2bfc408dffebrZMgw0uNw4NVB` (re-verify, PASS WITH NOTES)
**Implementer:** `ses_e2c63e70dffebc9BjVK3kBJM7f` · corrections `ses_e2c19f5d4ffeJHIKxPFFAIsdUU`
**Date:** 2026-11-13 · **Risk:** R3 · **Base:** `27d3038`

## Verdict

**PASS WITH NOTES.** Two correction cycles. Money path correct and symmetric.

| Item | Value |
|---|---|
| Seven P5B files, combined | `05ca151edabda908ea56debb949177f341b62c804e40c227034ecf16148157b0` |
| Tracked diff | `738a9d354d2350d5143060135d892095eddfef27dffc106d8738eaad7869eeab` |

## The question that mattered

**Can a customer be charged more than the total shown on their QR confirmation? — No.**

Traced end to end: order create writes the ACTIVE `OrderDiscount` and the discounted `Order.totalAmount` in the same transaction that consumes the quote; one pricing function (`computeBillPricing`) is the only production path and it is always fed `activeDiscounts`, so live promotions are never re-evaluated on read or payment; payment calls the same function under the bill lock; a divergence is **refused** (`AMOUNT_MISMATCH`/`BILL_CHANGED`), never silently repriced. The QR confirmation is the pre-reward total, so the charged amount is always ≤ it.

## First-pass FAIL and what it caught

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| P5B-F01 | high | `businessDate`/`outcome` written only on the loyalty path; §18.20.14 J requires every paid batch. The flag-off parity rationale was invalid — the columns are additive and not in the response. | **FIXED** — both legacy paths write them via the shared business-day helper; response bytes unchanged (clock fields stripped) |
| P5B-F02 | **high** | Payment re-evaluated promotions live, so a promotion locked at QR could be **dropped at payment** and the customer charged the full price — above their confirmation. | **FIXED** — payment and bill read both price from ACTIVE rows; `reconcileDiscounts` only writes the reward row |
| P5B-F03 | medium | `clearFailedPaymentRecord` deleted another request's `IN_PROGRESS` record on `PAYMENT_IN_PROGRESS` | **FIXED** — only the creating request clears it |
| P5B-F04 | medium | Offline replay forced bill-level `promotionApplied=false`, misreporting a mixed bill | **FIXED** — per-order flags from ACTIVE rows |
| P5B-F05 | medium | Receipt items came from all session orders, not the payable ones | **FIXED** |
| P5B-F08 | low | `cashPayable` returned as the charged total for card/e-wallet | **FIXED** — null for non-cash |
| P5B-F09 | low | Session `discountLabel` used the first promotion instead of `Promotions` | **FIXED** |

A second cycle closed the divergence the implementer self-reported: the **bill read** now prices from ACTIVE rows too, so an expired-promotion bill no longer shows full price while payment charges the discounted total.

## Remaining findings

| ID | Severity | Finding | Recommendation |
|---|---|---|---|
| F-01 | medium | Guest **offline** payment persists `outcome='NO_BENEFIT'` instead of `GUEST` (precedence is `… > GUEST > NO_BENEFIT`). Corrupts P8 outcome counts; no money impact. | Fix — one branch + one test assertion |
| F-02 | **medium, pre-pilot blocker** | `POST /api/orders/[id]/modify` rewrites an unpaid order's totals but never re-evaluates the promotion, never updates the ACTIVE row, never bumps `billRevision`. §18.20.14 I requires exactly that. Under the new price lock, removing a promoted item or dropping below `minSpend` leaves the discount in force — revenue leak, and the visit stays blocked. | Fix, or block the modify endpoint for loyalty bills before the flag is on |
| F-03 | **medium-low, Counter-compat** | With the flag **on**, the loyalty `payment` object is not a superset of the legacy one — `payment.status`, `.paymentMethod`, `.batchId`, `.netAmount`, `.processingFee`, `.dailySeq`, `.externalTransactionId`, `.paymentMetadata`, `.processedAt`, `.completedAt` all disappear. An existing Counter build reading those breaks the moment the flag is enabled. | Restore the full payment row in P5B, or resolve in the P10 contract freeze + Counter handoff |
| F-04 | low | Unique-conflict classification substring-matches Prisma `meta.target`, so a P2002 from the raw-SQL partial index would surface as a 500 rather than `BILL_CHANGED`. Unreachable today; money-safe. | Postgres proof at P9 |
| F-05 | low | A non-`LoyaltyPaymentError` failure strands the idempotency key for 24h. Contract-permitted. | Runbook: retry with a new key |
| F-06 | low | The "multiple promotions ⇒ `Promotions`" rule is implemented twice, and the bill-level `MULTIPLE` branch is dead | Cleanup |
| F-07 | low | The implementer's file inventory omitted `loyalty-bill-service.test.ts` (+195 lines) | Corrected here |

## Verified

- Money identities asserted **in code**: allocation sums, allocation ≤ subtotal, `Order.discountAmount` from the ACTIVE row, batch == Σ order totals == Σ payments, drawer identity, rounding within ±0.02.
- Card reset driven by `nextCardState`; a zero-reward completing visit still resets and increments `cycleNumber`.
- Lock order customer/day → bill/order; payment and member change serialize on the same bill key; re-read + revision compare under the lock.
- Validation before any write; unique conflict ⇒ `BILL_CHANGED`, no charge, no partial benefit.
- Offline: offline-created full price with no benefit; online-priced keeps its promotion; replayed projected reward rejected.
- No new PII beyond the escalated R-02 legacy `customerPhone`.

## Not verified — must be proven on real Postgres before a pilot

1. Advisory locks held for the transaction; two payments on one bill serialize; two bills for one customer/day cannot both write a visit; no deadlock between day and bill locks.
2. The visit unique conflict surfaces as `P2002` with the expected `meta.target`; the partial index rejects a second ACTIVE discount.
3. `PaymentBatch.businessDate` (`@db.Date`) comparison in `paidSubtotalForMember`, and index usage.
4. Flag-off and loyalty paths write the same business date across the 04:00 `Asia/Kuala_Lumpur` cutoff.
5. A rolled-back transaction leaves no charge, no visit, no card mutation, no stuck `IN_PROGRESS`.
6. Two simultaneous same-key requests ⇒ exactly one batch, one replay, no double charge.
7. End-to-end through the HTTP route with the flag on, including the `payment.*` shape a real Counter build parses (F-03).

## Residual risk

- `hashtext` is 32-bit: collisions over-serialize (safe), a hot key is a throughput ceiling.
- `paidSubtotalForMember` scans all payment batches for the business day on every payment.
- Receipt numbers are burned on validation failures (gaps).
- Payment overwrites `Order.totalAmount`; safety rests on `recomputeOrderTotals ≡ calculateOrderTotals`, proven by one fixture and by construction.
- Flag flipped off mid-service: a bill showing a projected reward falls to the legacy path and collects the stored pre-reward total (higher than the reward projection, still ≤ the QR confirmation). Exercise in the P9 rollback drill.
- Same-model verification shares blind spots; R3 still warrants a different-model or human pass before release.
