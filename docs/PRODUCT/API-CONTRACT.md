# API Contract Index — Tabtep

**Status:** canonical ownership index · 2026-11-10  
**Owner:** QR-Eat  
**Consumers:** QR-Eat web, Tabtep Counter, Tabtep Kitchen/Station

This is not yet a generated OpenAPI document. It defines the canonical source of
truth and the conventions. Generating OpenAPI and typed clients is a follow-up.

## Source of truth

- Actual routes: `src/app/api/**/route.ts`
- Data model: `prisma/schema.prisma`
- Event/SSE behavior: `src/app/api/events/*` and Counter/Station handlers
- Client DTOs: `../Tabtep-App/core/network`
- Project rules: `docs/PRODUCT/SYSTEM-MAP.md`

If a document disagrees with code, code wins until this index and the code are
reconciled. Do not treat historical `/api/mobile/v1` notes as current.

## Conventions

- Content type: `application/json; charset=utf-8`
- Timestamps: ISO-8601 UTC; server time is authoritative for ledger/events.
- IDs: opaque strings; clients must not parse them.
- Versioning: path-versioned for breaking changes; additive fields are allowed.
- Errors: follow the existing project error envelope; do not invent a second one.
- Auth:
  - web: HttpOnly session cookies
  - Counter: Bearer access/refresh tokens
  - Station: device credential/token
- Every mutating retry: idempotency key.
- Events: sequence-ordered; gaps trigger resync, never a guess.
- Money: Prisma `Decimal(10,2)` for stored money; keep one convention across
  UI, API, calculations, and tests. Do not mix with integer minor units without
  an explicit conversion boundary.

## Current route groups

| Group | Route files | Purpose |
|---|---:|---|
| `/api/counter` | 32 | Counter bootstrap, orders, payments, reports, business day |
| `/api/admin` | 29 | platform/admin, roles, menu, staff, reports |
| `/api/auth` | 16 | login, sessions, RBAC, password/reset |
| `/api/orders` | 11 | order lifecycle, status, ready, recall, refund, void |
| `/api/settings` | 10 | restaurant settings |
| `/api/tables` | 8 | table state and bill |
| `/api/devices` | 7 | provisioning, pairing, tokens, revoke |
| `/api/owner` | 7 | owner reports/staff/orders |
| `/api/stations` | 6 | station management |
| `/api/qr` | 6 | customer QR ordering |
| others | remainder | kitchen, events, push, receipts, health, jobs |

## Contract debt

- No OpenAPI document yet.
- `Tabtep-App/docs/API-CONTRACT.md` is historical/proposed; it must become a
  pointer, not a parallel contract.
- `API-DOCUMENTATION.md` is older RBAC-era documentation; verify before use.
- Client DTOs and server routes are maintained separately.

## Change process

1. Change the server contract first.
2. Make additive/backward-compatible changes preferred.
3. Add or update server tests.
4. Update this index.
5. Freeze the contract commit.
6. Update client DTOs/tests in a separate Tabtep session.
7. Run integration verification.
8. Release server first, then clients.
9. Update `RELEASE-COMPATIBILITY.md`.

## Next improvements

- Generate `openapi.yaml` from route/schema definitions or maintain it as code.
- Generate TypeScript and Kotlin DTOs from the contract.
- Add contract tests in CI for critical endpoints.


---

# §18.20 Loyalty, rewards and promotions — QR-Eat addendum

**Status:** implemented · **FROZEN** `df40e1d` (REVIEW-29 **FAIL** → REVIEW-30 **PASS WITH NOTES**; P11 human payment/migration pass **PASS**, 2026-11-16)
**Normative source:** `../Tabtep-App/docs/API-CONTRACT.md` §18.20
(v1.4.3, Tabtep task revision 14)
**Owner:** QR-Eat. **Consumers:** QR-Eat web, Tabtep Counter, Tabtep
Kitchen/Station.

This addendum records the **server implementation** of §18.20. It does not amend
the normative contract. Where the two differ, §18.20.11 of this addendum (the
interpretation register) names the clause, what we built, and why. Do not edit
the Tabtep worktree from a QR-Eat session.

The single rule: **if a promotion applies to the order/bill, the promotion
applies and the visit does not count.** No customer choice, no two-option
comparison, no cashier override.

## 18.20.1 Activation

Both switches must be on, and the global one fails closed:

| Switch | Where | Effect |
|---|---|---|
| `LOYALTY_ENABLED` | environment | Global. Only the literal string `true` enables. Unset/`1`/`TRUE`/`yes` are off. |
| `LoyaltySettings.enabled` | database, per restaurant | Per-restaurant. |
| `LOYALTY_PHONE_HMAC_KEY` | environment | Required to hash phones. Absent ⇒ QR resolves as guest and returns `LOYALTY_DISABLED`; Counter member/attach returns `LOYALTY_CONFIGURATION_ERROR` (500) until the key is set. |

Cash rounding (`Restaurant.cashRounding`) is **independent** of loyalty and
applies with loyalty off.

Rollback is the flag: unset `LOYALTY_ENABLED`, redeploy, and the QR and Counter
paths return to the legacy behaviour. Existing visits, discounts and batches
remain; no rows are deleted and no migration is reversed.

## 18.20.2 Surface

| Endpoint | Permission | Idempotency | Revision / binding |
|---|---|---|---|
| `POST /api/qr/orders/quote` | table token | none (quote) | binds member + cart hash |
| `POST /api/qr/orders/create` | table token | `ORDER_CREATE` (optional header) | `quoteId`, `expectedTotal` |
| `GET /api/qr/{token}` | table token | — | adds `loyaltyNotice` |
| `GET /api/counter/loyalty/notice` | `loyalty:attach` | — | — |
| `GET /api/counter/tables/{id}/bill` | `orders:read` | — | `billRevision` |
| `POST /api/counter/tables/{id}/member` | `loyalty:attach` + `orders:write` | `Idempotency-Key` | `expectedBillRevision` |
| `POST /api/counter/tables/{id}/member/remove` | `loyalty:attach` + `orders:write` | `Idempotency-Key` | `expectedBillRevision` |
| `GET /api/counter/orders/{id}/bill` | `orders:read` | — | `billRevision` |
| `POST /api/counter/orders/{id}/member` | `loyalty:attach` + `orders:write` | `Idempotency-Key` | `expectedBillRevision` |
| `POST /api/counter/orders/{id}/member/remove` | `loyalty:attach` + `orders:write` | `Idempotency-Key` | `expectedBillRevision` |
| `POST /api/counter/orders/{id}/pay` | `payments:write` | `Idempotency-Key` | `expectedTotal`, `expectedCashPayable`, `expectedBillRevision` |
| `POST /api/counter/payments` | `payments:write` | `Idempotency-Key` | same |
| `GET /api/counter/payments/{key}` | `payments:read` | — | replay of a stored payment |
| `PATCH /api/orders/{id}/modify` | `orders:write` | body `idempotencyKey` (UUID; see §18.20.4) | re-evaluates promotion, bumps `billRevision` |
| `GET/PATCH /api/settings/restaurant/loyalty` | `settings:read` / `loyalty:configure` | `Idempotency-Key` on PATCH | — |
| `GET/PUT /api/settings/restaurant/payments` | `settings:read` / `settings:write` | `Idempotency-Key` on PUT | `cashRounding`, `businessDayCloseTime` |
| `GET/POST /api/promotions` | `promotions:manage` | `Idempotency-Key` on POST | soft delete |
| `PATCH/DELETE /api/promotions/{id}` | `promotions:manage` | `Idempotency-Key` | no single-promotion `GET` |
| `POST /api/members/search` | `members:read` | — | exact E.164, max 50, audited |
| `GET /api/members/{id}` | `members:read` (`members:pii` for full phone) | — | — |
| `PATCH /api/members/{id}` | `members:pii` | `Idempotency-Key` | owner rename, audited, name-free row |
| `GET /api/members/{id}/export`, `GET /api/members/export` | `members:export` | — | audited |
| `POST /api/members/{id}/withdraw-consent` | `members:consent_withdraw` | `Idempotency-Key` | — |
| `POST /api/members/{id}/marketing-consent` | `members:consent_withdraw` | `Idempotency-Key` | — |
| `DELETE /api/members/{id}` | `members:delete` | `Idempotency-Key` | anonymise |
| `GET /api/reports/loyalty` | `loyalty:report` | — | — |

Cross-tenant access returns **404**, not 403. Every full-phone read, search and
export writes an audit row with actor, target, purpose and timestamp.

## 18.20.3 QR

`POST /api/qr/orders/quote` evaluates the **whole current bill/session** and
returns:

`quoteId`, `quoteRevision`, `subtotal`, `promotionDiscountAmount`,
`projectedRewardAmount`, `discountAmount`, `discountLines[]`,
`discountedSubtotal`, `taxAmount`, `serviceCharge`, `totalAmount`,
`projectedTotal`, `cashPayable`, `rewardLabel`, `rewardType`, `rewardValue`,
`maxDiscount`, `promotionApplied`, `promotionScope`, `promotionLabel`,
`promotionItems[]`, `visitState`, `visit { completedVisits, visitsRequired }`,
`message`.

- `discountAmount = promotionDiscountAmount + projectedRewardAmount`.
- Tax and service are recomputed **per order/line** from the rate snapshot after the
  discount, rounded per line and summed at the bill; a mixed-rate bill quotes the
  same sum that payment will charge. `totalAmount = projectedTotal`.
- **No spend or amount-to-minimum is returned.** `daySubtotal`, `minDailySpend`
  and `amountToMinimum` are Counter-only.
- `visitState` is `COUNTS`, `ALREADY_COUNTED`, `PROMOTION`, `BELOW_MINIMUM` or
  `GUEST`; precedence `GUEST > PROMOTION > ALREADY_COUNTED > BELOW_MINIMUM >
  COUNTS`.
- A projected 3rd-visit reward is **not written** at create; it is applied at
  payment. If the visit no longer qualifies, payment fails before recording.
- `quoteId` is a 128-bit opaque token, single-use at create, bound to the
  restaurant, session/table token, cart hash and member/phone hash. A mismatch
  is `QUOTE_CHANGED`.

`POST /api/qr/orders/create` validates the quote and the member binding, applies
the promotion, writes the `OrderDiscount` rows, and returns the final total plus
`projectedTotal`/`rewardLabel` when a reward is projected. It writes **no** visit
and no reward. A guest create is allowed only when the quote is `GUEST`. A valid
phone with missing/stale consent produces a **guest order** with
`loyaltyError { code, message }` at 200 — the order never fails because of
loyalty. `marketingOptIn` is not accepted here.

## 18.20.4 Counter

The bill read (dine-in and takeaway) adds `billRevision`, `member`, `visitState`,
promotion fields, `discountAmount`/`discountSource`/`discountLabel`/
`discountLines[]`, reward fields, `subtotal`, `taxAmount`, `serviceCharge`,
`fullPriceTotal`, `preRewardCashPayable`, `projectedRewardAmount`,
`projectedTotal`, `preRewardTotal`, `totalAmount`, `cashPayable`, and the
Counter-only `daySubtotal`, `minDailySpend`, `amountToMinimum`.

- `totalAmount` = `projectedTotal` (what to collect online).
- `preRewardTotal` = order discounts applied, loyalty reward excluded; used for
  reconciliation and offline collection.
- `fullPriceTotal` = subtotal + tax/service before any discount; used only for an
  offline-created order.
- Cash: `cashPayable = cashRounding === 'NEAREST_5_SEN' ? round5(projectedTotal) :
  projectedTotal`. Under `NONE` there is no rounding. Card/e-wallet charge
  `projectedTotal` exactly.
- `promotionApplied = true` implies `projectedRewardAmount = "0.00"`; a
  promotion and a reward never appear together.

Member change re-quotes and reprices under the lock, bumps `billRevision`, and
is audited. Payment validates `expectedTotal`, `expectedCashPayable` (cash) and
`expectedBillRevision`, then in one transaction writes the visit (only when no
promotion), mutates the card, writes the discounts, the payments and the batch.

Payment `outcome` precedence: `PROMOTION_APPLIED > REWARD_APPLIED >
VISIT_COUNTED > ALREADY_COUNTED > BELOW_MINIMUM > GUEST > NO_BENEFIT`.

- Promotion on a member bill: no visit, card unchanged.
- No promotion and the day qualifies: visit written; the 3rd visit applies the
  reward and resets the card.
- Already counted: no second visit.
- Guest: `completedVisits`/`visitsRequired` are null and card fields are
  omitted.
- Stale total or revision: `BILL_CHANGED` / `AMOUNT_MISMATCH`, no charge.

**Order modification (unpaid only).** `PATCH /api/orders/{id}/modify` re-evaluates
promotion eligibility under the bill lock, replaces or removes the ACTIVE
`OrderDiscount`, recomputes tax/service per order, and bumps `billRevision`. If no
eligible base remains, the promotion stops blocking the visit unless another order
in the bill still has one. A paid order is never re-evaluated; correction is
deferred in v1.

> **Idempotency (owner-confirmed 2026-11-17, `OI-1`).** This route takes
> `idempotencyKey` (UUID) in the JSON body together with `version`, `reason`,
> `customerNotified` and `itemChanges`. A request that supplies only an
> `Idempotency-Key` header returns 400 because the body field is missing. No
> server change was made; the frozen commit `df40e1d` remains valid. The Counter
> handoff matches this contract.

## 18.20.5 Owner

Loyalty settings: `visitsRequired` (2–10), `lookupLimitPerHour` (1–1000, default
30), reward type/value, `maxDiscount`, `minDailySpend` (0–1000), notice and
privacy URL. Changes apply to new card cycles.

Promotions: all three scopes, soft delete, same-restaurant category/item
validation, one promotion per order, best single, tie-break by highest discount
then lowest id.

Members: search by exact E.164 (max 50, audited), profile, export, consent
withdrawal (loyalty or marketing), marketing consent, anonymise-on-delete.
`PATCH /api/members/{id}` renames a member behind `members:pii`; the name is
write-once at enrolment and this is the only corrective path. It writes an
audited, name-free row.

Financial settings (tax rate, service charge, currency and their labels) are an
**owner-only** control: `PUT /api/settings/restaurant/financial` and the
financial fields of `PUT /api/settings/restaurant` require `settings:write`
**and** `userType = restaurant_owner`, because the manager role also holds
`settings:write` for payment settings and must not change tax (REVIEW-29 S-1,
REVIEW-30 H-1). A platform admin is refused by design, even when the token
carries a restaurant context.

## 18.20.6 Money and reporting

- Discount applies to the subtotal before tax/service; tax/service are
  recomputed; total after tax/service; floor to 2dp; identical on quote, order
  and payment.
- The three reports agree on a **sale day** and a **refund day**:

  ```text
  gross     = Σ Order.subtotalAmount
  discounts = Σ ACTIVE OrderDiscount.amount
  tax       = Σ Order.taxAmount
  service   = Σ Order.serviceCharge
  refunds   = |Σ negative Payment.amount|, on the day of the refund
  net       = Σ Order.totalAmount − refunds
  identity  gross − discounts + tax + service − refunds = net
  ```

- A refund belongs to the business date it happened, not the sale date. The
  Z's order block is built from **positive** payments only, so a refund does not
  re-add the refunded order's gross.
- The Z's `grossSales` is the **pre-tax subtotal** (P8-1) — a client-visible
  semantic change for any Counter build that displayed the old figure.
- **P8-6 is unsigned:** `net` includes tax and service by design, so gross
  profit and margins include tax. The P&L is management reporting, not
  statutory, until an accountant signs it.
- Receipts: subtotal, discount, tax, service, total, promotion/visit note, card
  status. ASCII only; no name or phone.

## 18.20.7 Rate limits and the trusted edge address

Fixed hourly windows, durable counters, one count per **order** (a guest quote
consumes none):

| Scope | Limit |
|---|---|
| `(restaurantId, phoneHash)` | 10/h |
| QR session | 10/h |
| Restaurant ceiling | owner-set, default 30, 1–1000 |
| Trusted edge IP | 120/h |

A refusal returns a generic `RATE_LIMITED` with `retryAfterSeconds` rounded up
to 10s, records one event, and tells the QR customer to order at the counter.
A limiter database error **fails open**, logs once and records one event; it
never returns 500.

**Trusted edge address (measured 2026-11-14).** Railway's edge prepends the
client to `X-Forwarded-For` and appends a per-connection internal hop; it also
sets `X-Real-IP` to the client and overwrites client-supplied values. The
resolver therefore reads, **only when `RAILWAY_ENVIRONMENT` is set**:

1. `X-Real-IP`, validated as a globally routable address;
2. else the **first** `X-Forwarded-For` entry;
3. else a globally routable socket peer;
4. else `unknown`.

Off-Railway neither header is trusted. Private, loopback, link-local, CGNAT,
unspecified, multicast, non-IP, port- and zone-bearing values are rejected at
every position. `/api/health` reports `edgeIp: { source, xffEntries }` with no
address; the pilot runbook reads it from the public URL.

## 18.20.8 Privacy

- The phone is stored as E.164 **and** a keyed HMAC (`LOYALTY_PHONE_HMAC_KEY`).
  Lookup and uniqueness use the HMAC; the E.164 value is shown only with
  `members:pii`.
- Masking keeps the country code and the last two digits: `+60••••••78`.
- Loyalty consent at QR; marketing consent is separate, requires an actor, and
  is forbidden when loyalty consent is withdrawn or the member is `ANONYMIZED`.
- Deletion anonymises: nulls phone and name on orders and sessions, keeps
  financial rows and `phoneHash`.
- No PII in logs, traces, evidence or query strings. Audit `ipAddress` is the
  resolved client address, never a raw header.

## 18.20.9 Offline

- Offline-created order: full price, no promotion, no visit.
- Online-priced order paid offline: the promotion stands; collect
  `preRewardTotal`, or `preRewardCashPayable` for cash. No reward, no visit.
- A queued payment carrying a projected reward is rejected or flagged for
  reconciliation, never settled silently.
- The Counter shows "Loyalty unavailable offline."

## 18.20.10 Errors

Implemented normative codes: `LOYALTY_DISABLED`, `PHONE_INVALID`,
`CONSENT_REQUIRED`, `CONSENT_VERSION_REQUIRED`, `CONSENT_STALE`, `BILL_PAID`,
`BILL_CHANGED`, `PAYMENT_IN_PROGRESS`, `AMOUNT_MISMATCH`, `QUOTE_CHANGED`,
`NO_ELIGIBLE_ORDERS`, `PERMISSION_DENIED`, `PROMOTION_INVALID`,
`DISCOUNT_ALLOCATION_FAILED`, `RATE_LIMITED`, `CASH_ROUNDING_FAILED`,
`INSUFFICIENT_CASH`, `IDEMPOTENCY_MISMATCH`.

Generic request codes used by the existing envelope and permitted by the
contract: `NOT_FOUND`, `CART_EMPTY`, `INVALID_REQUEST`,
`IDEMPOTENCY_KEY_REQUIRED`, `MEMBER_ANONYMIZED`, `CONSENT_WITHDRAWN`,
`LOYALTY_CONFIGURATION_ERROR`.

Three codes were added by the pre-review fixes (P11-prep). None of them changes a
figure; each names a state the caller must resolve:

| Code | Status | Surface |
|---|---|---|
| `RESTAURANT_HAS_HISTORY` | 409 | Owner/admin `DELETE /api/restaurants/{id}` only. The pre-check body carries `history` counts; a `P2003` fallback returns the code only. Close with `PATCH { "isActive": false }`. |
| `CUSTOMER_CONFLICT` | 422 | Counter member attach/change (`POST /api/counter/tables/{tableId}/member` and `POST /api/counter/orders/{orderId}/member`). The member could not be saved; the bill stays as it was. The QR create never returns it: a member-resolution failure degrades to a guest order with `loyaltyError`. |
| `CONFLICT` | 409 | Owner loyalty, promotion, member and settings mutations. A unique conflict with no idempotency receipt to replay; retry with a fresh key after re-reading. |

Registry codes not emitted: `MEMBER_ALREADY_ATTACHED` (attach is idempotent) and
`LOYALTY_UNAVAILABLE_OFFLINE` (the offline state is client copy only). Both are
recorded in the register below.

The close endpoint's `409 BUSINESS_DAY_BLOCKED` response carries
`details.blockers`. Two additive blocker types **block the close** (they are not
informational); each carries `type`, `label`, `count` and an absolute `amount`:

- `Z_DISCOUNT_SPLIT_MISMATCH` — `Discount split does not match the discount total`
- `Z_IDENTITY_MISMATCH` — `Z report does not reconcile`

They also appear in the live Z payload and in the Z PDF's blocker section. They
are `details.blockers[].type` values, not new top-level error codes: the close
fails with `409 BUSINESS_DAY_BLOCKED`, and the message names the blocker types.

One more Z blocker is **informational and never blocks a close**:

- `AFTER_CLOSE_ACTIVITY` — `Payments or refunds recorded after the day closed`
  (carries `count` and the absolute `amount`). The live Z ranges over the
  business-day cutoff, so a payment or refund taken between `closedAt` and the
  cutoff is in the figures. The blocker says the live Z no longer matches the
  filed `BusinessDay.snapshot`. It can only appear on an already-closed day,
  which cannot be closed again.

## 18.20.11 Interpretation register

| # | Clause | What we built | Why | Counter must care |
|---|---|---|---|---|
| P10-1 | §18.20.14 J (`uuid[]` **or join tables**) vs §18.20.15 D (`uuid[]`) | `PromotionCategory`/`PromotionItem` join tables | `uuid[]` did not round-trip through Prisma; J explicitly permits join tables and D does not withdraw that permission | No |
| P10-2 | §18.20.12 | `MEMBER_RESOLUTION_FAILED` reuses `LOYALTY_DISABLED` | Avoids a new code for an indistinguishable state | No |
| P10-3 | §18.20.6 | Stored/replayed payment bodies omit `customerName`/`customerPhone`; the live response keeps them | Removes PII from the replay store | **Yes** — do not read those fields on replay |
| P10-4 | §18.20.5 | A malformed phone also drops the guest name/email | The guest path does not persist unverified contact data | No |
| P10-5 | §18.20.9 ("marketing Counter-only") | Marketing consent is reachable from the owner API, with actor and source | The owner is an authorised actor; the contract restricts the *customer*, not the owner | No |
| P10-6 | §18.20.12 | Seven generic envelope codes | They pre-date loyalty and describe request shape, not loyalty state | No |
| P10-7 | §18.20.7 | Payments `PUT` treats a missing `Idempotency-Key` as success | The server keeps the header optional for backward compatibility; current web clients send it, but an older or third-party client may not | **Yes** — always send it; a retry without it is unprotected |
| P10-8 | §18.20.7 | `businessDayCloseTime` is returned by payments `GET` but not accepted by `PUT` | It is owned by the restaurant settings route | No |
| P10-9 | §18.20.13 | The promotions form blocks same-day windows the server accepts | Stricter UI than server; no server change | No |
| P10-10 | §18.20.13 | QR confirmation shows the whole session bill, not only the created order | The session is the bill identity | **Yes** — the displayed total may exceed the order |
| P10-11 | §18.20.15 E | A projected reward can differ from an offline-settled amount | The reward is applied at payment, not at projection | **Yes** — reconcile, do not assume |
| M-3 | §18.20.9 | `SecurityEvent.restaurantId` exists (nullable) and loyalty events populate it; pre-existing non-loyalty events remain null | The column was added in P7c; the original finding is closed | No |
| P7c-3 | §18.20.15 B (20/IP) | The IP floor is 120/h and not owner-configurable | The contract's 20/h is a per-IP *lookup* budget; 120/h is a coarse abuse floor that cannot lock out a shared NAT | **No** |
| P7d-1 | §18.20.9 | After a name is cleared, a later enrolment by the same phone re-captures a name | Name is write-once per membership, not per phone forever | No |
| P7d-4 | §18.20.9 | Historical `Order.customerName`/`CustomerSession.customerName` copies keep the old name after a rename | Those are order-contact copies, not the member record | No |
| P8-1 | §18.20.8 | The Z's `grossSales` is the pre-tax subtotal | Matches `gross = Σ subtotalAmount` and the other two reports | **Yes** — the figure changed meaning |
| P8-2 | §18.20.15 | The Z now carries `discountBySource`, a reward total and a prior-period refunds subset; split/identity discrepancies are visible blockers | Implemented in P10-close; figures are unchanged on consistent data | **Yes** — additive Z fields and blocker types |
| P8-3 | §18.20.8 | The loyalty report includes batchless positive `PAID` payments | The loyalty report's definition is unchanged; a legacy omission is corrected | No |
| P8-6 | §18.20.8 | `net` includes tax and service | Follows `net = Σ totalAmount`; all three reports agree | **Yes** — not statutory until signed |
| P10-12 | §18.20.12 | `MEMBER_ALREADY_ATTACHED` is never emitted; attach is idempotent | Re-attaching the same member succeeds without a state change | No |
| P10-13 | §18.20.12 | `LOYALTY_UNAVAILABLE_OFFLINE` is never emitted; offline is client copy | The server is unreachable offline, so it cannot return a code | **Yes** — render the offline state locally |
| P7-8 | §18.20.14 A (cross-tenant returns 404) | Counter bill routes return **403** for a cross-tenant staff/owner; member and loyalty routes return 404 | `requireTableAccess`/`requireOrderAccess` pre-date the loyalty rule | **Yes** — handle 403 on bill reads |
| P10-14 | §18.20.15 B (30 per restaurant per hour) | The restaurant ceiling is owner-set, 1–1000, default 30 | Approved in P7c: a busy venue needs headroom, and the per-phone and per-session limits still bound one customer | No |
| P9-09 | §18.20.11 | Flag-off payments write `PaymentBatch.outcome = 'GUEST'` | The contract asks for a non-null outcome; the pre-feature code wrote none | **Yes** — a new field appears with loyalty off |
| P9-10 | §18.20.15 B | The client address is `X-Real-IP` on Railway, not the last `X-Forwarded-For` entry | Measured: the edge prepends the client and appends a per-connection hop | No |
| D-1 | Retention (7 years, `docs/DATA-RETENTION.md`) | `DELETE /api/restaurants/{id}` returns `409 RESTAURANT_HAS_HISTORY` when the restaurant has orders, payment batches, business days, members, visits or discounts; a `P2003` from a table the pre-check misses maps to the same code | The loyalty foreign keys are `onDelete: Restrict` and the records must be kept for seven years; the old path surfaced a generic 500 | **Yes** — close a restaurant with `PATCH { "isActive": false }`; delete only an empty tenant |
| D-2 | §18.20.9 (`members:pii`) | The Counter's order contact phone (`Order.customerPhone`) is **order-contact data**, not member PII: it stays unmasked on the Counter order/takeaway/pending responses and is not gated by `members:pii`. The member record's phone stays masked (`maskedPhone`) and gated | The number was given by the customer for that order; masking it breaks the Counter's call-back and delivery flow. The member record is the PII surface | **Yes** — read `customerPhone` for order contact, `member.maskedPhone` for the member |
| P8-8 | §18.20.8 (the three reports agree) | The live Z ranges over the business-day cutoff — `getBusinessDayStart(businessDate)` to `getBusinessDayEnd(businessDate)` for a closed day, `now` for an open one — instead of `openedAt` → `closedAt`; `openedAt`/`closedAt` stay in the payload for display. A payment or refund after `closedAt` raises an informational `AFTER_CLOSE_ACTIVITY` blocker with `count` and the absolute `amount` | An early close put a post-close refund in a different period than the P&L and the loyalty report | **Yes** — one additive informational blocker type; the filed snapshot is unchanged |
| OI-1 | §18.20.2 / §18.20.4 | PATCH /api/orders/{id}/modify reads idempotencyKey from the JSON body; header-only request returns 400 | Implementation is frozen; a docs-only correction preserves df40e1d | Yes — send the body field, not the header |

## 18.20.12 Freeze, compatibility and rollout

- **Frozen:** `df40e1d` (last commit that changed server behaviour), stamped 2026-11-16 after
  REVIEW-30 **PASS WITH NOTES** and the human payment/migration pass **PASS**. Any later server
  change requires a new freeze. P10 documents do not change the contract.
- **State at freeze:** `df40e1d` was unmerged, unpushed, untagged and undeployed when stamped,
  and `LOYALTY_ENABLED` had not been set for any deployment. That described 2026-11-16 only.
- **Deployed:** merged and tagged 2026-11-17, then deployed from `main` to Railway production
  (`SUCCESS`, health UP). `LOYALTY_ENABLED` and `LOYALTY_PHONE_HMAC_KEY` are unset, so the loyalty
  surface is inert. The pilot has not run, and the exposed credential still needs rotation before
  real users.
- Server changes inside the current API version are additive; the loyalty
  surface is new, so no path version bump.
- Release order: server first with both switches off, then enable one
  restaurant, watch refusals and the edge diagnostic for two weeks, then expand.
- The Counter must be built against this addendum, not against the raw §18.20
  text, because the interpretation register is normative for this server.
