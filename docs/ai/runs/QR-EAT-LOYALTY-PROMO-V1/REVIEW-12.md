# Review 12 — QR-EAT-LOYALTY-PROMO-V1 · P6B (members + reports)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · phase P6B
**Verifiers:** `ses_e2b1c62a2ffeBd8ztrgaTQGs0E` (FAIL) · `ses_e2b034ebaffe2RbkZwSJECzySY` (FAIL) · `ses_e2af54affffeZahV275aESNHGv` (FAIL)
**Implementer:** `ses_e2b308a53ffef8zBgoUbNIfidm` (two correction cycles)
**Date:** 2026-11-13 · **Risk:** R3 · **Base:** `76e0366`

## Verdict

**FAIL — blocked on one erasure defect that needs a decision.**

| Item | Value |
|---|---|
| 17-file manifest | `a02926b798b636531cdb2e5f57656f8ccbffeb46958cb9c1712343e427982ec6` |

Everything except erasure completeness is verified. Three review passes converged on the same
issue, each time narrowing it.

## What is delivered and verified

`POST /api/members/search` (phone in body, exact E.164 hash match, cap 50, audited with
`phoneHash` + required purpose) · `GET/DELETE /api/members/[id]` · `GET /api/members/[id]/export`
(subject access) · `GET /api/members/export` (marketing-opted-in list) ·
`POST …/withdraw-consent` (LOYALTY clears marketing and blocks resolution; MARKETING clears only
marketing) · `POST …/marketing-consent` (server-derived notice, forbidden after withdrawal or
anonymisation) · `GET /api/reports/loyalty` (gross, discounts by source, net = Σ `Payment.amount`,
refunds as positive magnitude — **a discount is never subtracted from net**).

Also verified: full phone only with `members:pii`; cross-tenant 404; exactly one erasure path
after `anonymiseCustomer` was deleted; receipt body masked and actor-scoped; `phone` capped at 32.

## The defect, and why three passes

| Pass | Finding | Fix applied | Result |
|---|---|---|---|
| 1 | Delete nulled `Order` PII but not `CustomerSession` | Null sessions linked by `Order.customerId` and `DiningSession.customerId` | Still open — unlinked sessions |
| 2 | A guest QR order (no consent) writes the phone into `customer_sessions` with **no** `Order.customerId`, so nothing linked it to the member | Also match sessions whose phone equals the member's E.164 | Still open — format mismatch |
| 3 | **`customer_sessions.customerPhone` stores the raw client value, not E.164.** The live QR checkout submits the national form (`123456789`, or `0123456789` with the trunk 0), so the E.164 equality never matches. This is the **default path**, not an edge case. | not applied | **FAIL** |

Consequences: the row is never purged (`cleanupExpiredSessions` only marks `EXPIRED`), it is still
served to owners via `order.customerSession.customerPhone`, and once `Customer.phone` is nulled a
second delete has no phone left to match — the survivor becomes unrecoverable in place.

## What the fix needs

1. **Normalise at write** in `src/app/api/qr/orders/create/route.ts` — store E.164 in
   `customer_sessions.customerPhone`. This is a **P4-owned file**, outside P6B's scope.
2. **Widen the delete match** to the derivable variants (`0` + national, bare national) so
   existing rows are covered.
3. **Existing data** — any raw-format phone already stored needs a backfill or an accepted
   residual. That is a data-migration decision requiring explicit approval.
4. A behavioural regression test using a national-format session value; the current tests assert
   the exact `where` clause, so they pass while the bug lives (F-02).

## Escalated, not fixed here

**R-02** — PII inside `PaymentBatch.response` and `OrderEvent.payload` JSON snapshots. Delete
nulls the columns but not these copies, and `GET /api/counter/payments/[key]` and the station
event stream serve them. Pre-existing; fixing it means either scrubbing financial/event JSON on
delete or stopping the PII from being persisted there. **P7 decision.**

## Notes

| ID | Note |
|---|---|
| F-03 | A keyed replay returns a masked body to a `members:pii` caller (the live response is full). Accepted as the cost of not storing PII in receipts; document. |
| R-05 | Marketing consent is reachable from the owner API while §18.20.9 says "Counter-only". §18.20.7 lists the endpoint, so the contract contradicts itself. Record at P10. |
| R-04 (old F-04) | `refunds` is structurally always `0.00` because refunds flip `paymentStatus` without writing a negative `Payment`. Route to P8. |
| R-06 | Owner search is an unmetered enumeration surface until P7. |

## Not verified

- No Postgres execution; the `updateMany` relation filter and phone equality are mock-tested only.
- No backfill of existing `customer_sessions` rows.
- `db:seed` still must be re-run for the new permissions.

## Residual risk

- Until the fix lands, a "deleted" member's name, phone and email remain in `customer_sessions`
  and are served to owners — a retention and compliance defect, not merely access control.
- Sessions are never purged, so the exposure window is unbounded.
