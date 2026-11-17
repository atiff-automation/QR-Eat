# Review 11 — QR-EAT-LOYALTY-PROMO-V1 · P6A (owner settings + promotions API)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · phase P6A
**Verifiers:** `ses_e2b5f3e92ffeR1gX01awv4FIOc` (**FAIL**) · `ses_e2b50954affeDYGm5sDz89hAOJ` (re-review, PASS WITH NOTES)
**Implementer:** `ses_e2b824b29ffe5T5edbmhZzWlfF`
**Date:** 2026-11-13 · **Risk:** R3 · **Base:** `f5d9e92`

## Verdict

**PASS WITH NOTES.** One correction cycle. **P6A only** — P6 is not complete (members API, loyalty reports and all UI remain).

| Item | Value |
|---|---|
| Tracked diff | `fbfb65350c1784a720825ff92f36f0473c14d804ec99c52d0ddea31670a34cd4` |
| 16-file manifest | `17d39cc9cf9f42ab0ec02c50e10ac162449289665c574a1252daa36d0ed4e424` |

## Delivered

`GET/PATCH /api/settings/restaurant/loyalty`; `GET/PUT /api/settings/restaurant/payments` with `cashRounding`; `/api/promotions` and `/api/promotions/[id]` across ORDER/CATEGORY/ITEM with join-table scopes and soft delete; the §18.20.14 A permission constants and seed rows; `loyalty-settings-service`, `loyalty-promotion-service`, `loyalty-owner-idempotency`.

## First-pass FAIL and fix

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| F-01 | **blocking** | Payments `PUT` took no `Idempotency-Key` and wrote no audit row, contrary to §18.20.7 ("all mutating owner endpoints"). A `cashRounding` change — money-affecting — left no trail. | **FIXED** — header optional but honoured when present (replay / `409 IDEMPOTENCY_MISMATCH`); audit row written in the same transaction on **both** keyed and unkeyed paths; ids and setting values only, no PII |
| F-07 | low | The `PUT` 500 body changed | **FIXED** — byte-identical to base |
| F-08 | low | No route-level `409`/`404` tests | **FIXED** — route-level tests added |
| F-10 | low | An owner could save `enabled: true` with an incomplete notice, leaving loyalty silently disabled while reporting enabled | **FIXED** — rejected before any write, with the missing fields named |

## Verified

- `noticeTextHash` server-derived; a client hash is **stripped**, not merely overridden.
- Settings bounds mirror every DB CHECK exactly, so no constraint can fire (and those constraints are now proven on real Postgres).
- A settings change never touches an in-progress `LoyaltyCard` snapshot.
- Settings work with `LOYALTY_ENABLED` off and report `enabled: false`, never `LOYALTY_DISABLED`.
- Promotion scope rewrite is one transaction under `SELECT … FOR UPDATE`, delete-then-insert, so a concurrent eligibility read sees old-or-new, never partial (REVIEW-03 N-10).
- `endsAt` date-only is stored as restaurant-local `23:59:59.999` (`2026-12-31` → `2026-12-31T15:59:59.999Z` at UTC+8), correct for the half-open window (REVIEW-04 F-10).
- Cross-tenant category/item ids → clean 400; cross-tenant promotion id → 404; `restaurantId` always from the token, never the path.
- Owner idempotency reusing `order_action_receipts` is safe: the unique index is real, action namespaces cannot collide (`settings.loyalty.update`, `promotions.create`, …), `orderId` is nullable with no FK, and the receipt write is inside the mutation transaction.
- No `prisma/schema.prisma`, migration, QR route, payment-service or UI change; no new dependency.

## Notes

| ID | Severity | Note | Decision needed |
|---|---|---|---|
| **M-01** | **medium** | To satisfy §18.20.14 A ("payment settings → `settings:write` (owner/manager)"), `settings:write` was granted to the **manager** role. Managers previously had `settings:read` only, so this also grants write on **every** endpoint gated by `settings:write`: financial, receipt, system, hours, general, qr-ordering. Contract-aligned for payments; a collateral privilege expansion beyond the loyalty surface. | **Human decision** — accept, or narrow to a payments-scoped permission in a later revision |
| M-02 | medium | The payments `PUT` treats a missing `Idempotency-Key` as unkeyed success, so the literal §18.20.7 clause is not fully met for a caller that omits it. Safe in practice (absolute-set PUT), but server and frozen contract disagree. | Record at P10, or obtain a contract amendment |
| M-03 | medium | The only cross-tenant 404 test stubs the service to throw, so it proves the route mapping, not the tenant filter. A regression deleting `restaurantId` from the lookup would pass every test. | Add service-level tenant tests |
| L-01 | low | `PATCH/DELETE /api/promotions/{non-uuid}` passes the raw segment into a `uuid` comparison → Postgres `22P02` → 500 instead of 400/404 | Validate the id in the route |
| L-02 | low | New codes (`IDEMPOTENCY_KEY_REQUIRED`, `NOT_FOUND`, `INVALID_REQUEST`, `RESTAURANT_CONTEXT_REQUIRED`) are outside §18.20.12 | P10 |
| L-03 | low | Owner receipts share `order_action_receipts`, whose 24h expiry is lazy and has no sweeper | P9/P10 |
| L-04 | low | Loyalty-settings audit uses `recordId: restaurantId` rather than the settings row id | Optional |
| L-05 | low | A blank `Idempotency-Key` is silently treated as absent on payments but rejected elsewhere | Make consistent |
| L-06 | low | An empty `{}` PATCH is accepted and writes a no-op audit row | Optional |
| L-07 | low | `businessDayCloseTime` is returned by payments `GET` but not accepted by `PUT` | P10 interpretation |
| L-08 | low | New restaurants do not get `NEAREST_5_SEN`; no creation path writes it, so they read `NONE` | Assign to P9 |

## Not verified

- No Postgres execution: `FOR UPDATE` semantics, the P2002 race path, composite-FK rejection, and L-01's `22P02` are code-read only.
- The same-key race (loser rolls back and replays) is reasoned, not exercised.
- No UI verification — P6A is API-only.
- The new permission rows land only when `db:seed` is re-run; until then the owner endpoints fail closed with 403. **Deployment must re-seed** — flag to P9.

## Residual risk

- Manager role now holds `settings:write` across all restaurant-settings endpoints (M-01).
- Owner/promotion endpoints are dead in any environment where the seed has not been re-run.
- Error-code drift and the idempotency-optional deviation become contract mismatches if P10 freezes without recording them.
- `order_action_receipts` grows unbounded (pre-existing) and now also carries owner receipts.
- Same-model verification shares blind spots.
