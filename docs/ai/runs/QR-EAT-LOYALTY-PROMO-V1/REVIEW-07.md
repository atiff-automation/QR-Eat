# Review 07 — QR-EAT-LOYALTY-PROMO-V1 · P5A (Counter bill + member)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · phase P5A
**Verifiers:** `ses_e2cbbf3f2ffeSCCW0NziqoU25V` (**FAIL**) · `ses_e2cac41c7ffevw5PW5VQexObc4` (re-review, PASS WITH NOTES)
**Implementer:** `ses_e2cc9a6f0ffea1CiddEIMiYNpM`
**Date:** 2026-11-13 · **Risk:** R3 · **Base:** `b4c53f4`

## Verdict history

| Pass | Verdict | Reason |
|---|---|---|
| 1 | **FAIL** | F-01 (high): member change re-attributed **paid** orders |
| 2 (after cycle 1) | PASS WITH NOTES | F-01/F-02/F-03/F-04/F-06 fixed; R-01/R-02 raised |
| 3 (after cycle 2) | **not run** | R-01/R-03/R-07 fixed; folded into the P5B gate — see "Verification gap" |

| Item | Value |
|---|---|
| P5A files (15), combined | `1f46331b82e752ab24cc451e651e8f957bf82964c0691e981ad7516ac82f3606` |
| Tracked diff | `eabfd949086569c640b1b95f78e361be8c5f8770ad5000458d6a5c102eb6024e` |

## The blocking defect (F-01)

`changeMember` fanned `Order.customerId` across **every** order in the session:

```ts
where: { restaurantId, diningSessionId: bill.sessionId }   // no paymentStatus filter
```

`resolveBill` only reports `paid` when *all* non-cancelled orders are paid, so a
partially-paid session reached this write. `daySubtotal` attributes paid spend by
`Order.customerId` — the only attribution available, since `Payment` and
`PaymentBatch` carry no `customerId`.

**Concrete corruption:** order A (RM18) already paid, order B (RM5) open, `minDailySpend`
RM20, cashier attaches a member ⇒ `daySubtotal` becomes 23 ⇒ `visitState` flips
`BELOW_MINIMUM → COUNTS`. On a third visit that grants a reward on spend the member never
made, and it retroactively strips the spend from whoever actually paid.

**Clause conflict and ruling.** §18.20.14 J says "change-member updates all orders in the
session"; §18.20.15 D defines `daySubtotal` over paid orders per member; §18.20.14 I says a
paid order is not re-evaluated; §18.20.15 A makes visits append-only. **Ruling: J applies to
an unpaid bill only — paid and cancelled orders are never re-attributed.** Implemented as
`paymentStatus: 'PENDING'` + `status: { not: 'CANCELLED' }`. Recorded as a P10 clarification.

Verified after the fix: the corruption case now yields `daySubtotal: 5.00`,
`visitState: BELOW_MINIMUM`, `amountToMinimum: 15.00`.

## Findings

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| F-01 | **high** | Paid orders re-attributed on member change | **FIXED** + red-capable regression test |
| F-02 | medium | v1 legacy branch changed numerically (`Number` → `Decimal`); comment claimed the branch was untouched | **FIXED** — comment corrected; behaviour is the correctly-rounded value, shape unchanged |
| F-03 | medium | v1 branch had no test at all | **FIXED** — multi-order v1 test pins `30.3` |
| F-04 | medium | No audit row for member attach/remove; `userId` threaded and dropped | **FIXED** — `auditLog.create` inside the transaction, old/new values, actor from tenant context |
| F-05 | medium | `paidSubtotalForMember` scans every payment of the business day on each bill read | **Deferred** — inherited from P4; P7 perf |
| F-06 | low | Dead `discountSource: 'MULTIPLE'` widened the wire enum | **FIXED** |
| F-07 | low | A failed projection silently reprices as a guest bill | **Deferred** — payment fails closed in P5B |
| F-08 | low | Customer create happens outside the bill transaction | **Accepted** — no consent invariant broken; bill stays `GUEST` |
| R-01 | medium | Attach renamed an existing customer with only `loyalty:attach` — no `members:pii`, no audit | **FIXED** — name is creation-only |
| R-02 | **medium** | **Pre-existing**: the bill response spreads `orders[].customerPhone` and `customerSession.customerPhone`, so a cashier with only `orders:read` sees a full phone. Not introduced by P5A. | **ESCALATED — needs a product decision** (see below) |
| R-03 | low | Takeaway member path could write a cancelled/refunded order | **FIXED** — both treated as settled |
| R-04 | low | Projection logic duplicated between QR quote and Counter bill | **Deferred** — P5B must not add a third copy |
| R-05 | low | New codes outside §18.20.12 | P10 |
| R-06 | low | Member change locks `loyalty-bill:…`; payment locks `table-payment:…` — they do not serialize | **P5B must validate `expectedBillRevision` under the contract lock order** |
| R-07 | low | Re-attach / remove-when-absent bumped the revision | **FIXED** — no-ops |
| R-08 | low | Paid bills return `projectedTotal: '0.00'` | P5B/P6 UI contract check |
| R-09 | low | Customer create outside the transaction | Accepted |
| R-10 | low | Missing review file / state header | Fixed in this pass |

## Verification gap (recorded)

Correction cycle 2 (R-01/R-03/R-07) was **not** independently re-reviewed. It is small, local
to `loyalty-bill-service.ts`, test-covered (107 scoped tests, 914 full suite green), and touches
the same file P5B will re-review. Carried as an explicit gap into the P5B gate rather than
silently accepted.

## Verified

- Field completeness: all 29 §18.20.6 bill-read fields, pinned by an exact `toEqual`.
- Flag-off byte equality on the dine-in v2 response; no loyalty query when off.
- `totalAmount == projectedTotal`; `cashPayable = round5` under `NEAREST_5_SEN`;
  `fullPriceTotal` from tax/service on the undiscounted subtotal; `visitState` from the resolver.
- New loyalty fields carry `maskedPhone` only — no `phone`, no `phoneHash`.
- Member attach: server-derived consent, 422 before any write, `loyalty:attach` +
  `orders:write`, `Idempotency-Key` (`MEMBER_CHANGE`), `expectedBillRevision` → `BILL_CHANGED`.
- No payment, `OrderDiscount`, `LoyaltyVisit` or `LoyaltyCard` write in this pass.

## R-02 — escalated, not deferred silently

A cashier holding `orders:read` but not `members:pii` receives a **full customer phone** on the
Counter bill, because the response spreads the legacy order payload. This predates this task,
and §18.20.9 says full phone requires `members:pii`.

It cannot be fixed by a flag, because removing the field changes the legacy response shape that
existing Counter builds read. Options: mask the legacy fields, gate them behind `members:pii`,
or accept and record. Needs a product decision at P7, not a silent fix.

## Residual risk

- `DiningSession.customerId` is authoritative; any P5B code that computes paid spend via the
  session over all orders would reintroduce F-01.
- Pre-attach guest spend is excluded from `daySubtotal` by the ruling — a guest bill of RM18
  plus a member bill of RM5 reads `BELOW_MINIMUM` despite RM23 of physical spend.
- Lock-key mismatch between member change and payment (R-06).
- Duplicated projection logic (R-04) can drift between the QR quote and the Counter bill.
- Same-model verification shares blind spots; R3 still warrants a different-model or human pass.
