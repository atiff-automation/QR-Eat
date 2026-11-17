# Review 02 — QR-EAT-LOYALTY-PROMO-V1 · P1 delta (corrections)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 1 · P1, correction cycle 1
**Verifier:** `ame-verifier` session `ses_e2db52e0cffejD8ZjffivRLfsF` (fresh, read-only)
**Date:** 2026-11-13
**Risk:** R3
**Base commit:** `fc1312a`
**Scope:** delta only — R-03, R-04, R-07, plus collateral-damage check

## Diff identity

| Item | Value |
|---|---|
| Tracked product diff (`prisma/schema.prisma`) | `2568fc7d5bb4369851f7bdd5b4d145dfadb3c96ec08b89b346cc09e0c8faf5a6` |
| Tracked diff incl. `docs/ai/ACTIVE.md` | `a2d0faefffc3ce8f89fbd7e535378c980e91c070a3597f687f85417d9d1e2c6b` |
| Untracked migration pair (m1+m2, path order) | `ad588a6651a541aaa65bdb35276cf5c2d35ad15456064d4c335727f54beb0d1b` |
| `20261113120000_loyalty_promo_v1/migration.sql` | `18dd3ab2c55bfd1d134db27260b7c3689d330796eeaf9487186b7462827e23fb` |
| `20261113120100_loyalty_promo_v1_indexes/migration.sql` | `4e09d04b91a5d9f70100126a0895d1b21bc5b07863fd81660e4bf6ffec0b2e57` |
| `src/**` changes | none |

## Verdict

**PASS WITH NOTES.** R-03, R-04, R-07 all **resolved**. No new defect.

Gate condition 1 (corrections + fresh delta review) is **satisfied**.
Gate condition 2 (scratch-DB apply) remains **open**.

## Finding disposition

| ID | Status | Evidence |
|---|---|---|
| R-03 | **Resolved** | `restaurantId` NOT NULL + cascade FK + `Restaurant.rateLimitCounters`; unique `(restaurantId, scope, subject, windowStart)`; `windowStart` cleanup index; `scope` CHECK parsed to exactly `PHONE_HASH, RESTAURANT, QR_SESSION, EDGE_IP` — no fifth value. Phone-hash bucket is per tenant. |
| R-04 | **Resolved** | Truth table verified over 12 rows with three-valued logic; `(55.70, 55.68, 0.02)` passes, `(55.70, 55.68, 0.00)` and `(55.70, 55.68, NULL)` fail, card rows pass, pre-migration all-null passes, ±0.02 kept. No contract-valid row rejected. |
| R-07 | **Resolved** | Hunks only in `Restaurant` (5), `DiningSession` (3), `Order` (6), `PaymentBatch` (3) + appended block. `model Table` = 0 hunks. `git diff -w` shows 390 insertions and **zero** non-whitespace deletions. |

## New notes (non-blocking)

| ID | Severity | Note | Owner |
|---|---|---|---|
| N-01 | low | Task/bookkeeping state not updated at the review boundary (header, verifier session, diff hash, review file, run log). | Lead — fixed in this pass |
| N-02 | low | `scope` is free `TEXT`; a typo fails as Postgres `23514` at runtime. P7 must share one typed constant and map it to a contract error. | P7 |
| N-03 | low | The "5 distinct phoneHash misses from one IP / 10 min" enumeration alert is not directly derivable from the four buckets; needs a P7 design decision. | P7 |
| N-04 | low | The CHECK bounds the adjustment but cannot enforce the 5-sen grid; `cashPayable = round5(...)` stays app-enforced. | P5 test |
| N-05 | info | `ADD CONSTRAINT` on `payment_batches` takes ACCESS EXCLUSIVE + full scan; safe because all pre-migration rows satisfy branch 1. | accepted |
| N-06 | info | Pre-existing `prisma format` drift remains in `Table`, `BusinessDay`, `Station`, `RestaurantChange`, `OrderEvent`; a future whole-file format will re-create drive-by hunks. | convention: format only touched models |

## Collateral-damage check

Passed: no `src/**`, no `package.json`/lockfile, no existing migration edit, `migration_lock.toml` untouched, no `DROP`/`UPDATE`/`DELETE`/`TRUNCATE`/`ALTER COLUMN`/`SET NOT NULL`/`RENAME`, migration 1 still byte-identical to Prisma's generated DDL (230 normalised lines), all identifiers ≤ 63 chars.

## Not verified

- No SQL executed. CHECK parsing, partial-index validity, FK creation, upgrade-time validation over real rows, and Prisma shadow-DB drift behaviour remain unproven.
- `prisma generate` not re-run in the delta (forbidden); generated client not re-proven against the R-03 change.
- No tests run in the delta: no `src/**` change, so evidence equals the P0 baseline. Not claimed as re-run.

## Residual risk

- Every data-layer invariant is DB-unproven until a scratch apply. P5 is the first real writer.
- `ADD CONSTRAINT` lock behaviour is acceptable only because there are no real users.
- Still carried from review 01: R-01 (cascade vs restrict), R-02 (`text = uuid`), R-05 (raw-SQL drift), R-06 (122-bit quote id).
