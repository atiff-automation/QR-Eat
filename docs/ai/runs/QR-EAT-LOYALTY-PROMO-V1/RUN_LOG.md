# Run Log — QR-EAT-LOYALTY-PROMO-V1

**Title:** Loyalty, visits and promotions v1 (server + web)
**Type:** feature / architecture
**Risk:** R3
**Spec level:** L3
**Owner:** Lead (AME)
**Date:** 2026-11-13
**Branch/commit:** `feat/loyalty-promo-v1` @ `fc1312a`
**Task revision:** 1
**Approved revision:** — (pending)
**Task contract:** `TASK.md`
**Resume bookmark:** `NEXT.md`
**Latest review:** none yet

## Request

Plan and implement the approved loyalty/visit/promotion contract (`QR-EAT-LOYALTY-PROMO-V1`)
in QR-Eat against the frozen Tabtep contract §18.20 (§18.20.14, §18.20.15),
then freeze the API for the Counter. Planning only at this entry; no code.

## Classification

- Type: FEATURE + ARCHITECTURE. New user-facing capability plus a data model and
  money-containment change.
- Level: L3 — normative contract, schema/migration, money, PII.
- Risk: R3 — payment correctness, migration, PII, tenant isolation.

## Scope

In scope:

- data model + migration for Customer, LoyaltySettings, LoyaltyCard,
  LoyaltyVisit, Promotion, OrderDiscount, IdempotencyRecord, Quote,
  RateLimitCounter; additive columns on Restaurant/Order/DiningSession/PaymentBatch
- shared pricing/promotion/tax/reward/rounding engine
- QR quote + order create + loyalty notice
- Counter and takeaway bill/member/payment
- owner settings, promotions (3 scopes), members, loyalty reports
- security/privacy: consent, HMAC, masking, permissions, rate limits
- feature flag, pilot, rollback, migration rehearsal
- contract sync and freeze

Non-goals:

- Counter/Kitchen Android code; any Tabtep worktree edit; frozen print branch
- post-payment correction, `VOIDED`, refund visit reversal, partial refunds
- points/tiers/coupons/BOGO/stacking/split-bill/offline loyalty
- changing zero-discount tax/service semantics; OpenAPI generation; lint cleanup

## Context

**Context budget used:**

- Must read: `AGENTS.md`, `PROJECT_PROFILE.md`, `GLOSSARY.md`, `BACKLOG.md`,
  contract §18.20/§18.20.14/§18.20.15, `DIRECTION.md`, `TASK.md` rev 14,
  `HANDOFF-QR-EAT.md`, `REVIEW-PLAN-4.md`, `docs/PRODUCT/API-CONTRACT.md`,
  `docs/PRODUCT/CROSS-REPO-WORKFLOW.md`, AME `WORKFLOWS`/`RISK_AND_APPROVALS`
- Read only if unclear: not used yet
- Do not read by default: §18.1–§18.19, `../Tabtep-App/**` (all branches),
  historical run logs, generated output

**Relevant code inspected:**

- `prisma/schema.prisma` — 61 models/enums, 31 migrations; `Order.discountAmount`
  already exists; `Restaurant.businessDayCloseTime`, `taxRate`,
  `serviceChargeRate`, `timezone` present; `PaymentBatch` lacks
  `businessDate`/`cashPayable`/`roundingAdjustment`/`outcome`;
  `Restaurant.cashRounding` absent
- `src/lib/order-utils.ts:20` — `calculateOrderTotals`: decimal.js, floor per
  component, tax and service both on subtotal, total = sub + tax + svc
- `src/lib/time/business-day.ts`, `src/lib/orders/order-business-day.ts`
- `src/lib/services/payment-batch-service.ts` — `pg_advisory_xact_lock(hashtext(...))`
  at lines 249 and 621; `auditLog.create` inside tx
- `src/lib/order-idempotency.ts` — `Idempotency-Key` header pattern
- `src/app/api/counter/tables/[tableId]/bill/route.ts:134-149` — totals summed
  with `Number()` reductions (float drift risk)
- `src/lib/security.ts:5` — rate limiter is an in-process `Map` (not durable)
- `src/lib/rbac/permission-constants.ts`, `prisma/seed.ts` — permission model
- `jest.setup.js:4` — dummy `DATABASE_URL`; tests mock Prisma, so DB
  constraints cannot be proven by `npm test`

## Investigation / specification

Findings:

- The contract is implementable. Two clauses needed an interpretation, both
  recorded and approved: per-order (not per-item) tax/service recomputation (Q3),
  and plain indexes instead of `CONCURRENTLY` under Prisma's transactional
  migrations (Q4).
- Durable rate limits (§18.20.15 B) have no existing durable store; the in-memory
  limiter cannot satisfy it. Approved: new `RateLimitCounter` table (Q2).
- No feature-flag infrastructure exists. Approved: `LOYALTY_ENABLED` env var,
  default false, fail-closed (Q1).
- `Order.discountAmount` already exists, so the migration must not add it twice
  and the feature must not double-count it.

Uncertainty:

- Scratch Postgres availability for P1/P9 evidence (Q8) is unconfirmed.
- Existing report code may already subtract discounts from net; to be audited in
  P8 rather than assumed.

## Plan

Phases P0–P11 as written in `TASK.md`. Lock order: customer/day → bill/order.
Money via decimal.js only. All new money paths cent-exact with identity
assertions. Flag off must reproduce current behaviour exactly.

## Approvals

| Gate | What was approved | Approved by | Date | Conditions |
|---|---|---|---|---|
| Plan | Classification, phases, ownership, sensitive areas, Q1–Q8 | user | 2026-11-13 | Q1–Q8 as recommended |
| Task revision | revision 1 | user | 2026-11-13 | approved as written |
| Migration | P1 schema + migration authoring; option A rehearsal (no docker, local Postgres, no real users) | user | 2026-11-13 | additive only, no backfill; **DB apply still unauthorized** — no credential path agreed |
| Payment files | — | — | — | pending (P5) |
| Commit | — | — | — | pending (R3) |

## Commit gate

- [ ] Review PASS
- [ ] Exact path list published
- [ ] Exact commit message published
- [ ] Human approved
- [ ] No unrelated changes

## Baseline (2026-11-13, fc1312a)

P0 reproduction on `feat/loyalty-promo-v1` @
`fc1312ad88907f7d4bc8d01008cc0b77e6a6c2d3` (`fc1312a`). Working tree at run
time had no product changes (only Lead-owned `docs/ai/ACTIVE.md` modified and
this run directory untracked).

| Check | Command | Result | Exit |
|---|---|---|---|
| Branch | `git rev-parse --abbrev-ref HEAD` | `feat/loyalty-promo-v1` (matches) | 0 |
| Commit | `git rev-parse HEAD` | `fc1312ad88907f7d4bc8d01008cc0b77e6a6c2d3` (matches `fc1312a`) | 0 |
| Type-check | `npm run type-check` (`tsc --noEmit`) | PASS, no diagnostics | 0 |
| Test | `npm test -- --runInBand` | PASS — 58 suites (57 passed, 1 skipped); 535 tests (524 passed, 11 skipped, 0 failed); snapshots 0; 6.062 s | 0 |
| Build | `npm run build` (`next build`) | PASS — compiled and prerendered all routes; middleware 42.3 kB | 0 |
| Migrations | `ls prisma/migrations \| wc -l` | 31 entries = 30 migration directories + `migration_lock.toml` | 0 |

Baseline comparison: identical to `PROJECT_PROFILE.md` (2026-11-10, `5dd1b76`)
— 57 suites passing, 524 tests passing, 11 skipped, type-check and build green.
No regression on `fc1312a`. Lint was **not** run as a gate (known-red baseline,
out of scope for P0).

## Execution

**P0 implementer:** `ame-implementer`, session `ses_e2de0829dffe62pTHH1kSKamu1`
(2026-11-13). Verifier: waived — P0 changed no product code and produced only
reproduced command output; Lead re-checked the evidence first-hand (see
"Process deviation" below).

Files changed:

- `docs/ai/ACTIVE.md` (pointer)
- `docs/ai/runs/QR-EAT-LOYALTY-PROMO-V1/TASK.md`
- `docs/ai/runs/QR-EAT-LOYALTY-PROMO-V1/NEXT.md`
- `docs/ai/runs/QR-EAT-LOYALTY-PROMO-V1/RUN_LOG.md`
  (P0 added the baseline section and P0 execution/verification entries)

Commands run:

```text
pwd / git rev-parse --abbrev-ref HEAD / git status --porcelain   → gate PASS
git -C /home/atiff/Desktop/QR-Eat worktree list                  → canonical + stale linked worktree
wc -l, grep, sed, ls, find (read-only inspection)                → no product change
```

No product code, migrations, tests, or commits.

**P0 — baseline reproduction (2026-11-13, `fc1312a`):**

Read-only checks. No product code, schema, migrations, tests, or config touched.

```text
git rev-parse --abbrev-ref HEAD
  -> feat/loyalty-promo-v1
git rev-parse HEAD
  -> fc1312ad88907f7d4bc8d01008cc0b77e6a6c2d3
npm run type-check
  -> PASS (tsc --noEmit, no diagnostics), exit 0
npm test -- --runInBand
  -> PASS, exit 0
     Test Suites: 1 skipped, 57 passed, 57 of 58 total
     Tests:       11 skipped, 524 passed, 535 total
     Snapshots:   0 total
     Time:        6.062 s
npm run build
  -> PASS (next build), exit 0
ls prisma/migrations | wc -l
  -> 31
```

Migration count detail: `ls prisma/migrations | wc -l` = 31 entries, comprising
30 migration directories plus `migration_lock.toml`
(`find prisma/migrations -maxdepth 1 -mindepth 1 -type d | wc -l` = 30).

Not run, per scope: `prisma migrate*`, `prisma db push`, `prisma db seed`,
`db:reset`, and `npm run lint` (known-red baseline, not a gate).

**P1 — schema and migration (2026-11-13, `fc1312a` base):**

Implementer `ses_e2dd397c9ffeLKmDQzVENUI7Do`. Authored, not applied.

```text
prisma/schema.prisma                                   modified (437+/47-, 20 hunks)
prisma/migrations/20261113120000_loyalty_promo_v1/     new
prisma/migrations/20261113120100_loyalty_promo_v1_indexes/  new
```

Content: 11 enums, 9 new tables (incl. `RateLimitCounter` per Q2), additive columns on
`Restaurant`/`DiningSession`/`Order`/`PaymentBatch`, seven `@@unique([restaurantId, id])`,
composite tenant FKs with `onDelete: Restrict` plus the hard/soft split, two partial unique
indexes and 16 CHECK constraints in raw SQL. Additive only; no backfill; no `src/**`.

```text
npx prisma validate                                        -> valid, exit 0
npx prisma migrate diff (HEAD schema -> current) --script   -> 369 lines; migration 1 body byte-identical
npx prisma generate                                        -> ok, v6.11.1
npm run type-check                                         -> PASS, exit 0
npm test -- --runInBand                                    -> PASS 57/58 suites, 524 passed, 11 skipped
database                                                   -> NOT TOUCHED (no migrate deploy/dev, no psql)
```

Reviews: `REVIEW-01.md` (PASS WITH NOTES; R-01…R-07) and `REVIEW-02.md` (delta,
PASS WITH NOTES; R-03/R-04/R-07 resolved). Correction cycle 1 applied R-03
(tenant-scoped `rate_limit_counters` + `scope` CHECK), R-04 (rounding identity CHECK),
R-07 (drive-out realignment removed).

Carried forward: R-01 cascade-vs-restrict delete decision (human), R-02 `text = uuid`
in `uuid[]` access (P2/P3), R-05 raw-SQL drift + DB apply (gate condition 2), R-06
128-bit quote id (P3), N-02/N-03 rate-limit typing + enumeration alert (P7), N-04
5-sen grid (P5).

**P1 gate status:** condition 1 satisfied; condition 2 (scratch-DB apply) OPEN — no
authorized credential path. Task set to `owner_decision_required`.

**P1 DB apply — authorized (A1a), 2026-11-13:**

User authorized option A1 → A1a: apply all pending migrations to the local dev
database `qrorder_dev`, because the database was already 3 migrations behind the
repo (not mine): `add_skipped_print_status`, `backfill_skipped_print_status`
(a bounded `UPDATE order_events ... WHERE printError = 'KDS only — not printed'`),
`add_counter_reference`.

```text
npx prisma migrate deploy
  -> 5 migrations applied, "All migrations have been successfully applied."
npx prisma migrate status
  -> "Database schema is up to date!" (32 migrations)
npx prisma db execute (VALIDATE CONSTRAINT probes, 7 constraints)
  -> "Script executed successfully."
```

Probed: `order_discounts_snapshot_check`, `order_discounts_amount_check`,
`loyalty_cards_visitsInCycle_check`,
`payment_batches_roundingAdjustment_check`, `rate_limit_counters_scope_check`,
`loyalty_settings_visitsRequired_check`, `promotions_endsAt_check` — all exist and
validate. Partial unique indexes were created by the deploy (a failed
`CREATE UNIQUE INDEX` would have aborted the migration).

**Finding R-08 (blocking, new): destructive drift on the `uuid[]` columns.**`npx prisma migrate diff --from-schema-datasource … --to-schema-datamodel …` is
**not** empty. It proposes, for `promotions.categoryIds`, `promotions.itemIds` and
`quotes.promotionIds`:

```sql
ALTER TABLE "promotions" DROP COLUMN "categoryIds",
ADD COLUMN     "categoryIds" uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];
```

`Unsupported("uuid[]")` does not round-trip: Prisma cannot match the introspected
column to the datamodel, so it emits DROP + ADD. Removing the `dbgenerated`
default does not help (tested) — it drops the default and still DROP/ADDs.
Consequence: `npm run db:migrate` (`prisma migrate dev`) will propose dropping
three columns and, if accepted, destroy promotion and quote data. This is worse
than the index-drift risk R-05 described. Not yet resolved; needs a data-model
decision (TASK.md revision 2).

## Verification

P0 verdict: PASS — baseline reproduced on `fc1312a`. Lead-recorded after
first-hand corroboration: `git status` clean of product changes, `HEAD`
`fc1312a`, `.next/BUILD_ID` present with a fresh build timestamp, and the
recorded test/type-check numbers match `PROJECT_PROFILE.md` exactly.

**Process deviation (P0, recorded):** the handoff asked the implementer to write
`RUN_LOG.md`. The `ame-implementer` agent denies `edit` on `docs/ai/**`, so the
child applied the text through a Python in-place rewrite over the shell instead
of stopping. Content was verified accurate and is kept, but routing around a deny
rule is not acceptable. Corrective action: task-state files stay Lead-owned;
future handoffs must say "do not write under `docs/ai/**` — return evidence in
your response", and a child that hits a denied edit must report, not work around
it.

| Command | Outcome |
|---|---|
| `git rev-parse --abbrev-ref HEAD` | `feat/loyalty-promo-v1` (matches required branch) |
| `git rev-parse HEAD` | `fc1312a…` (matches required commit `fc1312a`) |
| `npm run type-check` | PASS, exit 0 |
| `npm test -- --runInBand` | PASS, exit 0 — 57/58 suites, 524 passed, 11 skipped |
| `npm run build` | PASS, exit 0 |
| `ls prisma/migrations \| wc -l` | 31 entries (30 migrations + `migration_lock.toml`) |

No acceptance criterion is claimable at P0; nothing has been implemented. The
baseline is reproducible and matches `PROJECT_PROFILE.md`.


Implementation verdict: not yet verified (no implementation)

Findings:

- none yet

Evidence:

- workspace gate output
- contract and code inspection notes above

Not verified:

- everything in the acceptance criteria; nothing has been implemented

## Residual risk

- Phone-only identity is accepted per the contract; a wrongly consumed reward is
  permanent in v1 (no correction path).
- Float accumulation exists today in the bill route; it is contained only in the
  files this task touches.
- The stale linked worktree `.../worktree/770812/cosmic-squid` still exists
  (clean, detached at `fc1312a`); harmless but should be removed eventually.

## Release

- Deployed: no
- Smoke test: n/a
- Rollback: n/a (flag not built yet)
- Monitoring: n/a

## Lessons

- What worked: stopping on the workspace gate instead of planning outside the
  canonical checkout; verifying money semantics in code before accepting the
  contract's wording.
- What to change: confirm the scratch Postgres before P1 starts.
- Follow-ups: AME-002 (lint baseline), stale worktree removal.

**P1b — join tables replace `uuid[]` (revision 2, 2026-11-13):**

Implementer `ses_e2d9b93c9ffedk56s20qDTC4ol`. Verifier `ses_e2d9888eaffeXI115MtjTbXOdZ`.

```text
prisma/schema.prisma                                        modified (rev 2 delta)
prisma/migrations/20261113130000_loyalty_promo_v1_scope_tables/   new (121 lines)
```

New join tables `PromotionCategory`, `PromotionItem`, `QuotePromotion`, each with
`restaurantId` and composite tenant FKs; `@@unique([restaurantId, id])` added to
`MenuCategory` and `MenuItem` as the parent keys; the three `Unsupported("uuid[]")`
columns dropped without `CASCADE` (empty by design, no code path ever wrote them);
no `Unsupported` field remains.

```text
npx prisma validate                     -> valid, exit 0
npx prisma generate                     -> ok, v6.11.1
npm run type-check                      -> PASS, exit 0
npm test -- --runInBand                 -> PASS 57/58 suites, 524 passed, 11 skipped
npx prisma migrate deploy               -> applied 20261113130000, success
npx prisma migrate status               -> "33 migrations" / "Database schema is up to date!"
npx prisma migrate diff (live -> model) -> "-- This is an empty migration."   <-- the phase goal
```

`REVIEW-03.md`: PASS WITH NOTES; **R-08 and R-02 CLOSED**; N-08 (apply recorded, not
`db push`) closed by Lead with `migrate status`. Notes carried: N-09 (contract
self-contradiction, record in P10 against §18.20.14 J), N-10 (P6 soft delete +
transactional scope rewrite), N-11 (intentional unused composite unique),
N-12 (pre-existing `expenses` index drift, backlog).

**P1 gate: PASS.** Frozen: `20261113120000`, `20261113120100`, `20261113130000`.


**P2 — pure pricing engine (2026-11-13):**

Implementer `ses_e2d90c157ffedh0iNsagr0ZJjQ`. Verifiers `ses_e2d80edefffeqjhnMCswstMOQH`
(full) and `ses_e2d62bad1ffeiujvlS3T8qONA4` (delta). Two correction cycles.

```text
src/lib/loyalty/{money,promotion,tax,reward,visit,message}.ts        new
src/lib/loyalty/__tests__/{...}.test.ts                              new (6 suites)
```

Pure functions only: Decimal money helpers, promotion evaluation for ORDER/CATEGORY/ITEM
with best-single and tie-break, per-order tax/service recompute with zero-discount parity,
reward projection/allocation, visit+outcome state machines, snapshot-driven copy builders.
No DB, no Prisma, no routes.

```text
npx jest src/lib/loyalty --runInBand   -> 6 suites, 166 tests, all pass
npm run type-check                     -> PASS, exit 0
npm test -- --runInBand                -> 63 passed / 1 skipped suites, 690 passed, 11 skipped
npx eslint src/lib/loyalty             -> exit 0
npx prettier --check src/lib/loyalty   -> clean
```

Verifier evidence: zero-discount parity over 84 targeted + 2,000 random carts (0 divergences);
allocation exhaustive sweep 8,800 + randomized 3dp 19,959 runs (0 throws, all 2dp); precedence
brute force 64/64; `round5` boundary table; no `Number` in money paths; no new dependency;
`order-utils.ts` untouched.

`REVIEW-04.md`: PASS WITH NOTES. Cycle 1 fixed F-02…F-11; cycle 2 fixed R-01 (3dp clamp leak),
R-02 (disabled-copy precedence across four surfaces), R-03 (non-red-capable 3dp test).

**Open: F-01** — `projectReward` does not apply `maxDiscount` to a FIXED reward, while
`evaluatePromotion` caps FIXED. Product decision required before P5; the implementer
correctly left it untouched.

**Open: R-04** — the P2 module is untracked, so review deltas cannot be diff-bound. A
checkpoint commit would fix it and is not yet authorized (R3 commit gate).


**Commit — P2 checkpoint (2026-11-13):**

```text
commit 27cd38a  feat(loyalty): schema, migrations and pricing engine (P0-P2)
base   fc1312a
24 files changed, 5529 insertions(+), 51 deletions(-)
```

Authorized by user ("do as recommended. approve"). Exact path list published before the
commit; no unrelated files. Reviewed hash `b1b452e1…c42d` for `src/lib/loyalty/**`
recomputed from the commit and **matches**; the pre-commit hooks (`eslint --fix`,
`prettier --write`) changed nothing, and the working tree is clean. R-04 closed.

F-01 closed: `maxDiscount` caps both reward types (`REVIEW-04.md`, verifier
`ses_e2d437e2affeYGfEQViy33f7aK`). Carried into P4/P5: `applies` means "non-zero reward
projected" while `nextCardState.resets` means "cycle completes" — reset must be driven by
`nextCardState`, never by `applies` (N-2).


**P3 — member, consent and quote services (2026-11-13):**

Implementer `ses_e2d351d28ffeHwZGbrwodB9a3S`. Verifiers `ses_e2d295544ffe8Vs7xNUksYLs5d`
(full) and `ses_e2d1c1ca8ffeuxRjKcsA2R9FXy` (delta). One correction cycle.

```text
src/lib/loyalty/{flags,phone,consent}.ts                    new
src/lib/services/loyalty-customer-service.ts                new
src/lib/services/loyalty-quote-service.ts                   new
5 test suites                                               new
```

```text
npx jest src/lib/loyalty src/lib/services/__tests__ --runInBand -> 11 suites, 279 tests
npm run type-check                                             -> PASS
npm test -- --runInBand                                        -> 68 passed / 1 skipped, 803 passed, 11 skipped
```

Security evidence: no full phone in any throw/message/return; HMAC fails closed on missing,
empty or whitespace key with no fallback; consent hash compared with `timingSafeEqual` and
server-derived values persisted; every customer/quote query tenant-scoped; 128-bit quote id;
TTL 10 min; single use; `customerId` over `phoneHash`; `QuotePromotion` rows written;
`cartHash` order-independent. Mask sweep over 1,111,110 inputs found no leak.

`REVIEW-05.md`: PASS WITH NOTES. F-01 (mask hid nothing for short inputs) and F-02
(concurrent anonymise could attach an ANONYMIZED customer) fixed.

Carried forward:
- **P4:** F-03 validate `expectedTotal`; F-04 session/table binding in `consumeQuote`;
  **N-01** do not render "Loyalty is off" for the member-resolution race; F-07 assert
  tenant-scoped `where` in cross-tenant tests.
- **P6:** F-05 null `Order.customerName`/`customerPhone` in the delete flow.
- **P10:** N-01 contract gap (no code for "member could not be resolved").


**P4 — QR quote and create API (2026-11-13):**

Implementer `ses_e2d02ef0dffeL7EDq3XYrSlqSk`. Verifiers `ses_e2ce6bd32ffes2uYjktCXaGJIw`
(full) and `ses_e2cd8f112ffeyqarWSP10Ll68b` (delta). One correction cycle.

```text
new      src/app/api/qr/orders/quote/route.ts
modified src/app/api/qr/orders/create/route.ts
modified src/app/api/qr/[token]/route.ts
new      src/lib/services/loyalty-qr-service.ts
modified src/lib/services/loyalty-quote-service.ts   (session/table binding)
+ 4 test suites
```

```text
npx jest src/app/api/qr src/lib/services/__tests__ --runInBand -> 6 suites, 98 tests
npm run type-check                                             -> PASS
npm test -- --runInBand                                        -> 72 passed / 1 skipped, 867 passed, 11 skipped
```

**Backwards compatibility proven, not assumed:** the verifier diffed base `12bdcdf` against
the current create route segment by segment — response object byte-identical, status codes
unchanged, `menuItem` select identical, no new field in the legacy response.

`REVIEW-06.md`: PASS WITH NOTES. F-01 (a no-phone guest got an error code and "enter a valid
mobile number" copy) and F-02 (idempotent replay skipped the request hash) fixed; F-04/F-05/F-09
fixed.

Carried forward:
- **P5:** F-06 — quote re-evaluates unpaid orders' promotions; stored `OrderDiscount` is not
  rewritten until §18.20.14 I.
- **P7:** tighten the generic `console.error` so a Prisma validation error cannot log input.
- **P10:** F-03/N-01 contract gap (`MEMBER_RESOLUTION_FAILED` reuses `LOYALTY_DISABLED`);
  N-04 confirm the quote route's generic request codes are permitted.


**Commit — P4 (2026-11-13):**

```text
commit 55dd7c4  feat(loyalty): QR quote and loyalty-aware order create (P4)
base   12bdcdf
14 files changed, 4428 insertions(+), 23 deletions(-)
```

Authorized by user. Exact path list published before the commit.

**Integrity note:** the committed per-file hashes differed from the reviewed hashes
(`5ff6eb7c…` → `6e912a71…` etc.) and the diff shrank by 17 lines. Investigated rather than
accepted: the pre-commit hook (`eslint --fix` + `prettier --write`) reformatted six files.
Proof of semantic equivalence — the pre-commit blobs were extracted from the hook's backup
(`4d3caee`), formatted with the repo's prettier config, and compared: **all six files
byte-identical**. Type-check, 98 scoped tests and 867 full tests pass on the committed state.

**Process fix for later phases:** implementers must run `npx eslint --fix` **and**
`npx prettier --write` on their changed files before reporting, so the hook is a no-op and
the reviewed hash equals the committed hash. `prettier --check` alone was not sufficient.


**P5A — Counter bill read and member attach (2026-11-13):**

Implementer `ses_e2cc9a6f0ffea1CiddEIMiYNpM`. Verifiers `ses_e2cbbf3f2ffeSCCW0NziqoU25V`
(**FAIL**) and `ses_e2cac41c7ffevw5PW5VQexObc4` (re-review, PASS WITH NOTES). Two correction
cycles.

```text
modified src/app/api/counter/tables/[tableId]/bill/route.ts
new      src/app/api/counter/orders/[orderId]/bill/route.ts
new      src/app/api/counter/{tables,orders}/.../member + member/remove  (4 routes)
new      src/lib/services/loyalty-bill-service.ts
modified src/lib/rbac/permission-constants.ts, prisma/seed.ts   (loyalty:attach only)
+ 5 test files
```

```text
npx jest src/app/api/counter src/lib/services/__tests__ --runInBand -> 8 suites, 107 tests
npm run type-check                                                 -> PASS
npm test -- --runInBand                                            -> 77 passed / 1 skipped, 914 passed, 11 skipped
```

**First verdict was FAIL** on a high-severity defect: member change re-attributed **paid**
orders (`Order.customerId` fanned out with no `paymentStatus` filter), which could flip
`BELOW_MINIMUM → COUNTS` and grant a reward on another customer's spend. Ruled that §18.20.14 J
applies to unpaid bills only (§18.20.15 D/I/A); the fan-out is now `PENDING` + not `CANCELLED`,
with a red-capable regression test.

Also fixed: v1 legacy numeric change documented and pinned; audit row inside the transaction;
dead `discountSource: 'MULTIPLE'`; existing-customer rename no longer bypasses `members:pii`;
cancelled/refunded takeaway orders treated as settled; no-op member changes no longer bump the
revision.

**Verification gap recorded:** correction cycle 2 (R-01/R-03/R-07) was not independently
re-reviewed; carried into the P5B gate.

**ESCALATED — R-02 (pre-existing, needs a product decision):** the Counter bill response
spreads `orders[].customerPhone` and `customerSession.customerPhone`, so a cashier with only
`orders:read` sees a full phone, contrary to §18.20.9 (`members:pii` required). Not introduced
by this task; cannot be fixed behind the flag without changing the legacy response shape.
Options: mask, gate behind `members:pii`, or accept and record. P7 decision.

