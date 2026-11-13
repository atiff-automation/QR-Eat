# Task — QR-EAT-LOYALTY-PROMO-V1

**Status:** ready_for_implementer
**Revision:** 2
**Approved revision:** 2
**Approved by:** user
**Approval date:** 2026-11-13
**Approval hash:**
**Next actor:** implementer
**Implementer:** ame-implementer
**Implementer session:** P0 `ses_e2de0829dffe62pTHH1kSKamu1` · P1 `ses_e2dd397c9ffeLKmDQzVENUI7Do`
**Verifier session:** P1 `ses_e2dc91ce1ffe9Gj1e62riUs66y` · P1 delta `ses_e2db52e0cffejD8ZjffivRLfsF` · P1b `ses_e2d9888eaffeXI115MtjTbXOdZ` · P2 `ses_e2d80edefffeqjhnMCswstMOQH` · P2 delta `ses_e2d62bad1ffeiujvlS3T8qONA4` · P2 F-01 `ses_e2d437e2affeYGfEQViy33f7aK` · P3 `ses_e2d295544ffe8Vs7xNUksYLs5d` · P3 delta `ses_e2d1c1ca8ffeuxRjKcsA2R9FXy` · P4 `ses_e2ce6bd32ffes2uYjktCXaGJIw` · P4 delta `ses_e2cd8f112ffeyqarWSP10Ll68b` · P5A `ses_e2cbbf3f2ffeSCCW0NziqoU25V` (FAIL) · P5A re-review `ses_e2cac41c7ffevw5PW5VQexObc4`
**Implementer (P1b):** `ses_e2d9b93c9ffedk56s20qDTC4ol`
**Implementer (P2):** `ses_e2d90c157ffedh0iNsagr0ZJjQ`
**Diff base:** fc1312a (task base) · 27cd38a (P2 checkpoint commit)
**Diff hash:** `b6bd9c3b6004a90b1e2a16a4740fbf8f4b14b4bd1d48b5b8d5791f7266263be8` (tracked product, rev 2) · migrations `1dba77cfbcff470bbaf89f8b30e885b03537e49abd11165579c346615b47dde4` · P2 `src/lib/loyalty/**` `b1b452e11e451eedbe4606b4b54ea6cb946656892c6d3ccfb722b83ffc49c42d` · P3 `77695a7b226eb9ce461b75ade930538b5120855ee23092f67d6886797917c41b` · P4 `320268cbb2d3deae98f920e7c0d2610839839c34c84f909fe6fd6493df86f8cd` · P5A `1f46331b82e752ab24cc451e651e8f957bf82964c0691e981ad7516ac82f3606`
**Review file:** `REVIEW-01.md` · `REVIEW-02.md` (P1) · `REVIEW-03.md` (P1b) · `REVIEW-04.md` (P2) · `REVIEW-05.md` (P3) · `REVIEW-06.md` (P4) · `REVIEW-07.md` (P5A, FAIL → corrected)
**Risk:** R3
**Workflow:** FEATURE / ARCHITECTURE
**Updated:** 2026-11-13

> **Contract (frozen):** `../Tabtep-App-loyalty/docs/API-CONTRACT.md` §18.20,
> §18.20.14, §18.20.15 (v1.4.3), Tabtep task revision 14, approved 2026-11-13.
> §18.1–§18.19 are historical and must not be implemented.
> **Product source of truth:** `DIRECTION.md` (2026-11-12).
> **Handoff:** `HANDOFF-QR-EAT.md`.
>
> The contract is frozen. If a clause cannot be implemented, stop and report the
> exact clause and the conflict. Do not change the contract. Do not edit any
> Tabtep worktree, and do not read
> `../Tabtep-App/docs/API-CONTRACT.md` (print worktree; has no §18.20).

## Objective

Implement the approved loyalty, visit and promotion contract in QR-Eat (server +
web), behind a default-off flag, then freeze the API for the Counter.

The single rule: **if a promotion applies to the order/bill, the promotion
applies and the visit does not count; the card stays. If no promotion applies,
the visit counts; on the 3rd visit 10% off (cap RM15) applies and the card
resets.** No customer choice, no cashier choice, no recalculation.

## Decisions and assumptions

Planning approvals on 2026-11-13 (Q1–Q8 as recommended):

- **Q1 — Global flag.** `LOYALTY_ENABLED` env var, default `false`,
  fail-closed (missing/invalid ⇒ loyalty disabled). Global flag **and**
  `LoyaltySettings.enabled` must both be on. No new config table.
- **Q2 — Durable rate limits.** Postgres `RateLimitCounter` table with atomic
  upsert per window. This is an implementation-detail table beyond the
  §18.20.11 list; it carries no contract behaviour. Redis rejected to avoid a
  new runtime dependency on the payment/QR path.
- **Q3 — Tax/service granularity.** "Per order/line" in §18.20.15 D is read as
  **per order line of the bill**: recompute per order from that order's rate
  snapshots. This preserves bit-identical parity with stored orders at zero
  discount. Per-item flooring rejected: it changes existing totals.
- **Q4 — Indexes.** Plain `CREATE INDEX` inside the Prisma migration.
  `CONCURRENTLY` is illegal inside Prisma's migration transaction; the new
  tables are empty and the product has no real users yet. Deviation documented;
  out-of-band script noted for a future large-table case.
- **Q5 — Delegation.** One `ame-implementer` child per phase (P1–P10); one fresh
  `ame-verifier` per gate. Never two implementers on one phase.
- **Q6 — Task shape.** One task, phase-gated. The API surface must complete for
  the contract freeze; web UI (P6) trails but closes before `done`.
- **Q7 — Sensitive files.** Approved to touch `prisma/migrations/**` (P1) and
  the payment routes/services (P5), each behind its own phase review.
- **Q8 — Migration rehearsal.** Throwaway local Postgres only. No apply to any
  shared or production database. If no scratch DB is available, deliver SQL +
  `migrate diff` and record the DB-apply gap as a waiver with a named approver.

Additional settled decisions:

- **Revision 2 — id lists become join tables (closes R-08 and R-02).**
  `Promotion.categoryIds`, `Promotion.itemIds` and `Quote.promotionIds` are stored
  as `PromotionCategory`, `PromotionItem` and `QuotePromotion` join tables, not
  `uuid[]` columns. Reason: `Unsupported("uuid[]")` does not round-trip through
  Prisma, so `migrate diff` from the live DB to the datamodel proposes DROP+ADD on
  all three columns, and `npm run db:migrate` would destroy promotion and quote
  data. `migrate diff` is otherwise empty. §18.20.14 J explicitly permits
  "(or join tables)" for the promotion arrays; the `Quote` join table is a storage
  detail and the wire shape (`promotionIds`, `promotionItems[]`) is unchanged.
  Consequence: no `text = uuid` cast hazard in the eligibility path (R-02 closed).
  Migration 1 is already applied to `qrorder_dev`, so revision 2 lands as a **new**
  migration that creates the join tables and drops the three array columns — no
  history rewrite, no reset, no dev-data loss.
- P1 database evidence exists for revision 1: `migrate deploy` applied 5
  migrations to `qrorder_dev`, `migrate status` reports up to date, and seven
  CHECK constraints were probed with `VALIDATE CONSTRAINT`. Revision 2 must re-run
  the same evidence plus a **non-empty-to-empty** `migrate diff` parity check.
- **P1b closed R-08 and R-02** (`REVIEW-03.md`): migration
  `20261113130000_loyalty_promo_v1_scope_tables` applied to `qrorder_dev`,
  `migrate status` reports 33 migrations and up to date, and `migrate diff` from
  the live DB to the datamodel is empty. Treat `20261113130000` and
  `20261113120000` as frozen: editing either after its apply forces a reset.
  `N-09` requires the join-table deviation to be recorded in P10 against
  §18.20.14 J; `N-10` requires P6 to soft-delete and to rewrite scope rows
  delete-then-insert inside one locked transaction.

- `phoneHash` = `HMAC-SHA-256(LOYALTY_PHONE_HMAC_KEY, E.164)`. New env var,
  fail-closed, documented in `.env.example` only. Never logged. Key rotation and
  rehash/backfill are deferred with a written note.
- Money uses `decimal.js` only. No `Number()` accumulation in money paths;
  the existing float reduction in the bill route is replaced in the touched code.
- Business date comes from `src/lib/time/business-day.ts` +
  `Restaurant.businessDayCloseTime`. No loyalty copy of that logic.
- Reuse `calculateOrderTotals` semantics (floor per component; tax and service
  both on subtotal; total = subtotal + tax + service) — extend, do not duplicate.
- No new npm dependency. `decimal.js`, `zod`, `prisma`, `jest` already present.

## Context budget

**Must read:**

- `AGENTS.md`
- this `TASK.md`
- `../Tabtep-App-loyalty/docs/API-CONTRACT.md` §18.20, §18.20.14, §18.20.15
  (only these; stop reading at §18.20.15 F)
- `../Tabtep-App-loyalty/docs/ai/runs/2026-11-12-loyalty-promo-discount/DIRECTION.md`
- `../Tabtep-App-loyalty/docs/ai/runs/2026-11-12-loyalty-promo-discount/HANDOFF-QR-EAT.md`
- `prisma/schema.prisma`
- `src/lib/order-utils.ts` (existing money semantics)
- `src/lib/time/business-day.ts`
- `src/lib/orders/order-business-day.ts`
- `src/app/api/qr/orders/create/route.ts`
- `src/app/api/counter/tables/[tableId]/bill/route.ts`
- `src/lib/services/payment-batch-service.ts`
- `src/lib/services/counter-order-service.ts`
- `src/lib/order-idempotency.ts`
- `src/lib/rbac/permission-constants.ts`
- the files the current phase names in `Scope`

**Read only if unclear:**

- §18.17.2/§18.17.3 (historical money/privacy corrections that still apply)
- `src/lib/services/offline-order-sync-service.ts`
- `src/app/api/counter/orders/[orderId]/pay/route.ts`
- `src/lib/services/reporting/**`
- `docs/ai/AME/core/VERIFICATION.md` (verifier only)

**Do not read by default:**

- the whole repository; the whole `docs/ai/` tree
- `../Tabtep-App/**` (any branch, including `feat/counter-direct-lan-printing`)
- `../Tabtep-App/docs/API-CONTRACT.md` (frozen print worktree, no §18.20)
- §18.1–§18.19 as requirements
- historical run logs under `docs/ai/runs/GL-AME-BOOTSTRAP-001/`
- `.next/`, `node_modules/`, generated Prisma client, `lint_output*.txt`,
  `tsc_output.txt`

If a required document contradicts `DIRECTION.md`, stop and report it. Do not
guess.

## Scope

Phase-gated. Each phase is one implementer child and one verifier gate.

**P0 — Baseline.** Reproduce `npm run type-check`, `npm test -- --runInBand`,
`npm run build` on `fc1312a`; record numbers and migration count; create
`RUN_LOG.md` entries.

**P1 — Schema and migration (R3).** New models `Customer`, `LoyaltySettings`,
`LoyaltyCard`, `LoyaltyVisit`, `Promotion`, `OrderDiscount`,
`IdempotencyRecord`, `Quote`, `RateLimitCounter`. Additive columns on
`Restaurant` (`cashRounding`), `Order` (`customerId`, `discountSource`,
`discountLabel`, `discountVersion`), `DiningSession` (`customerId`,
`billRevision`, `discountAmount`, `discountSource`, `discountLabel`),
`PaymentBatch` (`businessDate`, `cashPayable`, `roundingAdjustment`, `outcome`).
Enums, CHECKs, composite tenant uniques/FKs, partial unique indexes (raw SQL).
`PromotionCategory`, `PromotionItem` and `QuotePromotion` join tables replace the
`uuid[]` columns (revision 2, R-08); each carries `restaurantId` and composite
tenant FKs so a cross-restaurant id cannot be stored. No backfill.

**P1b — Revert `uuid[]` to join tables (R3, revision 2).** New migration
`loyalty_promo_v1_scope_tables`: create the three join tables with composite
tenant FKs and uniqueness, copy nothing (the array columns are empty), drop
`promotions.categoryIds`, `promotions.itemIds`, `quotes.promotionIds`. Remove the
`Unsupported` fields from the datamodel. Exit: `migrate diff` from live DB to
datamodel is empty; `migrate status` up to date; `validate`/`generate`/type-check
green; tests at baseline.

**P2 — Pricing engine (pure).** `src/lib/loyalty/`: money helpers (floor2,
round5), promotion eligibility for ORDER/CATEGORY/ITEM, best-single with
tie-break (highest discount, then lowest promotion id), `minSpend` on eligible
base, cap, per-order tax/service recompute, reward allocation (proportional,
floor, remainder to headroom desc), visit state machine and `outcome`
precedence. Unit-tested with no DB.

**P3 — Member, consent, quote services.** E.164 normalisation, HMAC `phoneHash`,
masking, consent validation (server-derived version/text hash, constant-time
compare), customer upsert on first confirmed member, card read/create with rule
snapshot, `Quote` issue/consume (128-bit opaque, TTL 10 min, single use, member
binding).

**P4 — QR API.** `POST /api/qr/orders/quote`; extend
`POST /api/qr/orders/create` with `quoteId` + `expectedTotal` + optional
`customerInfo`; add `loyaltyNotice` to `GET /api/qr/[token]`. Guest fallback with
`loyaltyError`; no spend/amount fields in the QR response; `ORDER_CREATE`
idempotent replay.

**P5 — Counter and takeaway API (R3).** Bill read fields for dine-in and
takeaway, `member` / `member/remove` for both, payment with `expectedTotal`,
`expectedCashPayable`, `expectedBillRevision`, `method`; atomic visit/card/
discount/payment write in the contract lock order; `outcome` and `changeGiven`;
cash rounding on `PaymentBatch`; offline replay behaviour.

**P6 — Owner API and web UI.** `GET/PATCH /api/settings/restaurant/loyalty`;
`GET/PUT /api/settings/restaurant/payments` (`cashRounding` + existing
`businessDayCloseTime`); `/api/promotions` CRUD across three scopes;
`/api/members/search`, `[id]`, `[id]/export`, `[id]/withdraw-consent`,
`[id]/marketing-consent`, `DELETE [id]`; `GET /api/reports/loyalty`. QR pages
(review, confirmation, inline consent, per-error copy) and owner dashboard
screens (settings, promotions, members, reports).

**P7 — Security and privacy.** Durable rate limits per §18.20.15 B, trusted edge
IP resolution, enumeration alert, full-phone audit, permission matrix
(`loyalty:configure`, `promotions:manage`, `members:read`, `members:pii`,
`members:export`, `members:delete`, `members:consent_withdraw`,
`loyalty:report`, `loyalty:attach`, `settings:write`), cross-tenant 404, no PII
in logs.

**P8 — Reports.** `gross`, `discounts` by source, `net`, `refunds`, rewards
earned/redeemed, promotion redemptions by scope; remove any double subtraction;
Z/P&L discount line and rounding line.

**P9 — Rehearsal and rollout.** Fresh-DB and upgrade-from-copy migrations on a
throwaway Postgres; flag matrix (`LOYALTY_ENABLED` × `LoyaltySettings.enabled`);
one-restaurant pilot; rollback drill (flag off; existing rows intact).

**P10 — Contract freeze.** Update `docs/PRODUCT/API-CONTRACT.md` and
`docs/PRODUCT/RELEASE-COMPATIBILITY.md` with the loyalty surface; record the
frozen commit hash for the Counter handoff.

**P11 — R3 verification.** Fresh `ame-verifier`, four lenses (Security,
Payments & Reliability, Data & Migration, Product/UX); write `REVIEW-01.md`;
then the commit gate.

## Non-goals

- Counter/Kitchen Android code; any Tabtep worktree edit; the frozen print branch.
- Post-payment correction, `VOIDED` state, refund visit reversal, partial-refund
  subtotal basis.
- Points, tiers, cashback, stored value, coupon codes, BOGO, member-only offers,
  day/time windows, referrals, birthdays, OTP, SMS/WhatsApp, wallet passes.
- Stacking; split-bill allocation; offline loyalty; cashier-entered discount
  amounts.
- Changing zero-discount tax/service semantics; changing existing endpoint
  shapes beyond additive fields.
- OpenAPI generation; whole-repo lint cleanup (AME-002); credential rotation
  (AME-001); the canonical contract rewrite beyond the P10 index update.

## Ownership

**Files/modules owned:**

- `prisma/schema.prisma`, `prisma/migrations/**` (P1)
- `src/lib/loyalty/**` (new)
- `src/lib/services/loyalty-*.ts` (new)
- `src/app/api/qr/orders/quote/route.ts` (new)
- `src/app/api/qr/orders/create/route.ts`
- `src/app/api/qr/[token]/route.ts`
- `src/app/api/counter/loyalty/notice/route.ts` (new)
- `src/app/api/counter/tables/[tableId]/bill/route.ts`
- `src/app/api/counter/tables/[tableId]/member/route.ts` (new)
- `src/app/api/counter/tables/[tableId]/member/remove/route.ts` (new)
- `src/app/api/counter/orders/[orderId]/bill/route.ts` (new)
- `src/app/api/counter/orders/[orderId]/member/route.ts` (new)
- `src/app/api/counter/orders/[orderId]/member/remove/route.ts` (new)
- `src/app/api/counter/orders/[orderId]/pay/route.ts`
- `src/app/api/counter/payments/route.ts`
- `src/lib/services/payment-batch-service.ts`
- `src/lib/services/counter-order-service.ts`
- `src/lib/services/offline-order-sync-service.ts`
- `src/lib/services/reporting/**` (P8 only)
- `src/app/api/settings/restaurant/loyalty/route.ts` (new)
- `src/app/api/settings/restaurant/payments/route.ts`
- `src/app/api/promotions/**` (new)
- `src/app/api/members/**` (new)
- `src/app/api/reports/loyalty/route.ts` (new)
- `src/lib/rbac/permission-constants.ts`, `prisma/seed.ts` (permissions only)
- `src/app/qr/[token]/**` (UI states)
- `src/app/dashboard/**` and `src/app/restaurant/**` (loyalty surfaces only)
- `src/components/**` (loyalty components only)
- tests for the above
- `docs/ai/runs/QR-EAT-LOYALTY-PROMO-V1/**`
- `docs/PRODUCT/API-CONTRACT.md`, `docs/PRODUCT/RELEASE-COMPATIBILITY.md` (P10)
- `.env.example` (new variable names only, no values)

**Do not touch:**

- `../Tabtep-App/**` — any branch, any file, including
  `feat/counter-direct-lan-printing`.
- `src/lib/auth.ts`, `src/lib/auth-utils.ts`, `src/lib/device-auth.ts`,
  `src/lib/rbac/**` other than `permission-constants.ts` and the permission rows
  in `prisma/seed.ts`.
- `QR-Eat-Kitchen-App/`, `.next/`, `node_modules/`, generated Prisma client.
- `.env`, `.env.local`, `.railway-env-*.txt`, `lint_output*.txt`,
  `tsc_output.txt`.
- Existing applied migrations' SQL.
- Unrelated modules, styles, or refactors.

## Acceptance criteria

1. QR order create accepts optional phone + loyalty consent in the **same** call;
   no second attach, no claim store, no order token, no pending-member step.
2. `POST /api/qr/orders/quote` returns one server quote with `quoteId`,
   `projectedTotal`, `cashPayable`, `visitState`, `rewardLabel` and the
   authoritative `message`; no spend, `daySubtotal`, `minDailySpend` or
   `amountToMinimum`.
3. Quote evaluates the whole current bill/session; order create validates
   `quoteId` + `expectedTotal`; stale/expired/member-mismatched quote returns
   `QUOTE_CHANGED`; a consumed quote cannot be reused, even with a new
   idempotency key.
4. Promotions work at `ORDER`, `CATEGORY` and `ITEM` scopes with eligible base,
   `minSpend`, cap, best-single, no stacking, and tie-break by highest discount
   then lowest promotion id.
5. A promotion **applies** only when eligible base > 0, conditions are met, and
   discount > 0. Scheduled-but-inapplicable promotions do not block the visit.
6. Partial order with any eligible item ⇒ promotion applies ⇒ visit does not
   count. No eligible items ⇒ visit counts.
7. Promotion applies ⇒ no `LoyaltyVisit`, card unchanged, no reset. No promotion
   ⇒ visit counts; on `visitsRequired` the reward applies and the card resets.
8. One visit per customer per business date, enforced by unique constraints and
   the customer/day lock; a second order the same day creates no second visit.
9. `daySubtotal` aggregates paid, non-cancelled, not fully refunded orders on the
   payment business date, before tax/service/discount; below `minDailySpend` ⇒
   no visit (`BELOW_MINIMUM`).
10. The card snapshots the rule at cycle start; settings changes apply to new
    cycles only; before the first card, current settings decide and the first
    visit snapshots.
11. Bill read returns `billRevision`, `member`, `visitState`,
    `promotionScope`/`promotionItems`, `discountLines[]`, `projectedRewardAmount`,
    `projectedTotal`, `preRewardTotal`, `preRewardCashPayable`, `fullPriceTotal`,
    `totalAmount`, `cashPayable`, and (Counter only) `daySubtotal`,
    `minDailySpend`, `amountToMinimum`.
12. Payment validates `expectedTotal`, `expectedCashPayable`, `expectedBillRevision`
    under the lock and returns `BILL_CHANGED`/`AMOUNT_MISMATCH` **before**
    recording any payment. No partial benefit.
13. Payment writes visit, card mutation, `OrderDiscount`, `Payment` rows,
    `PaymentBatch` and the `PAYMENT` idempotency record in one transaction, in
    the contract order: customer/day lock → bill lock → validate → batch
    businessDate/rounding → visit → card → discount → payments → idempotency.
14. `discountSource`/`LOYALTY_REWARD` rows carry `sourceId = LoyaltyVisit.id` and
    `rewardSnapshot`; exactly one of `promotionSnapshot`/`rewardSnapshot` is
    non-null and matches `source`; one ACTIVE discount per order.
15. Money identities hold: `Σ allocation == reward`, allocation ≤ order subtotal,
    `Order.discountAmount == Σ ACTIVE OrderDiscount.amount`,
    `Σ Order.totalAmount == PaymentBatch.totalAmount == Σ Payment.amount`.
16. Cash: discount before tax/service; tax/service recomputed per order from rate
    snapshots; `cashPayable = round5(projectedTotal)` under `NEAREST_5_SEN`
    (equals total under `NONE`); card/e-wallet exact; `roundingAdjustment`
    recorded and within ±0.02; drawer identity
    `Σ cashPayable == Σ cashReceived − Σ changeGiven`.
17. Consent: notice version/text/hash/privacyUrl are server-derived and
    validated in constant time. Missing/stale consent at QR create ⇒ guest order
    + `loyaltyError` (200), no member/consent/visit. Explicit consent capture
    with stale consent ⇒ `CONSENT_STALE` (422). Counter attach without consent
    stays `GUEST`. Withdrawal effects per §18.20.14 B.
18. Security: phone HMAC + masking (country code + last two), full phone only
    with `members:pii` and audited, cross-tenant 404, deny-by-default permission
    table, durable rate limits per §18.20.15 B, trusted edge IP only, no PII in
    logs/evidence.
19. Offline: offline-created order is full price with no visit/discount; an
    online-priced order paid offline keeps its locked promotion and collects
    `preRewardTotal`/`preRewardCashPayable`; no reward, no visit; an ACTIVE
    discount is never removed; a replayed projected reward is rejected or
    flagged, never silently settled.
20. Reports reconcile: `gross`, `discounts` by source, `net`, `refunds` (negative
    payments as positive magnitude), rewards earned/redeemed, promotion
    redemptions by scope; no discount subtracted from net; no double subtraction.
21. Feature flag `LOYALTY_ENABLED` defaults false and requires
    `LoyaltySettings.enabled`; flag off reproduces pre-feature behaviour exactly.
22. Migration is additive with no backfill; pre-migration rows stay valid; both
    fresh-DB and upgrade paths pass on a throwaway Postgres; rollback = flag off.
23. Deployment-order safety: existing Counter builds that omit the new fields
    keep working (additive only; absent fields default to `0.00`/null).
24. UX: `visitState`/`outcome` precedence honoured (`GUEST` > `PROMOTION` >
    `ALREADY_COUNTED` > `BELOW_MINIMUM` > `COUNTS`; `PROMOTION_APPLIED` >
    `REWARD_APPLIED` > `VISIT_COUNTED` > `ALREADY_COUNTED` > `BELOW_MINIMUM` >
    `GUEST` > `NO_BENEFIT`); copy rendered from snapshots, never hardcoded
    "3rd"/"10%"/"RM20"; accessibility per §18.20.13.
25. Promotion scope membership is stored in join tables
    (`PromotionCategory`, `PromotionItem`, `QuotePromotion`) with composite tenant
    FKs; a category, item or promotion id belonging to another restaurant cannot
    be stored. The API still returns `promotionItems[]` and `promotionIds` as
    arrays.
26. The datamodel and the database agree: `prisma migrate diff` from the live DB
    to `prisma/schema.prisma` is empty, and no `Unsupported` field remains in the
    loyalty models. `npm run db:migrate` must be safe to run.
27. No `text = uuid` comparison is needed anywhere in the eligibility path; scope
    lookups use ordinary foreign keys.

## Constraints

- Server is the system of record. Clients render state and send intents.
- Every mutating request carries an idempotency key; retries are safe.
- All queries tenant-scoped by `restaurantId`; composite FKs; cross-tenant tests.
- Phone numbers are PII: normalise, hash, mask; never log or evidence a full
  number. No secrets in prompts, logs, or run logs.
- `decimal.js` only for money; floor to 2dp; same rounding on quote/order/payment.
- Lock order is always customer/day → bill/order. Never invert it.
- Business rules live in `src/lib`, not route handlers.
- No new dependency without approval. No silent scope expansion.
- Do not claim a test passed unless it was run. Do not run
  `npm test -- --runInBand` and report it as `test:ci`.
- Whole-repo lint is red at baseline (62 errors, 11 warnings); it is not a gate.
  Scoped lint on changed files only, reported honestly.

## Required patterns

- **Components:** reuse existing bill/total components and dashboard primitives
  in `src/components/ui`; no second bill state.
- **Endpoints:** paths exactly as in §18.20.5–§18.20.7 and `Scope`.
- **Error format:** `{ success: false, error, code }`; error codes exactly as
  §18.20.12.
- **Data conventions:** money as decimal strings at the API boundary; `Decimal`
  in Prisma; phone E.164; business date from the shared helper; `quoteId` /
  `billRevision` for price locks.
- **Locks:** `pg_advisory_xact_lock(hashtext(key))` per
  `payment-batch-service.ts`.
- **Idempotency:** `Idempotency-Key` header, `IN_PROGRESS` → `COMPLETED`,
  5-minute takeover, 24-hour retention.
- **Other:** partial unique indexes via raw SQL; audit rows in the same
  transaction; permissions from `permission-constants.ts`.

## Process and skills

**Required skills:**

- Lead: `ame-grilling`, `ame-engineering-discipline`, `ame-handoff`
- Implementer: `ame-engineering-discipline`; `ame-debugging` when a test goes red
- Verifier: `ame-verification`

**Waivers:**

- Step: whole-repo lint as a gate
- Reason: pre-existing red baseline (62 errors, 11 warnings) tracked as AME-002
- Approved by: user (2026-11-13, plan approval)

## Verification

**Commands:**

```bash
npm run type-check
npm test -- --runInBand
npm run test:ci
npm run build
npx prisma validate
npx prisma generate
npx jest <phase-specific paths>
npm run lint -- --file <changed files>    # scoped only, non-blocking baseline
```

**Evidence required:**

- command output for every command actually run, with exit status;
- migration SQL + `prisma migrate diff` result + scratch-DB apply log;
- zero-discount parity test output;
- seeded end-to-end run: 3rd visit reward + reset, promotion blocks visit,
  below minimum, guest + promotion, cash rounding, stale projection before
  charge, offline replay;
- route/field inventory matching §18.20.5–§18.20.7;
- permission matrix test output;
- report reconciliation test output;
- frozen contract commit hash for the Counter handoff;
- `REVIEW-*.md` per gate.

**Review focus:**

- money correctness and cent-exact identities;
- lock order and payment atomicity (`BILL_CHANGED` before charge);
- promotion/visit rule, including partial order and multi-order bills;
- card snapshot vs live settings;
- consent, masking, tenant isolation, rate limits;
- offline replay never adding or removing a benefit;
- report reconciliation and double subtraction;
- additive-only compatibility with existing clients;
- migration safety and rollback.

## Approval

**Approval applies to this exact revision only.** A material change requires a new
revision and new approval.

Approved revision: 2 (approved by user, 2026-11-13)
Next actor: implementer

Revision 1 was approved on 2026-11-13 and implemented through P1. Revision 2 is a
material change to the approved data model: the `uuid[]` id lists become join
tables (R-08, recorded in `RUN_LOG.md` and `REVIEW-02.md`). It was approved on
2026-11-13 and supersedes revision 1 for phases P1b onward. The P1 revision-1 work
is not invalidated; it is amended by P1b.

Header is `ready_for_implementer`. Sensitive phases (P1b migration, P5 payment
paths) each require their own approval before the implementer starts.

## Commit gate

- [ ] Implementer is `ame-implementer`, not the Lead
- [ ] Implementer session recorded
- [ ] Verifier is a fresh `ame-verifier`
- [ ] Verifier session recorded
- [ ] Review PASS
- [ ] Review diff hash matches the current diff
- [ ] Changed files are within the owned files
- [ ] Exact path list published
- [ ] Exact commit message published
- [ ] Commit authorization recorded (R2/R3)
- [ ] Human approved
- [ ] No unrelated changes

**Commit authorized by:**
**Authorization date:**
**Authorization scope:**

## Return format

```text
Summary:
Files changed:
Commands run and results:
Deviations:
Blockers:
Residual risks:
Recommended next action:
```
