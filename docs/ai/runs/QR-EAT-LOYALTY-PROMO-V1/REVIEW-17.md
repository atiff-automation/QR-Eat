# Review 17 — QR-EAT-LOYALTY-PROMO-V1 · P6C2b (members + report UI)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · phase P6C2b
**Verifier:** `ses_e28b0f44bffe6Ws9GlgL3z5j3m` · **Implementer:** `ses_e28c6b38cffeLGI2VF9N6Y7hb0`
**Date:** 2026-11-14 · **Risk:** R3 · **Base:** `643cec6`

## Verdict

**PASS WITH NOTES.** P6C2b closes, and with it **P6**.

| Item | Value |
|---|---|
| 21 files, combined digest | `05f0e0ffd8020731868d097170045b6a5d97530cf415ff8ebd76a7a1fce8b241` |

## Delivered

`/dashboard/members` — search by phone, profile, export (single and opted-in list), withdraw consent, marketing consent, delete with confirmation. `/dashboard/reports/loyalty` — visits, rewards, discounts by source, redemptions by scope, member counts, repeat rate, gross/net/refunds. Plus the four carried notes.

## Direct answer

**Can a user without `members:pii` obtain a full phone from these screens? — No.** The server nulls `phone` without the permission, the results list renders only `maskedPhone`, the profile card re-masks even if a full phone arrives, and both CSVs are masked server-side. The phone travels only in a JSON body — never a URL, `title`, log or analytics event.

## Carried notes closed

| ID | Disposition |
|---|---|
| **L-06** | `DEFAULT_SETTINGS.rewardLabel` is now `'10% off'` — currency-neutral, with the cap carried by `maxDiscount`. No test depended on the old string. |
| **L-01** | Contrast regression assertions added to both rendering suites; red-capable. |
| **L-05** | Promotions page waits for resolved settings instead of defaulting to MYR; a non-MYR restaurant renders its own currency. |
| **V-01** | `buildRuleCopy` prefers the quote's card snapshot where it can disagree; before a member is known it still uses the notice. Reasoning confirmed sound. |

## Verified

- Search sends the phone in the body with a fixed, meaningful `purpose`; the server requires it.
- Delete uses a fresh `Idempotency-Key` per invocation and states plainly that the member is anonymised while financial records are kept.
- Report renders `net` from the server — the test deliberately sets `net: '79.99'` and forbids a recomputed `80.00`.
- Every action is gated by its permission, and gated queries do not fire before permission resolution.
- Empty, loading, error and permission-denied states on both screens; labels, 44px targets, contrast, `role="alert"`/`role="status"`, no colour-only signalling.
- No API route, `prisma/**`, payment service or `docs/ai/**` change.

## Notes carried (added to `OPEN-ITEMS.md`)

| ID | Note | Route |
|---|---|---|
| L-01 | A failed export is not surfaced in-page — `<a download>` renders or saves the JSON error body | P10 / backlog |
| L-02 | One vacuous PII assertion in `useMembers.test.ts` (checks `undefined`) | Optional |
| L-03 | Contrast assertions are source-text scans, not rendered-style checks | Accepted (no jsdom) |
| L-04 | The report's default range uses the browser's local date, so it can be a day off near the business-day close | Low product item |
| L-05 | Repeat rate renders the raw ratio (`0.3333`) rather than a percentage | Low product item |
| L-06 | The reports index "Rewards" card and nav item are not gated on `loyalty:report` (consistent with existing cards) | Optional |
| L-07 | `ConfirmationModal` buttons are 40px and it has no Escape handling — pre-existing shared component | Backlog |
| L-08 | Exact-match search is an existence oracle for `members:read` without `members:pii`; mitigated by P7-3/P7-5 rate limits | P7 |
| L-10 | Owner hint exposes an implementation detail ("sent in the request body only") | Cosmetic |

## Not verified

- No browser interaction (no jsdom); both page tests are static markup with mocked hooks.
- No live API/DB round trip.
- Export failure mode reasoned from the `download` attribute, not observed.
- Contrast computed from Tailwind hex, not measured.

## Residual risk

- An owner may believe a failed subject-access export succeeded (L-01).
- The search existence oracle persists until P7-3/P7-5 land.
- No DB-backed proof of the member/report endpoints (P9-1).
- Same-model verification (P11-2 still open).
