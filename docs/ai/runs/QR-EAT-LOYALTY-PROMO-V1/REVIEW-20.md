# Review 20 — QR-EAT-LOYALTY-PROMO-V1 · P7c (limiter rebalance)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · P7c (integrated P7b + P7c)
**Verifiers:** `ses_e27b82cfaffe6Q5vMzKXoMUZrG` (FAIL) · `ses_e279fb9b1ffe4pczblwvGYK3i2` (FAIL) · `ses_e27975154ffeK04OZg1oy4tCOl` (PASS WITH NOTES)
**Implementer:** `ses_e27d3313affe7QK5Xbb4XGTzgc`
**Date:** 2026-11-14 · **Risk:** R3 · **Base:** `cb53b3e`

## Verdict

**PASS WITH NOTES.** P7c closes, and with it P7.

## What P7c changed

| Item | Result |
|---|---|
| One count per order | ✅ quote counts, create with a phone-bound `quoteId` does not re-count |
| Guest quotes not counted | ✅ no query at all |
| Per-phone 10/h, per-session 10/h | ✅ **unchanged** — the controls that work |
| Per-restaurant ceiling | ✅ owner-set, default 30, validated 1–1000 in zod, service and a DB CHECK |
| Per-IP floor | ✅ 120/h (contract says 20 — P10 note) |
| Fixed windows retained | ✅ accepted; boundary burst not material at these volumes |
| Fail-open on limiter error | ✅ allows the request, logs once, records a distinct event |
| Refusal recorded | ✅ `loyalty_rate_limited`, deduped, with `restaurantId`; counted in the report |
| QR refusal copy | ✅ "Please order at the counter — our staff will help." |
| Migration | ✅ additive, `NOT VALID` + `VALIDATE`, parity empty, existing rows valid |
| Cleanup job | ✅ hourly, 24h retention, idempotent |

## Two FAILs, same root cause

The rebalance opened a hole, and the first fix only closed half of it:

| Pass | Finding | Fix |
|---|---|---|
| 1 | The limiter was skipped for **any** create with a `quoteId`, so a **guest** quote (0 counts, reusable) plus a phone created unlimited `Customer` rows before the mismatch rejection | Reject a guest quote + phone before any member write; skip the limiter only for phone-bound quotes |
| 2 | The same root cause survived on a **phone-bound** quote: quote for phone A + phone B still wrote a `Customer` for B, uncounted | Compare `hashPhone(supplied)` to `quote.phoneHash` **before** `resolveMember()` |

**Verified now:** no unauthenticated attacker can create a `Customer` row without being counted. Every member write sits behind either the quote endpoint's limits or the create endpoint's limits plus the binding guard.

## Direct answers

**Can a busy restaurant serve a full lunch without a legitimate refusal?** Yes, on a correctly proxied deployment with the ceiling raised — one order now costs **one** unit, and the guest quote costs nothing.

**Can an attacker still enumerate?** Not through the quote path. Probing is charged before member resolution; the refusal is generic with a rounded retry and no bucket or member signal.

## Deviations recorded for P10

| # | Deviation |
|---|---|
| 1 | Per-IP floor is **120/h**, contract says 20 — per-IP is a coarse control that proxies defeat and shared WiFi trips |
| 2 | **Fixed hourly windows** retained; OWASP discourages them, but the boundary burst is not material at 10–30/hour |
| 3 | Refusal dedupe uses a Prisma **JSON-path filter** on `SecurityEvent.eventData` — unit-tested, not exercised on Postgres |
| 4 | `src/instrumentation.ts` added to the owned files to start the cleanup job — correct placement, unrecorded until now |

## Open items recorded

| ID | Severity | Item |
|---|---|---|
| **P7c-1** | M | The **`unknown` IP bucket is still 10/h** when no trusted XFF is present — verify the Railway edge appends it, or a deployment without it refuses the 11th phone-bearing quote per hour. Now scoped per restaurant, so it no longer collapses the whole platform. |
| P7c-2 | M | **Fail-open can be self-inflicted**: all phone-bearing requests for one restaurant serialise on one counter row inside a transaction; a flood can time out transactions and fail open, temporarily bypassing the per-phone limit. Visible via `loyalty_rate_limit_unavailable`. |
| P7c-3 | L | The **IP floor cannot be raised** by the owner — a venue on one egress IP is capped at 120 phone-bearing quotes/hour |
| P7c-4 | L | The cleanup job never prunes at startup; a process restarted more often than hourly never prunes |
| P7c-5 | L | `SecurityEvent` index leads with `eventType`, so the report's tenant-scoped refusal count cannot use it optimally |
| P7c-6 | L | The report service exposes `refusals`, but the owner report **UI does not render it** yet |
| P7c-7 | L | A **matching** phone with a different name overwrites the existing member's name — requires the phone and valid consent, costs a counted unit; recommend setting `name` only on create or when null |
| P7c-8 | L | A create on a guest quote carrying a known phone consumes that phone's bucket before the 409 — arguably correct (the attempt is counted), but it is a 10/h lockout lever against a known number |
| P7c-9 | L | Plain `CREATE INDEX` on the existing `security_events` table — P9 deploy note if the table is large |

## Not verified

- Real-Postgres rollback of the two migrations (apply is proven; rollback is by design, not executed).
- Railway edge XFF behaviour (P7c-1).
- No mutation-executed red proof of the binding guard (established by base-code inspection).

## Residual risk

- Unbounded `Customer` inserts are closed, but a **read-only** quote probe remains uncounted when the create carries a phone-bound quote.
- Key rotation between quote and create turns legitimate phone-bound creates into `QUOTE_CHANGED`.
- Same-model verification shares blind spots.
