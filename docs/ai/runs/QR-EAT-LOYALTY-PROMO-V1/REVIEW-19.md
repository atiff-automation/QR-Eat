# Review 19 — QR-EAT-LOYALTY-PROMO-V1 · P7b (enumeration + PII residuals)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · phase P7b
**Verifiers:** `ses_e281a504fffettExTvLzJ0pxgL` (FAIL) · `ses_e28086d12ffeCIiOwqnuOjL5jx` (H-1 delta, PASS WITH NOTES)
**Implementer:** `ses_e282eebeeffeIQK44lMZxnV4qC`
**Date:** 2026-11-14 · **Risk:** R3 · **Base:** `06a70b7`

## Verdict

**H-1 closed. H-2 requires an owner decision — P7b is `owner_decision_required`, not committable.**

| Item | Value |
|---|---|
| 20 files, combined | `c083b355408680351f3e6e794bade4d1cffa59696b27b1221fa8edcfa2f33e82` |
| H-1 delta | `3673873aac8e091159d6b06ba91820df4fc3b6e456e2effac032c8d831588126` |

## H-1 (high) — fixed

`buildCounterOrderRequestHash` called `hashPhone`, which throws without `LOYALTY_PHONE_HMAC_KEY`, so **with loyalty off every Counter and takeaway order returned a 500** — a direct violation of acceptance 21.

Fixed: when the key is absent, the hash is computed **without phone and name** (unkeyed SHA-256, no PII digest) instead of throwing. With the key present it stays a keyed HMAC. The loyalty member and QR paths still fail closed; the fallback is reachable from exactly one call site.

Verified: loyalty-off, no-key Counter create and offline replay both succeed; two orders differing only by phone store the same digest; no PII in the fallback; keyed behaviour unchanged; response shape untouched.

**Accepted trade-off (N-01):** with no key, reusing a key with a *phone-only or name-only* change replays the old order instead of `IDEMPOTENCY_MISMATCH`. No duplicate orders — the lookup is by unique key — but it is not byte-identical pre-feature behaviour.

## H-2 (high) — the rate limits will refuse real customers

This is in **P7a's committed code** (`06a70b7`), found while reviewing P7b.

`buildBuckets` always adds `RESTAURANT` and `EDGE_IP`, and the quote route enforces them for **guest (no-phone) requests** too. The QR review fires a guest quote on mount, then a phone quote, then a create — roughly **3 bucket consumptions per order**.

| Bucket | Limit | Consequence |
|---|---|---|
| `RESTAURANT` | 30/hour | ≈ **10 orders/hour per restaurant** |
| `EDGE_IP` | 20/hour | ≈ **6–7 orders/hour** — and restaurant customers share the venue's WiFi public IP |
| `unknown` (no XFF) | 10/hour | **every caller shares one bucket** |

So a busy loyalty-enabled restaurant would return `RATE_LIMITED` to paying customers. The limits come from the frozen contract (§18.20.15 B), so changing them is a contract decision, not a code one.

## M-1 (medium) — the "miss" definition

A miss is `resolveOrCreateCustomer(...).isNew === true`, i.e. a **successful first-time enrolment**. Consequences:

- every genuinely new customer counts as a miss;
- 5 new members in 10 minutes from one NAT — normal for a busy service — raises a false `loyalty_enumeration_alert`;
- a probe that supplies **no consent** produces **no miss at all**, so the cheapest enumeration is invisible.

The alert is warning-only and deduped per IP per window; it never blocks. But it is noisy by construction, and the contract mandates the miss-based definition.

## M-2 / M-3 (medium) — `SecurityEvent` schema gaps

- **M-2:** no index on `(eventType, ipAddress, createdAt)`, so every new-member request full-scans `security_events`.
- **M-3:** no `restaurantId`, so misses from different restaurants sharing an IP aggregate into one platform-wide alert.

Both need a small additive migration — a schema change requiring approval.

## Verified

- Counter-order hash keyed with the key present, PII-free without it, fail-safe rather than fail-closed.
- Four bucket increments in one transaction; a refusal rolls back earlier increments (logic proven against mocks).
- Enumeration writes `loyalty_lookup_miss` with `{ phoneHash }` only — no phone in any event, log or response.
- R-02 verified rather than rebuilt: no customer phone/email in `PaymentBatch.response`, `IdempotencyRecord.responseJson` or `OrderEvent.payload`.
- The create route logs no error object; the four Counter member routes map a missing key to a typed `LOYALTY_CONFIGURATION_ERROR`.
- No `prisma/**`, payment service or UI change.

## Not verified

- Real-Postgres transaction rollback and concurrency (P9).
- Whether the deployment sets `LOYALTY_PHONE_HMAC_KEY`.
- Whether the Railway edge appends `X-Forwarded-For` (P7b-3).
- Real restaurant WiFi/NAT behaviour — the self-DoS is inferred from code, not measured.

## Residual risk

- **The committed P7a rate limits can refuse legitimate customers until H-2 is resolved.**
- Key compromise makes retained `Order.idempotencyHash` and `Customer.phoneHash` re-identifiable; key rotation breaks replay (P7b-8).
- Detection is global and noisy (M-1, M-3).
- Same-model verification shares blind spots.
