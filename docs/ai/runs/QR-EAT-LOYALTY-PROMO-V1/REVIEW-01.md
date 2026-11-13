# Review 01 — QR-EAT-LOYALTY-PROMO-V1 · P1 (data and migration)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 1 · phase P1
**Verifier:** `ame-verifier` session `ses_e2dc91ce1ffe9Gj1e62riUs66y` (fresh, read-only)
**Date:** 2026-11-13
**Risk:** R3
**Base commit:** `fc1312a`
**Lens:** Data & Migration, plus clause-by-clause completeness against the frozen contract

## Diff under review

| Item | Value |
|---|---|
| Tracked product diff | `prisma/schema.prisma` only |
| Tracked diff hash | `e6b7e54a45e0a1cb4d8c05b0af859e653d7902ee403abe2e55d97385e118b611` |
| Tracked diff hash (incl. `docs/ai/ACTIVE.md`) | `f3d9d0d85373de702c3bf977dbd0110a083b16e4b75fdf47be49e64c567d1b2d` |
| Untracked product hash (2 migrations) | `e55951deef8d08b379c7f31d126f49b72e4086265328fd8afbbe8ec44458ba7b` |
| `src/**` changes | none — confirmed |

## Verdict

**PASS WITH NOTES.** No spec violation found. Migration 1 is provably identical to
Prisma's own generated upgrade DDL, and no pre-existing declaration was altered.

## Findings

| ID | Severity | Location | Issue | Disposition |
|---|---|---|---|---|
| R-01 | medium | migration 1 RESTRICT edges vs CASCADE edges; `src/app/api/restaurants/[id]/route.ts` | `Restrict` FKs sit under tables that are `ON DELETE CASCADE` children of `restaurants`; a bare `prisma.restaurant.delete()` can fail. Partly pre-existing (`payment_batches.orderId` is already `Restrict`). | **Deferred to human decision.** Not provable statically. P1 keeps contract fidelity. |
| R-02 | medium | `uuid[]` columns vs `TEXT` PKs | `WHERE id = ANY("itemIds")` fails at runtime: `operator does not exist: text = uuid`. Contract mandates `uuid[]`. | **Carried to P2/P3 acceptance.** Central accessor with explicit casts + per-scope DB test. |
| R-03 | medium | `rate_limit_counters` | No `restaurantId`; a phone-hash bucket would be global across tenants (contract requires per-`(restaurantId, phoneHash)`), and `scope` is unconstrained `TEXT` so a typo creates a new bucket. | **Correction requested in P1** — schema is frozen here. |
| R-04 | low | `payment_batches_roundingAdjustment_check` | Bounds ±0.02 but does not enforce `roundingAdjustment = cashPayable − totalAmount`. | **Correction requested in P1** (hardening). |
| R-05 | low | partial indexes + CHECKs | Raw-SQL objects are invisible to Prisma; `migrate dev` may later propose dropping them. Acceptance on a clean DB unproven. | **Gate condition:** scratch-DB apply + `migrate dev --create-only` empty. |
| R-06 | low | `Quote.id @default(uuid())` | UUID v4 is 122 random bits; contract says 128-bit opaque token. | **Carried to P3.** Mint explicitly, do not rely on the DB default. |
| R-07 | low | `prisma format` realignment | Whitespace-only hunks inflate the diff; `Table` gains no field but was realigned. | **Correction requested in P1** — revert drive-by realignment. |

## Deviations accepted

- `uuid[]` carried via `Unsupported` + `dbgenerated` (client exclusion, raw SQL access) — acceptable; consequence tracked as R-02.
- No `@@unique([restaurantId, id])` on `OrderDiscount` — acceptable, not in the contract's list.
- One shared `RewardType` enum — acceptable, identical value sets.
- `RateLimitCounter.scope`/`subject` as `TEXT` — acceptable in principle; R-03 fixed the isolation gap.

## Not verified

- No statement executed against PostgreSQL: DDL acceptance, CHECK parsing and behaviour, partial-index validity, FK creation, R-01 outcome, upgrade-from-copy path, `migrate dev` drift behaviour.
- `prisma generate` not independently reproduced; `prisma validate` was.

## Gate conditions

1. R-03, R-04, R-07 corrected, then a fresh delta review before the P1 commit.
2. Scratch-DB apply closing R-05 and R-01, or an explicit waiver with a named approver.
3. R-02 recorded in P2/P3 acceptance; R-06 in P3 acceptance.

## Residual risk carried into P5

- Nothing is DB-proven. P5 is the first real writer of `OrderDiscount`/`LoyaltyVisit`/`PaymentBatch`; a bad split aborts the payment transaction rather than failing validation.
- Identities (`Order.discountAmount == Σ ACTIVE`, `Σ Order.totalAmount == batch == Σ Payment.amount`, drawer) have no DB enforcement and must be asserted in code.
- `PaymentBatch` CHECK takes ACCESS EXCLUSIVE + full scan; acceptable only because there are no real users.
