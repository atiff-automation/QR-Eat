# Review 03 — QR-EAT-LOYALTY-PROMO-V1 · P1b (revision 2)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · phase P1b
**Verifier:** `ame-verifier` session `ses_e2d9888eaffeXI115MtjTbXOdZ` (fresh, read-only)
**Date:** 2026-11-13
**Risk:** R3
**Base commit:** `fc1312a`

## Diff identity

| Item | Value |
|---|---|
| Tracked product diff (`prisma/schema.prisma`) | `b6bd9c3b6004a90b1e2a16a4740fbf8f4b14b4bd1d48b5b8d5791f7266263be8` |
| `20261113130000_loyalty_promo_v1_scope_tables/migration.sql` | `4999dffd9a88b964eac4f482b217429fa3692647eabb08d329a9963f5e46fbab` |
| `120000`+`120100` (unchanged since review 02) | `ad588a6651a541aaa65bdb35276cf5c2d35ad15456064d4c335727f54beb0d1b` |
| `src/**` / package files / `migration_lock.toml` | no changes |

## Verdict

**PASS WITH NOTES.** The phase's primary property is proven first-hand.

```text
$ npx prisma migrate diff --from-schema-datasource prisma/schema.prisma \
    --to-schema-datamodel prisma/schema.prisma --script
-- This is an empty migration.
```

| Finding | Status |
|---|---|
| **R-08** destructive `uuid[]` drift | **CLOSED** — datamodel round-trips, no `Unsupported` remains |
| **R-02** `text = uuid` in the eligibility path | **CLOSED** at the data-model level (join keys are `TEXT` on both sides); final proof in P2 |

## Notes

| ID | Severity | Note | Owner |
|---|---|---|---|
| N-07 | medium | `RUN_LOG.md` has no P1b entry; `NEXT.md` still said "awaiting approval". Evidence requirement unmet at review time. | Lead — written in this pass |
| N-08 | medium | Empty diff does not prove `130000` is in `_prisma_migrations`; a `db push` apply would make `migrate dev` offer a reset. | **Closed by Lead:** `migrate status` → "33 migrations found / Database schema is up to date". Freeze the file. |
| N-09 | low | The frozen contract contradicts itself: §18.20.14 J allows "(or join tables)", §18.20.15 D says "`uuid[]`". Revision 2 resolved it in favour of J. | Record the deviation in P10 (`docs/PRODUCT/API-CONTRACT.md`, `RELEASE-COMPATIBILITY.md`), citing J. Do not edit the Tabtep contract. |
| N-10 | low | All six parent FKs are `onDelete: Cascade`. Nothing cascades *into* menu data, but a hard delete of a promotion or quote silently removes scope rows, and hard-deleting a menu category/item silently empties a CATEGORY/ITEM promotion. | P6: soft delete only; rewrite scope rows delete-then-insert in one transaction with the promotion locked. |
| N-11 | low | `@@unique([restaurantId, id])` on the three join models is unused by any composite FK. | Intentional (requested for consistency); recorded. |
| N-12 | info | Pre-existing `expenses` index-name drift means `db:migrate` may later emit an unrelated `RenameIndex`. Not this task. | Backlog. |

## Verified

- No `Unsupported` remains; three join models with `restaurantId`; all six parent FKs composite on `(restaurantId, <parent>)` → `(restaurantId, id)`; cross-tenant ids structurally unstorable; referenced uniques exist and are created before the FKs.
- Uniqueness prevents duplicate membership; `(restaurantId, id)` on each join model.
- `DROP COLUMN` without `CASCADE` on exactly three columns; no `DROP TABLE`/`TRUNCATE`/`DELETE`/`UPDATE`/`ALTER COLUMN`/`RENAME`; columns provably unwritten (no `prisma.*` reference in `src/`, seed or scripts).
- No response schema affected. Correction to my brief: `promotionIds` is not a wire field — it appears only in the Quote record and the cash-rounding bullet, so P4 needs no response change.
- `promotionSnapshot` remains `Json?` with the snapshot XOR check intact; receipt reproducibility depends on P2/P3 populating the contract shape.
- No collateral damage; P1 migration hashes unchanged.

## Not verified

- No DB behaviour tests: FK creation, the plain `DROP COLUMN` on a real server, fresh-DB and upgrade replay remain until P9.
- `prisma generate` / type-check / tests not re-run in this pass; no `src/**` delta, so baseline evidence stands but is not re-claimed.
- Row counts in the three dropped columns cannot be inspected; "empty" rests on "no code could write them".

## Residual risk

- Scope is now mutable relational state: P6's transactional rewrite is load-bearing. A half-written scope silently drops a promotion and counts a visit.
- Any further edit to `20261113130000` after its apply forces a reset on `qrorder_dev`.
- Same-model verification: an R3 payment/migration path should also get a human or different-model pass before release.
