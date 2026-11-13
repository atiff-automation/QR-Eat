# Review 06 — QR-EAT-LOYALTY-PROMO-V1 · P4 (QR API)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · phase P4
**Verifiers:** `ses_e2ce6bd32ffes2uYjktCXaGJIw` (P4 full) · `ses_e2cd8f112ffeyqarWSP10Ll68b` (P4 delta)
**Implementer:** `ses_e2d02ef0dffeL7EDq3XYrSlqSk`
**Date:** 2026-11-13 · **Risk:** R3 · **Base:** `12bdcdf`

## Verdict

**PASS WITH NOTES.** One correction cycle; no high or critical findings.

| Item | Value |
|---|---|
| P4 files (10), combined (cat, listed order) | `320268cbb2d3deae98f920e7c0d2610839839c34c84f909fe6fd6493df86f8cd` |
| P4 files, per-file listing | `5260b63cb2e06077c6b741a5888b7944e01d4201076b5ca8f97c6e980ff276bb` |

## Headline: existing clients are unaffected

The verifier read the base version (`git show 12bdcdf:…/create/route.ts`) against the current
file segment by segment and confirmed:

- response object **byte-identical** (base 372-394 == current 696-718);
- status codes unchanged (200 / 400 / 404 / 409 / 503 / 500);
- `menuItem` select byte-identical;
- transaction body, notifications, cart clear and catch handlers identical;
- no new field leaks into the legacy response.

The only divergence is for a request that sends the **new** `quoteId` field with the flag off,
which no shipped client does (N-07).

## Delivered

`POST /api/qr/orders/quote` (new), loyalty-aware `POST /api/qr/orders/create`, `loyaltyNotice`
on `GET /api/qr/[token]`, plus `src/lib/services/loyalty-qr-service.ts` holding the bill
pricing, projection, reprice validation and `ORDER_CREATE` idempotency.

## First-pass findings

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| F-01 | medium | `guestErrorFor('NO_PHONE')` returned `code:'NO_PHONE'` — not in §18.20.12 — and the `PHONE_INVALID` copy, so a customer who simply skipped the phone saw "Enter a valid mobile number…". | **FIXED** — no `loyaltyError` for a plain no-phone guest; only the three recoverable reasons emit. |
| F-02 | medium | Early idempotency replay returned the stored response without comparing the request hash, so a key reused with a different body got the original order at 200 instead of `IDEMPOTENCY_MISMATCH`. | **FIXED** — hash compared, quote binding checked (`quote.orderId === storedOrderId`), 409 on mismatch. |
| F-03 | low | `MEMBER_RESOLUTION_FAILED` still uses `LOYALTY_DISABLED` as its code (generic copy). | **Carried to P10** as a contract gap. |
| F-04 | low | Early replay reachable with the flag off. | **FIXED** — gated on loyalty active. |
| F-05 | low | `categoryId: true` added to the legacy `menuItem` select and unused. | **FIXED** — removed; select proven identical to base. |
| F-06 | low | Quote re-evaluates unpaid orders' promotions without rewriting stored discounts. | **Carried to P5** (§18.20.14 I). |
| F-07 | low | Per-quote over-fetch of all payment batches for the business date. | Documented; P5/P7 perf. |
| F-08 | low | Disabled quote returns 200 `success:false`; legacy create returns `success:true`. | Documented. |
| F-09 | low | `findOrderCreateRecord` ignored `expiresAt`, so an expired record could replay. | **FIXED** — `expiresAt > now`; expired behaves as absent. |

## Delta notes

| ID | Severity | Note | Owner |
|---|---|---|---|
| N-01 | low | Member-resolution race still emits `LOYALTY_DISABLED` with generic copy. | P10 |
| N-02 | low | Stored request hash uses `requestSessionId ?? input.sessionId` while the replay hashes `sessionId ?? null`; unreachable today. | Document |
| N-03 | low | `PHONE_INVALID` copy embeds `+60123456789`. The contract itself uses that example (§18.20.15 E), so this is contract-sanctioned, not leaked PII. | Accepted |
| N-04 | low | Quote route emits generic request codes (`NOT_FOUND`, `CART_EMPTY`, …) outside §18.20.12. | Confirm at P10 |
| N-05 | low | Duplicated helpers between route and service. | Cleanup |
| N-06 | low | `COMPLETED` replay branch in `prepareLoyaltyCreate` is unreachable (early replay wins). | Document |
| N-07 | low | Flag-off + new `quoteId` selects the loyalty schema (phone `max(32)`), so a short phone is accepted where base returned 400. Not reachable from a pre-P4 client. | Accepted |

## Independently verified

- Quote response omits `daySubtotal`, `minDailySpend`, `amountToMinimum`, member id, full phone and `phoneHash`; `discountLines` omit `orderId`.
- Guest fallback: order succeeds at 200, no member/consent/visit written; `CONSENT_STALE` is not 422 here.
- Quote binding enforces restaurant + session + table + cartHash + member + `expectedTotal`; consume happens inside the order transaction; second create rejected; replay does not re-consume.
- Money: zero-discount parity with `calculateOrderTotals`; `totalAmount == projectedTotal`; `cashPayable = round5`; mixed bill → `MULTIPLE`; allocation identities hold.
- Tenant isolation on every query; no full phone in logs, errors or responses.
- `loyaltyNotice` correct shape, `null` when inactive, no extra query when the flag is off.

## Not verified

- No database integration: consume atomicity, tenant FKs and concurrency are mocked (P7/P9).
- `npm run build` not run in these gates (build runs at P9).
- P5 payment writes not reviewed.

## Residual risk

- Expired `IdempotencyRecord` rows are not purged; a key reused after 24h hits the unique constraint and returns 409.
- The `P2002` catch could misclassify a non-idempotency unique collision as `IDEMPOTENCY_MISMATCH`.
- The generic `console.error` in the create route logs the raw error; no P4 path throws a phone-bearing error, but a Prisma validation error could embed input values — tighten in P7.
- Quote-vs-stored-discount divergence closes only at P5 payment.
- Same-model verification shares blind spots; R3 still warrants a different-model or human pass before release.
