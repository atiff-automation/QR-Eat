# Review 27 — QR-EAT-LOYALTY-PROMO-V1 · P10-close

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · P10-close
**Verifiers:** `ses_e256ab70dffe8jdfSybhCzpl4H` (PASS WITH NOTES) ·
`ses_e25455b69ffef0KjEyWDY1qkEi` (PASS WITH NOTES) · `ses_e2476f9c4ffemofT3lHUjzYy2W` (PASS)
**Implementer:** `ses_e25875a52ffenUI6EjvI8K17Xv`
**Date:** 2026-11-14/15 · **Risk:** R2 · **Base:** `d2ad02b`

## Verdict

**PASS.** Two correction cycles. Six items closed, register rewritten.

## What P10-close changed

| Item | Result |
|---|---|
| **P8-2** | The Z now carries `discountBySource` (promotion + reward), `rewardTotal`, and `refundsPriorPeriod` — refunds whose original sale was on an earlier business date. The identity is unchanged; the prior-period line is a subset and does not enter it. |
| **P8-3** | The loyalty report includes batchless positive payments in gross and net, attributed by `createdAt`, counted exactly once. |
| **F-03** | A test pins `SecurityUtils.getClientIP` → resolver in both directions (Railway header, off-Railway `unknown`). |
| **P9-03** | The concurrency drills release only after both ready markers **and** two waiters scoped by a per-run `application_name`; a go-file handshake removes the slow-start race; a timeout fails the drill. |
| **P8-6** | `docs/PRODUCT/P8-6-ACCOUNTING-SIGNOFF.md`: the question, both options, the numbers, the consequences, a signature block. The P&L is captioned non-statutory. |
| **Register** | Rewritten: 21 stale rows closed with evidence, duplicate `P8-2` renamed `P5C-1`, every remaining row has an owner. |

## What the reviews caught

The first pass found the arithmetic right but the drill barrier weak in two ways, and no
remediation path for a Z blocker:

| Finding | Why it mattered |
|---|---|
| **M-02** | Drill 3 counted every ungranted lock in the database, so a concurrent session could supply the second waiter and release the parent early — a false pass. Fixed with a per-run `application_name` scope (verified that Prisma forwards the parameter). |
| **M-03** | The 20 s barrier exceeded the services' 5 s/15 s transaction timeouts, so a slow child could fail for the wrong reason. Fixed with a go-file handshake and a 3 s scoped-waiter budget. |
| **M-04** | A legacy Z mismatch blocked close with no documented way out. The runbook now names both blocker types, the data check and the escalation. |
| **L-06** | The batchless query omitted `status: 'PAID'`; a legacy pending payment could have been counted. |
| **L-07** | The original-payment lookup was tenant-safe only by construction; the predicate is now explicit. |
| **L-04** | A legacy closed Z printed `0.00` for the new lines; it now prints `—`. |

The second pass confirmed all fixed and raised four low notes. Two were fixed in a final cycle:
the barrier budget (3 s, below the member services' 5 s timeout) and a test for the operator-visible
`409 BUSINESS_DAY_BLOCKED` close path.

## A correction I had to make mid-flight

My first instruction said "assert the split sums to `discounts`". The implementer read that as a
**runtime** assertion and threw a 500. A legacy order with a discount and no `OrderDiscount` rows
would have broken the close for the whole restaurant. Changed to a **blocker**: the Z returns its
numbers, the operator sees the discrepancy, and the close returns `409` with `details.blockers`.

## Verified

- **Worked case:** subtotal 100, promotion 10, reward 5, tax 6, service 9, total 100 →
  gross 100, discounts 15, split 10/5, net 100, identity holds. Full refund next day →
  refunds 100, prior 100, net −100, no false blocker.
- **No figure change** on consistent, fully batched data; the loyalty report changes only for
  batchless positives (the bug fix).
- **Drill:** run by the Lead on `qrorder_dev` — **47/47**, all barriers observed
  (`waiters=2/2` scoped to the run's `application_name`).
- **No 500:** both discrepancies are blockers; the close path returns 409 and is covered by a
  red-capable test.
- **No regression:** 1397 passed / 11 skipped / 1408 total; type-check and build green; no
  schema, migration, dependency, bucket or limit change; no Tabtep file touched.

## Carried

| ID | Note |
|---|---|
| L-05 | The Z accumulates money as JS numbers (pre-existing); the identity check converts to Decimal |
| L-09 | The PDF blocker section is legacy-only; the live Z payload is the surface |
| P8-6 | Signature still pending — the packet is ready |
| P9-03 | The verifier did not run the drill (it writes to the DB); the Lead did |

## Residual risk

- The drill's runtime evidence is the Lead's run, not the verifier's.
- `refundsPriorPeriod` uses the earliest positive payment batch date; split payments spanning
  business dates are approximated.
- Same-model verification; P11 still owes the four-lens, different-model pass.
