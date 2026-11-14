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

## Added by P6C2b (`REVIEW-17`)

| # | Item | Severity | Source | Done when |
|---|---|---|---|---|
| P6C2b-1 | A failed export is not surfaced in-page — `<a download>` renders or saves the JSON error body, so an owner may believe a subject-access export succeeded | M | `REVIEW-17` L-01 | Export fetches with error handling and shows a banner, or the route returns a non-download error shape |
| P6C2b-2 | The report's default range uses the browser's local date; it can be a day off near the business-day close | L | `REVIEW-17` L-04 | Default derived from the restaurant business date |
| P6C2b-3 | Repeat rate renders the raw ratio (`0.3333`) rather than a percentage | L | `REVIEW-17` L-05 | Rendered as a percentage, formatted server-side |
| P6C2b-4 | The reports index "Rewards" card and nav item are not gated on `loyalty:report` | L | `REVIEW-17` L-06 | Gated like the rest of the index |
| P6C2b-5 | `ConfirmationModal` buttons are 40px and it has no Escape handling (pre-existing shared component) | L | `REVIEW-17` L-07 | Backlog: shared-component a11y pass |

## Added by P7a (`REVIEW-18`)

| # | Item | Severity | Source | Done when |
|---|---|---|---|---|
| P7b-1 | `buildCounterOrderRequestHash` phone digest | **M** | `REVIEW-18` N-01 | **CLOSED (2026-11-14)** — keyed HMAC when the key is configured; a PII-free fallback (no phone/name) when it is not, so a loyalty-off deployment cannot 500. Scrubbing `idempotencyHash` on anonymise deliberately **not** done: replay compares the stored hash, so nulling it would turn a retry after deletion into `IDEMPOTENCY_MISMATCH`; keying already removes the brute-force risk. Accepted consequence: with no key, a phone-only or name-only change under a reused key replays instead of mismatching. |
| P7b-2 | Shared-bucket cascade: a refusal at a later bucket does not undo earlier increments, so one client can exhaust the 30/h restaurant bucket for everyone | M | `REVIEW-18` F-02 | Check specific buckets first, or run the four increments in one transaction that rolls back on refusal |
| P7b-3 | Trusted-IP depends on the edge appending `X-Forwarded-For`; if it does not, the last entry is client-controlled | **M** | `REVIEW-18` F-03 | Verified against the Railway edge, or a trusted-hop-count/fail-closed check added |
| P7b-4 | Create limits apply to the legacy no-quote path, so a normal order consumes the restaurant bucket twice (≈15 orders/h) | L | `REVIEW-18` F-04 | Narrow to quote/phone-bearing creates, or document |
| P7b-5 | No retention/cleanup job for `rate_limit_counters` | L | `REVIEW-18` F-06 | A sweeper on `windowStart` |
| P7b-6 | The create route's generic `console.error` could log a Prisma error containing the IP subject | L | `REVIEW-18` F-07 | Generic message only |
| P7b-7 | A missing HMAC key surfaces as a generic 500 rather than a typed configuration error on the member routes | L | `REVIEW-18` N-02 | Mapped to `LOYALTY_CONFIGURATION_ERROR` |
| P7b-8 | Changing the request hashes invalidates in-flight idempotency records at deploy | L | `REVIEW-18` F-10 | P9 rollout note |

## Added by P7b (`REVIEW-19`)

| # | Item | Severity | Source | Done when |
|---|---|---|---|---|
| **H-2** | **The rate limits refuse real customers.** Guest (no-phone) quotes consume the `RESTAURANT` (30/h ≈ 10 orders) and `EDGE_IP` (20/h ≈ 6–7 orders) buckets, and one order consumes them ~3× (guest quote on mount + phone quote + create). Restaurant customers share the venue's WiFi public IP; with no XFF every caller shares `unknown` at 10/h. | **H** | `REVIEW-19` | **Owner decision** — see the options in the P7b report |
| M-1 | The enumeration "miss" is a successful first-time enrolment, so new members raise false alerts and a no-consent probe raises none | M | `REVIEW-19` | Detection based on rate-limit refusals or junk-enrolment, or the contract definition explicitly accepted |
| M-2 | `SecurityEvent` has no index on `(eventType, ipAddress, createdAt)`; every new-member request full-scans the table | M | `REVIEW-19` | Additive index migration |
| M-3 | `SecurityEvent` has no `restaurantId`, so misses from different restaurants sharing an IP aggregate into one platform-wide alert | M | `REVIEW-19` | Tenant-scope the event, or record the cross-tenant interpretation at P10 |

## Added by P7c (`REVIEW-20`)

| # | Item | Severity | Done when |
|---|---|---|---|
| P7c-1 | The `unknown` IP bucket is 10/h when no trusted XFF is present; now scoped per restaurant but still low | **M** | Verified the Railway edge appends XFF, or the fallback bounded deliberately |
| P7c-2 | Fail-open can be self-inflicted: phone-bearing requests serialise on one counter row; a flood can time out transactions and fail open | M | Shorter lock footprint or bounded retry, if observed in the pilot |
| P7c-3 | The IP floor (120/h) cannot be raised by the owner | L | Documented, or made configurable |
| P7c-4 | The cleanup job never prunes at startup | L | One prune on start |
| P7c-5 | The `SecurityEvent` index does not lead with `restaurantId` | L | Add if the report query grows |
| P7c-6 | The owner report UI does not render `refusals` | L | One card in the loyalty report |
| P7c-7 | A matching phone with a different name overwrote the member's name | L | **CLOSED (2026-11-14)** — the name is now write-once: set on create, or on an attach only when the stored name is null/empty. Verified no unauthenticated rename. |
| P7c-8 | A create on a guest quote with a known phone consumes that phone's bucket before the 409 | L | Accepted, or reorder |
| P7c-9 | Plain `CREATE INDEX` on the existing `security_events` table | L | P9 deploy note |

## Added by the P7c-7 fix (`REVIEW-21`)

| # | Item | Severity | Done when |
|---|---|---|---|
| P7c-10 | A name is now **write-once** with no corrective path | L | **CLOSED (2026-11-14)** — `PATCH /api/members/[id]` renames behind `members:pii` with an audited, name-free row; the attach paths still cannot rename. |
| P7c-11 | Two concurrent first attaches on a **nameless** member can both capture a name; last write wins | L | Add `name: null` to the capture predicate if it ever matters |

## Added by P7d (`REVIEW-21`)

| # | Item | Severity | Done when |
|---|---|---|---|
| P7d-1 | After an owner clears a name, a later enrolment by the same phone re-captures one | L | Recorded at P10 |
| P7d-2 | `count !== 1` always reports `MEMBER_ANONYMIZED`; wrong if a third status is added | L | Comment updated when a status is added |
| P7d-3 | A replayed rename re-reads the live member, so an intervening rename changes the replayed body | L | Accepted |
| P7d-4 | Historical `Order.customerName` / `CustomerSession.customerName` copies keep the old name after a rename | L | Product decision at P10 |
| P7d-5 | The 80-character name bound exists on rename only; `cleanName` on attach is unbounded | L | Apply the same bound on creation |

## Added by P8 (`REVIEW-22`)

| # | Item | Severity | Done when |
|---|---|---|---|
| P8-1 | **The Z's `grossSales` now means pre-tax subtotal** — client-visible semantic change for any Counter build displaying it | **M** | Recorded in the P10 contract freeze and the Counter handoff |
| P8-2 | The Z lacks `discountBySource`, the reward line, and the "refunds against prior-period sales" line §18.20.15 asks for | M | Added, or explicitly deferred at P10 |
| P8-3 | The loyalty report omits batchless **positive** payments (legacy POS route) from gross/net | M | Included, or the legacy route deprecated |
| P8-4 | `getCounterDailyTotals` counts a refund-only order in the 7-day chart | L | Same positive-payment filter as the Z |
| P8-5 | Legacy snapshot PDFs print `0.00` cash figures beside "Not checked (legacy)" | L | Print `—` |
| P8-6 | `net` now includes tax and service by design (Q4=A); gross profit and margins include tax | **M** | Accounting sign-off recorded at P10 |
| P8-7 | P&L returns numbers, not decimal strings | L | Backlog |
| P8-8 | Early/late business-day close: the Z uses `openedAt`/`closedAt` while the P&L and loyalty report use the 04:00 cutoff; a refund after an early close can land in a different period | **M** | **P9** clock/boundary test |

## Added by P9 (`REVIEW-23`)

| # | Item | Severity | Done when |
|---|---|---|---|
| P9-03 | Concurrency drills 1–3 synchronise with fixed sleeps, not a readiness barrier; a slow machine can degenerate the race to sequential and still pass | L | Barrier or `pg_locks` wait before release |
| P9-08 | `scripts/**` is outside `tsconfig.json` `include`; `npm run type-check` does not cover the rehearsal scripts | L | `tsconfig.scripts.json` check, or keep the disclosure |
| P9-09 | Flag-off payments write `PaymentBatch.outcome = 'GUEST'`, a value the pre-feature code never wrote | L | Recorded as an interpretation at P10 |
| P9-10 | ~~The Railway edge's `X-Forwarded-For` behaviour is unobserved~~ | **closed** | **CLOSED 2026-11-14** — probed: the edge prepends the client and appends a per-connection hop; `X-Real-IP` is the client. Fixed in P9-10a/P9-10b (`REVIEW-24`, `REVIEW-25`) |
| P9-13 | The rollback drill mutates the parent process env, not a real deploy/restart | L | P11 |
| P9-14 | The runbook SQL fallback enables settings without validating the notice, so the dashboard can show "On" while runtime is off | L | Runbook watch item |
| P9-15 | The runbook SQL fallback overwrites `privacyUrl`; an unreplaced placeholder breaks the notice link while loyalty activates | L | Runbook watch item |

## Added by P9-10b (`REVIEW-25`)

| # | Item | Severity | Done when |
|---|---|---|---|
| F-03 | Acceptance "persisted value is the resolver output" is guarded only by a manual grep, not a test | L | One test pins `SecurityUtils.getClientIP` delegation |
| R-04 | Special-use ranges (`192.0.0/24`, `198.18/15`, `192.88.99/24`) are accepted as client addresses | L | Backlog; not exploitable behind the edge |
| P9-10b-1 | Off-Railway (local/dev) audit `ipAddress` now resolves to `unknown` | L | Intended fail-closed posture; record if a non-Railway deployment ever exists |
| P9-10b-2 | The health route's 5 s timeout-firing branch has no automated test | L | Backlog |
