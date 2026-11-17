# Review 30 — QR-EAT-LOYALTY-PROMO-V1 · P11-fix

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · P11-fix
**Verifiers:** `ses_e1c8e1e50ffelra7fKZUBWx1ww` (**FAIL**) · `ses_e1c73ae61ffeY9H02IqRdoqfST`
(PASS WITH NOTES, delta)
**Implementer:** `ses_e1cb5d4f1ffeq8xMMskha1bT3M`
**Date:** 2026-11-16 · **Risk:** R3 · **Base:** `0a6bbe8`
**Final tracked diff hash:** `3bcfe46e4c26fa20b51ff9d3d3da26d4def08e5630e97f9080e655a5d2b0bef8`

## Verdict

**PASS WITH NOTES.** One correction cycle. The eight blockers are closed; the freeze is now
blocked only by the **human pass** on the payment and migration paths.

## What changed

| Finding | Result |
|---|---|
| **B-UX-1** | A guest quote with a phone and no consent returns a **200 guest order** with `loyaltyError` (`CONSENT_REQUIRED`, `CONSENT_STALE`, `PHONE_INVALID`), writing no member/consent/visit/card. The QR client no longer sends a phone without consent; the copy no longer says "before paying". |
| **S-1** | Financial settings are owner-only on **both** routes: `/financial` and the financial fields of `PUT /api/settings/restaurant` (the route the UI actually uses). The Financial section is hidden for non-owners. |
| **S-3** | A malformed phone counts only the IP bucket; a valid phone still counts all four. Limits unchanged. |
| **B-PAY-1** | The legacy payment path applies cash rounding: `cashPayable`, `roundingAdjustment`, change from `cashPayable`; `NONE` and card unchanged. |
| **B-PAY-7** | A customer-level card lock (`loyalty-card:{restaurant}:{customer}`) is taken before the day and bill locks; order is card → day → bill. |
| **S-2** | `docs/ENVIRONMENT.md` is the tracked source of variable names; the HMAC variable is correct. |
| **B-PAY-4** | An offline replay requires `expectedTotal`; missing → `BILL_CHANGED` before any write. |
| **B-PAY-2** | One effective-business-date rule for the Z, P&L and loyalty report: batch `businessDate` when present, else the payment's `createdAt`. |
| B-PAY-3 | Cash requires `expectedCashPayable`; stale/missing → `AMOUNT_MISMATCH` before writes. |
| B-PAY-5 | The handoff says reload, verify via `GET /payments/{key}`, then a **new** key. |
| B-PAY-6 | A quote-less create takes the bill lock and bumps the revision while loyalty is on; the flag-off path stays byte-identical. |
| B-UX-2/3 | The handoff documents the notice shape/mapping and the modify **body** contract. |
| D-2 | The cleanup prunes expired quotes (24h) and idempotency records. |
| D-3 | The PII cleanup has a dry-run count and a date bound. |
| D-6 | The runbook notes the menu/security index locks during deploy. |

## The finding that mattered

**H-1 — the S-1 fix was bypassable.** The first correction made `/api/settings/restaurant/financial`
owner-only, but the owner UI saves tax through `PUT /api/settings/restaurant`, which still required
only `settings:write` and spread the body. A manager could still change tax. Fixed with a
five-field guard on the parent route, before any write, plus a UI hide. This is exactly the kind of
bypass a review exists to catch: the acceptance test passed while the intent did not.

## Verified

- **Consent:** the guest fallback returns 200 with `loyaltyError`; no Customer/consent/visit/card
  write; consent-valid on a guest quote still `QUOTE_CHANGED`; the client omits the phone.
- **Permissions:** manager 403 on both routes with no write; owner 200; non-financial settings still
  available to managers; the guard precedes `prisma.update` and `revalidateTag`.
- **Rounding:** the drawer identity holds by construction; `NONE` and card unchanged; existing
  flag-off tests unchanged.
- **Reports:** the three reports agree on an offline replay across the cutoff; online unchanged.
- **Guards:** missing cash total and missing offline total are refused before writes, with the
  correct codes.
- **No regression:** 1444 passed / 11 skipped / 1455 total; type-check and build green; no schema,
  migration, dependency or limit change; Tabtep worktree clean.

## Carried

| ID | Note | Route |
|---|---|---|
| **M-1** | The B-PAY-7 test is sequential; the cross-cutoff race is not run under concurrency. The lock is logically sound and inspection-verified. | P11 follow-up or drill extension |
| L-1 | `getCounterSalesPage` and `getTopItemsForRange` still range by `createdAt`; an offline replay can disagree with the Z summary there. | Backlog |
| L-2 | An open day's Z range now ends at the cutoff end rather than `now`; benign (no future-dated payments). | Recorded |
| N-1 | Other `restaurant.update` routes (`PATCH /api/restaurants/{id}`, profile) spread the body; reachable only with `restaurants:write`, which a default manager lacks and a platform admin is blocked from by tenant access. | Backlog |
| N-3 | A platform admin on the parent settings PUT gets a 500 (RBAC error not mapped) rather than 403; refused either way. | Backlog |
| N-2 | The parent-route test exercises `taxRate` only; a table-driven case would pin all five fields. | Backlog |

## Not verified

- The drill was not re-run by the verifier (it writes to the database); the implementer ran 47/47.
- No live database or migration apply.
- The Counter client does not exist.
- **The human pass on the payment and migration paths is pending and is a condition of the freeze.**
