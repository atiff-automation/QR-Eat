# Review 13 — QR-EAT-LOYALTY-PROMO-V1 · P6B final gate

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · phase P6B
**Verifier:** `ses_e2accf595ffeFp5Lat0XWgrIDY` (PASS WITH NOTES) · implementer `ses_e2b308a53ffef8zBgoUbNIfidm`
**Date:** 2026-11-13 · **Risk:** R3 · **Base:** `76e0366`

## Verdict

**PASS WITH NOTES.** P6B closes.

| Item | Value |
|---|---|
| 25 product files | `20462b28cf8f394765f73c53f8b1973ec2e88df650c898dd5afa3bc41e5b27cd` |
| Tracked diff | `d66273070bb268b5dca50c766bdef2672bb48d7c068300acd675177c5aa92964` |
| `loyalty-bill-service.ts` (post F-01) | `99729904de650c4cecefc0dbfc5c9dffe1ecc9879893049100c5772e07337fd3` |

## What took four cycles, and why

Erasure completeness. Each pass narrowed the same defect:

1. Delete nulled `Order` PII but not `CustomerSession` → null linked sessions.
2. A guest QR order writes the phone into `customer_sessions` with no `Order.customerId` → also match by phone.
3. **Root cause:** the QR route stored the **raw client phone** (the live checkout submits the national form) while delete matched E.164 → normalise at write, simplify the match, wipe dev rows instead of backfilling.
4. A `MEMBER_CHANGE` idempotency record still held `member.name` for 24h → strip it from the stored body.

**Waiver recorded:** cycle 4 exceeded the three-cycle limit. Reason: it closed a live PII-retention path rather than shipping it; scope was two files and one assertion. Approved by the human implicitly in "all now" (the instruction was to do the clean fix).

## The clean fix, as approved

| Step | Change |
|---|---|
| 1 | `POST /api/qr/orders/create` normalises the phone with `normalisePhone()` before the session write; a malformed phone stores `null` and nulls name/email too |
| 2 | `deleteMember` uses a single E.164 equality — no variant guessing |
| 3 | No backfill code. One-off dev SQL (`evidence/dev-pii-cleanup.sql`) cleared leftover rows; run once, exit 0 |
| 4 | No customer PII in `PaymentBatch.response`, `IdempotencyRecord.responseJson` or `OrderEvent.payload`; delete also nulls `customerName` in the member's event payloads |

This fixes the source instead of adding permanent tolerance for bad data.

## Verified

- After DELETE: no endpoint returns the member's **phone** or **email**; the **name** survivor (F-01) is closed.
- Erasure trace across `Customer`, `Order`, `CustomerSession`, `DiningSession`, `Quote`, `LoyaltyVisit`, `OrderDiscount.promotionSnapshot`, `PaymentBatch.response`, `IdempotencyRecord.responseJson`, `OrderEvent.payload`, `OrderActionReceipt`, `AuditLog` — clean for data written by this code.
- Search: exact `phoneHash`, cap 50, audited with `phoneHash` + required purpose.
- Consent withdrawal blocks resolution; marketing consent forbidden after withdrawal or anonymisation.
- Report: `net = Σ Payment.amount`, never `gross − discounts`; refunds positive magnitude.
- Permissions unchanged; no `prisma/schema.prisma` or migration change.
- 783 targeted tests, 1089 full suite, build green.

## Notes carried

| ID | Note | Route |
|---|---|---|
| F-02/F-03 | Any environment not covered by the one-off SQL keeps raw-format rows; sessions are never purged | **P9 checklist: run the cleanup before enabling the flag** |
| F-04 | A malformed phone now drops the accompanying guest name/email | P10 |
| F-05 | Stored/replayed payment bodies no longer carry `customerName`/`customerPhone`; the live response does. Aligns with §18.20.8 ("receipt: no name/phone") | P10 contract freeze + Counter handoff |
| F-06 | Payment services changed in P6B; human approved via "all now" | recorded |
| F-08 | `ORDER_CREATE` `requestHash` is an unkeyed SHA-256 over the raw phone (pre-existing P4) — brute-forceable from the digest | **P7 blocker** |
| — | Refunds structurally `0.00` because the refund path writes no negative `Payment` | P8 |
| — | Marketing consent reachable from the owner API though §18.20.9 says "Counter-only" | P10 |
| — | R-02 verification (PII in JSON) — **already implemented here**, P7 should verify, not rebuild | P7 note in `TASK.md` |

## Not verified

- No Postgres execution: the relation filters, JSON scrubbing and E.164 equality are mock-tested only.
- No end-to-end QR-write → delete integration test (two unit seams).
- Pre-fix dev rows after the cleanup SQL were not re-read (no SELECT available).

## Residual risk

- A `MEMBER_CHANGE` receipt created before cycle 4 keeps the member view for up to 24h; no backfill (no production users).
- Environments not covered by the cleanup keep raw-format session rows; unbounded because sessions are never purged.
- Unlinked guest records with the same phone (counter takeaway) are outside this fix's model.
- Same-model verification shares blind spots.
