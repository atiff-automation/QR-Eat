# Review 09 — QR-EAT-LOYALTY-PROMO-V1 · P5C (modification re-evaluation)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 + P5C scope amendment
**Verifier:** `ses_e2bd33272ffeZjtGGJJdzRYiYQ` (fresh, read-only)
**Implementer:** `ses_e2beb2436ffen6kUQpicw4XuM1`
**Date:** 2026-11-13 · **Risk:** R3 · **Base:** `35974d3`

## Verdict

**PASS WITH NOTES.** No blocking defect.

| Item | Value |
|---|---|
| Six files, combined | `bd7fa8e10acdd56e8bda1f0736290189ed398159c1f941c6b152ec5f10de4966` |
| Tracked product diff | `2af5e7f86193b53f023a476f51069cc10ee47ea9a39e4850b28c0a84166bef09` |

## The question

**Can removing a promoted item leave a stranded discount? — No, for any reachable loyalty-active unpaid order.**

Removing the only promoted item (or dropping below `minSpend`) sets the ACTIVE `PROMOTION` row to `REMOVED`, writes `Order.discountAmount = 0.00`, nulls `discountSource`, and moves both `discountVersion` and `billRevision`. The bill read only prices ACTIVE rows, so the visit unblocks — unless another order in the bill still carries a promotion, which correctly keeps blocking.

## Fixes verified

| ID | Finding | Disposition |
|---|---|---|
| F-02 | Modify rewrote totals but never maintained the ACTIVE ledger | **FIXED** — reuses the P2 engine (a new call site, not a fourth pricing path); updates/replaces/removes the single ACTIVE row; recomputes tax/service per order from rate snapshots; bumps `discountVersion` + `billRevision`; audit row in the same transaction |
| F-01 | Guest offline replay persisted `NO_BENEFIT` | **FIXED** — `PROMOTION_APPLIED` → member `NO_BENEFIT` → guest `GUEST`, matching §18.20.15 E |
| F-03 | Loyalty `payment` object dropped legacy keys | **FIXED** — full Prisma `Payment` row spread; all enumerated keys restored |

Locks: `loyalty-day` (when a member) → `loyalty-bill`, the same order as payment, held for the whole transaction, so modify and payment cannot interleave. Paid orders are refused before any lock or ledger write.

## Clause ruling recorded

Modify now re-evaluates against the **live** promotion set, so a promotion that expired since order create is removed on modification. The verifier's reading, which I accept: **§18.20.14 I wins for an unpaid modification** — it is normative and explicitly scopes re-evaluation to unpaid changes. P5B's "order create is the price lock" governs reads and payment of an *unmodified* order. A modification is a new pricing event with changed contents, so the live set is the correct input. P6 copy must make the new total explicit.

## Remaining findings

| ID | Severity | Finding | Route |
|---|---|---|---|
| F-1 | medium-low, **Counter compat** | `payment.order.items[]` is narrower than legacy — missing `id`, `quantity`, `unitPrice`, `selectedOptions`, `specialInstructions`, `menuItem.price/preparationTime`. An existing Counter rendering a receipt from `payment.order.items` loses quantity and price when the flag turns on. | **P10 contract freeze / Counter handoff**, or a small follow-up to widen the item projection |
| F-2 | low, latent | Re-evaluation only handles `source='PROMOTION'`; an ACTIVE `LOYALTY_REWARD` row on an unpaid order would survive with a stale base. Unreachable today (reward rows exist only on paid orders). | Defensive follow-up |
| F-3 | low | `DiningSession.discountAmount/Source/Label` not refreshed on modify; bill read recomputes so no visible bug | P6/P8 |
| F-4 | low | Version-check ordering changed: a duplicate idempotency key with a stale version now replays instead of 409 | Document |
| F-5 | low | Modify checks idempotency only before the lock; a concurrent duplicate gets 409 instead of the cached result | Optional hardening |
| F-6 | low | `hasMember` uses raw `customerId`, not resolved consent — a withdrawn member would report `NO_BENEFIT` on offline replay | P6 |
| F-7 | low | Active-promotion query and snapshot builder duplicated with the QR service | Cleanup |
| F-8 | low | A promotion swap updates the ACTIVE row in place, so P8 redemption history relies on the audit log | P8 |
| F-9 | info | Paid-order modify returns a pre-existing 500 | Pre-existing |
| F-10 | info, **price-lock relevant** | QR order create bumps `billRevision` without the `loyalty-bill` lock; counter order create does not bump it at all. Pre-existing P4/P5A. | P9 — every bill-mutating path must bump the revision and take the lock before the price lock is fully reliable |

## Verified

- F-02 correctness, visit-blocking semantics, paid-order refusal, lock order, revision bump, audit row.
- F-01 precedence; F-03 enumerated keys.
- Flag-off response shape unchanged; only a lock and extra reads added.

## Not verified

- Real Postgres lock serialization and no-deadlock proof (mock-based tests only).
- Concurrent modify vs payment through the HTTP routes.
- The takeaway modify path (reasoned from code, not tested).
- A real Counter build parsing the loyalty `payment` object (F-1).

## Residual risk

- The price lock depends on every bill-mutating writer taking `loyalty-bill:` (F-10).
- Flag flipped off mid-service: a stale ACTIVE row can survive a modify and be re-applied if the flag returns before payment.
- Nested receipt items remain narrower than legacy (F-1).
- Same-model verification shares blind spots; R3 still warrants a different-model or human pass before release.
