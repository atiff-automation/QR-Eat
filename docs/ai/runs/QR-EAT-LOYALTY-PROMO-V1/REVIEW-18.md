# Review 18 — QR-EAT-LOYALTY-PROMO-V1 · P7a (rate limits, trusted IP, F-08)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · phase P7a
**Verifiers:** `ses_e285a545fffeecsG6KhTw2jcKH` (P7a, PASS WITH NOTES) · `ses_e28383afaffemSeoCQysQKYZlp` (F-01 delta, PASS WITH NOTES)
**Implementer:** `ses_e286ba1a0ffeN0S3dePmNwo6GU`
**Date:** 2026-11-14 · **Risk:** R3 · **Base:** `a55b594`

## Verdict

**PASS WITH NOTES.** P7a closes.

| Item | Value |
|---|---|
| P7a 12 files, combined | `937fdfcb5df7a3cba71aedcdafa8312143d5fc5cdda15fad5e8b738b1de6b375` |
| F-01 delta, 2 files | `b65d983126c3bb5a82397b03bc3ba890c018d7729e63faf0dea2b607d18c5b7e` |

## Delivered

Durable hourly rate limits over the existing `rate_limit_counters` table, a trusted-IP resolver that refuses to believe a client header, and the keyed request hashes.

| Bucket | Limit / hour | Refused at |
|---|---|---|
| `PHONE_HASH` | 10 | 11th |
| `RESTAURANT` | 30 | 31st |
| `QR_SESSION` | 10 | 11th |
| `EDGE_IP` | 20 | 21st |
| `unknown` sentinel | 10 (strictest) | 11th |

## Verified

- **Atomic** — one `INSERT … ON CONFLICT … DO UPDATE … RETURNING` per bucket. Two concurrent requests cannot both pass.
- **Refusal** — `RATE_LIMITED` with a positive `retryAfterSeconds` and a `Retry-After` header; the body carries no phone, hash, member or visit signal.
- **Ordering** — enforced **before** phone resolution, so a refused request costs nothing and cannot distinguish a member from a non-member.
- **Trusted IP** — the **last** `X-Forwarded-For` entry (proxies append, clients prepend); a spoofed first entry is provably ignored; `X-Real-IP`, `CF-Connecting-IP` and `Forwarded` are ignored; falls back to the shared `unknown` bucket at the strictest limit.
- **F-08** — `orderCreateRequestHash` is keyed; the digest is not reproducible without the key; a missing key fails closed.
- **F-01** (found by the review, fixed in the same pass) — `memberChangeRequestHash` was still an unkeyed SHA-256 over the member phone, stored 24h. Now keyed, payload unchanged, three red-capable tests.
- **Flag-off** — no rate-limit rows written, no settings read, existing behaviour byte-identical.

## Direct answer

**Can an attacker enumerate member phones through the QR endpoints after this change?** Throttled, not eliminated — and never through a refused request. A successful quote still reveals membership (`visitState`, `visit`, `message`), bounded to 20/h per trusted IP and 30/h per restaurant. The refusal path leaks nothing. **The P7b enumeration alert is still required to detect probing.**

## Open items recorded (added to `OPEN-ITEMS.md`)

| ID | Severity | Item | Route |
|---|---|---|---|
| **P7b-1** | **M** | `buildCounterOrderRequestHash` is **still** an unkeyed SHA-256 over `customerPhone`, stored as `Order.idempotencyHash` with **no expiry**, and it survives anonymisation (the plaintext phone is nulled, the digest is not). Third instance of the same class. | **P7b** |
| P7b-2 | M | Shared-bucket cascade: a refusal at a later bucket does not undo earlier increments, so one client can exhaust the 30/h restaurant bucket for everyone | P7b |
| P7b-3 | M | Trusted-IP depends on the edge appending `X-Forwarded-For`. If it does not, the last entry is client-controlled and only the restaurant bucket bounds enumeration | **P9 — verify Railway** |
| P7b-4 | L | Create limits apply to the legacy no-quote path, so a normal order consumes the restaurant bucket twice (≈15 orders/h) | P7b |
| P7b-5 | L | No retention/cleanup job for `rate_limit_counters`; rows accumulate one per bucket/subject/hour | P9 |
| P7b-6 | L | The create route's generic `console.error` could log a Prisma error containing the IP subject | P7b |
| P7b-7 | L | A missing HMAC key surfaces as a generic 500 rather than a typed configuration error on the member routes | P7b |
| P7b-8 | L | Changing the hash invalidates in-flight `ORDER_CREATE`/`MEMBER_CHANGE` idempotency records at deploy | P9 rollout note |

## Not verified

- No real-Postgres concurrency test — atomicity is proven by the single-statement SQL and inspection, not an empirical race. **P7-3 stays open.**
- Real edge-proxy XFF behaviour unverified (P7b-3).
- `npm run build` was not run in the F-01 delta (it was in the P7a pass).

## Residual risk

- Enumeration is bounded, not prevented; the alert is the remaining mitigation.
- NAT aggregation: many customers on one public IP share the 20/h bucket.
- If the edge does not set XFF, every caller shares the `unknown` bucket at 10/h (self-DoS) — or, worse, the last entry is spoofable.
- `Order.idempotencyHash` keeps a brute-forceable phone digest after anonymisation until P7b-1.
