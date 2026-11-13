# Open items — QR-EAT-LOYALTY-PROMO-V1

**Purpose:** one register for every carried finding, so nothing depends on chat memory.
Check this at every phase gate; close it out at P10.

**Status:** open · **Updated:** 2026-11-14 · **HEAD:** `7a884ce`

Severity: **H** high · **M** medium · **L** low · **D** decision needed.

---

## Decisions needed before P9

| # | Item | Severity | Context | Done when |
|---|---|---|---|---|
| D-1 | Restaurant delete: `Restrict` FKs vs the cascade in `src/app/api/restaurants/[id]/route.ts` (P1 `REVIEW-01` R-01) | **D, M** | Deleting a restaurant with members or discounts may now fail as a generic 500. Product choice: fail closed with a typed 409, or soft-delete tenants. | A ruling is recorded and the admin route returns a typed error or a soft delete. |
| D-2 | Full phone on the Counter bill response (P5A `REVIEW-07` R-02) | **D, M** | A cashier with `orders:read` but not `members:pii` receives `orders[].customerPhone`. Pre-existing; §18.20.9 requires `members:pii`. | Mask, gate behind `members:pii`, or accept with a recorded rationale. |

## P7 — security and privacy

| # | Item | Severity | Source | Done when |
|---|---|---|---|---|
| P7-1 | `ORDER_CREATE.requestHash` is an unkeyed SHA-256 over the raw phone, persisted 24h — brute-forceable | **H** | `REVIEW-13` F-08 | Keyed HMAC (`hashPhone`) or the phone excluded from the hash. |
| P7-2 | QR create sends no `Idempotency-Key` | M | `REVIEW-15` V-03 | A key is sent; depends on P7-1 so the hash is not unkeyed. |
| P7-3 | Durable rate limits per §18.20.15 B (10/phoneHash/hr, 30/restaurant/hr, 10/session/hr, 20/edge-IP/hr) | **H** | `REVIEW-01`/`REVIEW-03` | Enforced and tested against a real database. |
| P7-4 | Trusted edge IP (proxy-appended only; never a client header) | **H** | §18.20.15 B | Client-supplied `X-Forwarded-For` is provably ignored. |
| P7-5 | Enumeration alert: 5 distinct `phoneHash` misses from one IP in 10 min | M | `REVIEW-03` N-03 | A detection path exists with a documented response. |
| P7-6 | `rate_limit_counters.scope` is free `TEXT`; a typo fails as Postgres 23514 at runtime | L | `REVIEW-03` N-02 | One typed constant shared, and the failure mapped to a contract error. |
| P7-7 | Full-phone audit completeness | M | §18.20.14 A | Every full-phone read, search and export audited with actor, target, purpose, timestamp. |
| P7-8 | Cross-tenant returns 403 on the legacy bill route (`requireTableAccess`) instead of 404 | L | `REVIEW-09` | A decision recorded: keep 403 for the frozen legacy route, or align to 404. |
| P7-9 | Verify R-02 (PII in payment/event JSON) rather than rebuild it | — | `REVIEW-13` | Confirmed implemented and covered by a test. |

## P8 — reports

| # | Item | Severity | Source | Done when |
|---|---|---|---|---|
| P8-1 | `refunds` is structurally `0.00` — the refund path writes no negative `Payment` | **M** | `REVIEW-12` F-04 | Refunds derived from `paymentStatus = REFUNDED`, or negative `Payment` rows written; decision recorded against §18.20.8. |
| P8-2 | Promotion swap updates the ACTIVE row in place, so redemption history relies on the audit log | L | `REVIEW-09` F-8 | Either append a new row or document that P8 reads the audit log. |

## P9 — rollout (the pilot gate)

| # | Item | Severity | Source | Done when |
|---|---|---|---|---|
| P9-1 | No real-Postgres proof of locks, unique constraints, CHECKs, `@db.Date` or concurrency | **H** | `REVIEW-08`, `REVIEW-09` | A seeded scratch-DB drill passes the list in `REVIEW-08`. |
| P9-2 | QR create bumps `billRevision` without the `loyalty-bill` lock; counter create never bumps it | **H** | `REVIEW-09` F-10 | Every bill-mutating writer bumps the revision under the lock. |
| P9-3 | Unique-conflict classification depends on Prisma `meta.target`; a raw-SQL partial-index P2002 surfaces as a 500 | M | `REVIEW-08` F-04 | Proven against Postgres, or classification made index-name aware. |
| P9-4 | Pre-existing environments need `evidence/dev-pii-cleanup.sql` | M | `REVIEW-13` F-02/F-03 | Run on every environment created before the P6B normalisation. |
| P9-5 | `db:seed` must be re-run for the new permission rows, or every owner endpoint 403s | **H** | `REVIEW-11`, `REVIEW-12` | Deployment runbook includes the seed step. |
| P9-6 | Migration fresh + upgrade paths and a rollback drill | **H** | `REVIEW-01` R-05 | Both paths pass; rollback (flag off) drilled. |
| P9-7 | Pre-existing `expenses` index-name drift can emit an unrelated `RenameIndex` | L | `REVIEW-03` N-12 | Fixed or explicitly ignored. |

## P10 — contract freeze and Counter handoff

| # | Item | Severity | Source | Done when |
|---|---|---|---|---|
| P10-1 | Join tables used instead of `uuid[]` (J permits, D says `uuid[]`) | M | `REVIEW-03` N-09 | Recorded in `docs/PRODUCT/API-CONTRACT.md` citing §18.20.14 J. |
| P10-2 | `MEMBER_RESOLUTION_FAILED` reuses `LOYALTY_DISABLED` | L | `REVIEW-06` F-03 | Recorded as a contract gap or given a dedicated code. |
| P10-3 | Stored/replayed payment bodies no longer carry `customerName`/`customerPhone`; the live response does | M | `REVIEW-13` F-05 | Recorded; Counter told not to rely on those fields in the recovery path. |
| P10-4 | A malformed phone now also drops the guest name/email | L | `REVIEW-13` F-04 | Recorded. |
| P10-5 | Marketing consent reachable from the owner API although §18.20.9 says "Counter-only" | L | `REVIEW-12` R-05 | Recorded as an extension with the actor and source fields. |
| P10-6 | Generic request codes outside §18.20.12 (`NOT_FOUND`, `CART_EMPTY`, `INVALID_REQUEST`, `IDEMPOTENCY_KEY_REQUIRED`, `MEMBER_ANONYMIZED`, `CONSENT_WITHDRAWN`, `LOYALTY_CONFIGURATION_ERROR`) | L | `REVIEW-06`, `REVIEW-11`, `REVIEW-12` | Confirmed permitted or recorded. |
| P10-7 | Payments `PUT` treats a missing `Idempotency-Key` as success, against the literal §18.20.7 | L | `REVIEW-11` M-02 | Recorded or a contract amendment obtained. |
| P10-8 | `businessDayCloseTime` is returned by payments `GET` but not accepted by `PUT` | L | `REVIEW-11` L-07 | Interpretation recorded. |
| P10-9 | The promotions form blocks same-day windows the server would accept | L | `REVIEW-16` R-09 | Recorded, or the rule relaxed to `endsAt < startsAt`. |
| P10-10 | The QR confirmation shows the whole session bill, not just the created order | L | `REVIEW-15` V-02 | Recorded for the Counter handoff. |
| P10-11 | A projected reward in the displayed total can differ from an offline-settled amount | L | `REVIEW-15` V-05 | Recorded against acceptance 19. |

## Backlog — separate tasks, not this one

| # | Item | Source |
|---|---|---|
| B-1 | `docs/WEB-UI-STANDARD.md` prescribes `text-red-600` on `red-50` = 4.41:1, below 4.5:1, on every page | `REVIEW-16` L-02 |
| B-2 | Lint baseline is red (62 errors, 11 warnings) | `AGENTS.md`, AME-002 |
| B-3 | Duplicated projection/label/money helpers across loyalty services and UI | `REVIEW-09` F-7, `REVIEW-16` R-05 |
| B-4 | No jsdom, so no React render/interaction tests | `REVIEW-15` V-07 |
| B-5 | Cosmetic: raw permission keys in owner copy; one-frame `hasChanges`; passthrough test | `REVIEW-16` L-03/L-04/L-07 |
| B-6 | A stale linked worktree remains at `.../worktree/770812/cosmic-squid` | Session note |

## P11 — final R3 review

| # | Item | Done when |
|---|---|---|
| P11-1 | Four-lens review (Security, Payments & Reliability, Data & Migration, Product/UX) | `REVIEW-*.md` written, PASS/PASS WITH NOTES |
| P11-2 | Different-model or human pass on the payment and migration paths | Recorded — every review so far has been same-model |
