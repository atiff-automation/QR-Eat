# Review 05 — QR-EAT-LOYALTY-PROMO-V1 · P3 (member, consent, quote)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · phase P3
**Verifiers:** `ses_e2d295544ffe8Vs7xNUksYLs5d` (P3 full) · `ses_e2d1c1ca8ffeuxRjKcsA2R9FXy` (P3 delta)
**Implementer:** `ses_e2d351d28ffeHwZGbrwodB9a3S`
**Date:** 2026-11-13 · **Risk:** R3 · **Base:** `27cd38a`

## Verdict

**PASS WITH NOTES.** One correction cycle; no medium or high findings.

| Item | Value |
|---|---|
| P3 files (10), per-file listing hash | `77695a7b226eb9ce461b75ade930538b5120855ee23092f67d6886797917c41b` |
| P3 files, concatenation hash | `82c5e7d55f4835f090a078d8d3040e7ba9cca04965875422129a111ae11a3a35` |
| Prior (pre-correction) concatenation hash | `a1ae351e1f2f412eb9061776bf32aaf8736588264296f55446d8c497adb2a4e0` |

## Scope delivered

`src/lib/loyalty/{flags,phone,consent}.ts` and
`src/lib/services/{loyalty-customer-service,loyalty-quote-service}.ts` plus five test
suites. No routes, no `src/app/**`, no `prisma/**`, no P2 module changes.

## First-pass findings

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| F-01 | low | `maskPhone` hid zero digits for short national parts (`+601` → `+60•1`). Latent — the function had no callers, and `normalisePhone` rejects <8 digits. | **FIXED** — generic `+••••`; sweep of 1,111,110 inputs found 0 leaks beyond country code + last two. |
| F-02 | low | Existing-row `updateMany` omitted `status: 'ACTIVE'` and ignored `count`, so a concurrent anonymise could attach an `ANONYMIZED` customer. | **FIXED** — `status` in the `where`, `count` checked, single re-read, typed guest fallback; test is red-capable. |
| F-03 | low | `new Decimal(expectedTotal)` throws a raw `DecimalError` on malformed input instead of `QUOTE_CHANGED`. | **Carried to P4** — validate with zod before calling. |
| F-04 | low | `consumeQuote` does not check the session/table component of the §18.20.15 B binding tuple. | **Carried to P4** — extend the input and enforce. |
| F-05 | low | `anonymiseCustomer` nulls `Customer.phone/name` but not `Order.customerName/customerPhone`. | **Carried to P6** — §18.20.9 requires order/session PII nulled in the delete flow. |
| F-06 | low | Missing P3 run-log entry; `NEXT.md` stale. | **FIXED** by Lead. |
| F-07 | low | Cross-tenant quote tests mock `findFirst` to return `null` without asserting the scoped `where`. | **Carried** — tighten when P4 touches the same queries. |

## Delta findings

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| N-01 | low | The F-02 race fallback returns `LOYALTY_DISABLED`, which `message.ts` renders as "Loyalty is off for this restaurant." §18.20.12 has no code for "member could not be resolved". | **Carried to P4** — must not render the disabled copy for this path; use the generic loyalty-error copy, and note the contract gap for P10. |
| N-02 | low | P3 is untracked; the review is hash-bound, not commit-bound. | **Open** — commit when authorized. |
| N-03 | info | Short-mask test list omits `+12` (behaviour verified independently). | Later test pass. |
| N-04 | info | If the re-read finds the same row still `ACTIVE`, the function returns success without applying the consent update. Unreachable today (nothing transitions `ANONYMIZED` → `ACTIVE`). | Note; revisit only if a reactivation path is ever added. |

## Independently verified

- **PII containment:** no `console.*` in P3 source; no full phone in any throw, message or returned object; `hashPhone` throws a generic typed configuration error; the mask sweep found no leak.
- **HMAC fail-closed:** missing, empty and whitespace-only keys all throw; no fallback key; key never logged; digest independently recomputed in the test.
- **Consent:** `resolveNotice` returns null when version/text/hash/privacyUrl is missing or inconsistent; `verifyConsent` uses `timingSafeEqual` on equal-length buffers with a length-mismatch guard; server-derived values are what get persisted.
- **Tenant isolation:** every customer and quote query carries `restaurantId`; composite FKs make cross-tenant references structurally impossible; the anonymise path is tenant-scoped.
- **Flags:** only the exact string `"true"` enables; both the global flag and `LoyaltySettings.enabled` are required; no settings-only path.
- **Quote:** 128-bit `randomBytes(16)` base64url (closes REVIEW-01 R-06); TTL 10 min with exact-boundary rejection; single use via conditional `updateMany` with `count` check; `customerId` over `phoneHash`; guest quote cannot gain a member; `QuotePromotion` rows written; `consumeQuote` uses the caller's `tx` only.
- **`cartHash`:** order-independent, changes on item/quantity/option/price, delimiter injection not possible.

## Not verified

- No database integration test: tenant scoping is asserted at query-shape level and by composite FKs. Real Postgres cross-tenant and concurrent consume/anonymise tests belong to P7/P9.
- `resolveOrCreateCustomer` and `maskPhone` have no production callers yet.
- The re-read `ACTIVE` branch is unreachable by inspection and was not exercised.

## Residual risk

- **N-01 is a UX trap for P4:** `LOYALTY_DISABLED` must not surface as "Loyalty is off" for a transient resolution race.
- A legitimate concurrent re-enrolment after anonymise loses the attach for that request — safe, but the customer must re-quote.
- Mocked Prisma means the partial-unique race is proven by construction, not by Postgres.
- P3 is untracked until committed (N-02).
- Same-model verification shares blind spots; R3 still warrants a different-model or human pass before release.
