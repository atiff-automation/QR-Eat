# Open items — QR-EAT-LOYALTY-PROMO-V1

**Purpose:** one register for every carried finding, so nothing depends on chat memory.
Check this at every phase gate.

**Status:** open · **Updated:** 2026-11-15 · **Base:** `d2ad02b` (P10-close start)

Severity: **H** high · **M** medium · **L** low · **D** decision needed.

The register was rewritten at P10-close: every row that later work had already fixed
is closed with its evidence, and the duplicate `P8-2` (promotion-swap history) is
renamed `P5C-1`.

---

## Decisions needed

| # | Item | Severity | Context | Done when |
|---|---|---|---|---|
| ~~D-1~~ | ~~Restaurant delete~~ | **closed** | **CLOSED 2026-11-15** — typed `409 RESTAURANT_HAS_HISTORY` with the deactivate guidance; close with `isActive: false`; erasure procedure in `DATA-RETENTION.md` (`REVIEW-28`) |
| ~~D-2~~ | ~~Full phone on Counter responses~~ | **closed** | **CLOSED 2026-11-15** — recorded as order-contact data, not member PII; member phones stay masked and gated (`REVIEW-28`) |
| P8-6 | Should `net` / gross profit include tax and service? | **D, M** | Current arithmetic follows `net = Σ totalAmount − refunds`; gross profit includes tax. The P&L is captioned non-statutory until signed. | `docs/PRODUCT/P8-6-ACCOUNTING-SIGNOFF.md` signed by the owner/accountant, or Option B chosen. |

## Open — material

| # | Item | Severity | Owner | Done when |
|---|---|---|---|---|
| P7-2 | QR create sends no `Idempotency-Key`; the server accepts an optional one | M | next | The QR client sends a key per order |
| ~~P8-8~~ | ~~Early/late close boundary~~ | **closed** | **CLOSED 2026-11-15** — one half-open cutoff window for the Z, sales page, daily totals, P&L and loyalty report; `AFTER_CLOSE_ACTIVITY` flags post-close activity (`REVIEW-28`) |
| ~~P9-2~~ | ~~QR create `billRevision` lock~~ | **closed** | **CLOSED 2026-11-15** — the table row lock was not sufficient; create now takes `loyalty-bill` inside the order transaction (`REVIEW-28`) |
| ~~P9-3~~ | ~~Unique-conflict classification~~ | **closed** | **CLOSED 2026-11-15** — unrecognised `P2002` is a typed conflict (`BILL_CHANGED` 409, `CUSTOMER_CONFLICT` 422, `CONFLICT` 409) (`REVIEW-28`) |
| P9-4 | Pre-existing environments need `evidence/dev-pii-cleanup.sql` | M | deploy | Run on every environment created before the P6B normalisation |
| M-1 | The enumeration "miss" is a successful first-time enrolment, so new members raise false alerts and a no-consent probe raises none | M | next | Detection based on refusals or junk enrolment, or the definition accepted |
| P6C2b-1 | A failed export renders or saves the JSON error body, so an owner may believe a subject-access export succeeded | M | next | Export fetches with error handling and shows a banner |
| P7c-2 | Fail-open can be self-inflicted: phone-bearing requests serialise on one counter row; a flood can time out and fail open | M | pilot | Observed, then a shorter lock footprint or bounded retry |

## Open — low

| # | Item | Owner | Done when |
|---|---|---|---|
| P5C-1 | Promotion swap updates the ACTIVE row in place, so redemption history relies on the audit log (renamed from the duplicate `P8-2`) | backlog | Append a row, or document that reports read the audit log |
| P6C2b-2 | The report's default range uses the browser's local date | backlog | Default from the restaurant business date |
| P6C2b-3 | Repeat rate renders a raw ratio (`0.3333`) | backlog | Rendered as a percentage |
| P6C2b-4 | The reports index "Rewards" card and nav item are not gated on `loyalty:report` | backlog | Gated like the rest |
| P6C2b-5 | `ConfirmationModal` buttons are 40px and Escape is unhandled | backlog | Shared-component a11y pass |
| P7-6 | `rate_limit_counters.scope` is free `TEXT`; a typo fails as Postgres 23514 | backlog | Failure mapped to a contract error |
| P7-7 | Full-phone audit completeness across every read/search/export | backlog | Audited with actor, target, purpose, timestamp |
| P7b-6 | The create route's generic `console.error` could log a Prisma error containing the IP subject | backlog | Generic message only |
| P7b-7 | A missing HMAC key returns a 500 `LOYALTY_CONFIGURATION_ERROR` on member routes (now documented in the addendum) | backlog | Mapped to a 4xx or a startup check |
| P7b-8 | Changing the request hashes invalidates in-flight idempotency records at deploy | deploy | Rollout note |
| P7c-4 | The cleanup job never prunes at startup | backlog | One prune on start |
| P7c-5 | The `SecurityEvent` index does not lead with `restaurantId` | backlog | Add if the report query grows |
| P7c-6 | The owner report UI does not render `refusals` | backlog | One card in the loyalty report |
| P7c-8 | A create on a guest quote with a known phone consumes that phone's bucket before the 409 | backlog | Accepted, or reordered |
| P7c-9 | Plain `CREATE INDEX` on the existing `security_events` table | deploy | Deploy note |
| P7c-11 | Two concurrent first attaches on a nameless member can both capture a name | backlog | Add `name: null` to the capture predicate |
| P7d-5 | The 80-character name bound exists on rename only; attach is unbounded | backlog | Same bound on creation |
| P8-4 | `getCounterDailyTotals` counts a refund-only order in the 7-day chart | backlog | Same positive-payment filter as the Z |
| P8-5 | Legacy snapshot PDFs still print `0.00` for the cash block beside "Not checked (legacy)" | backlog | Print `—` (the three new Z lines already do) |
| P8-7 | The P&L returns numbers, not decimal strings | backlog | Backlog |
| P9-08 | `scripts/**` is outside `tsconfig.json`; `npm run type-check` does not cover the rehearsal scripts | accepted | `tsconfig.scripts.json`, or keep the disclosure |
| P9-13 | The rollback drill mutates the parent process env, not a real deploy/restart | P11 | Recorded |
| P9-14 | The runbook SQL fallback enables settings without validating the notice | runbook | Watch item (documented) |
| P9-15 | The runbook SQL fallback overwrites `privacyUrl` | runbook | Watch item (documented) |
| P9-10b-2 | The health route's 5 s timeout-firing branch has no automated test | backlog | Backlog |
| R-04 | Special-use ranges (`192.0.0/0/24`, `198.18/15`, `192.88.99/24`) are accepted as client addresses | backlog | Not exploitable behind the edge |
| L-05 | The Z's gross/tax/service/discount/net are accumulated as JS numbers; the identity check converts to Decimal | backlog | Accumulate as Decimal |
| L-09 | The PDF blocker section is structurally legacy-only (a new close with blockers never produces a snapshot) | recorded | The live Z payload is the surface |

## Backlog — separate tasks

| # | Item | Source |
|---|---|---|
| B-1 | `docs/WEB-UI-STANDARD.md` prescribes `text-red-600` on `red-50` = 4.41:1 | `REVIEW-16` L-02 |
| B-2 | Lint baseline is red (62 errors, 11 warnings) | `AGENTS.md` |
| B-3 | Duplicated projection/label/money helpers across services and UI | `REVIEW-09`, `REVIEW-16` |
| B-4 | No jsdom, so no React render/interaction tests | `REVIEW-15` V-07 |
| B-5 | Cosmetic: raw permission keys in owner copy; one-frame `hasChanges`; passthrough test | `REVIEW-16` |
| B-6 | A stale linked worktree remains at `.../worktree/770812/cosmic-squid` | session note |

## P11 — final R3 review

| # | Item | Done when |
|---|---|---|
| P11-1 | Four-lens review (Security, Payments & Reliability, Data & Migration, Product/UX) | `REVIEW-*.md` written, PASS/PASS WITH NOTES |
| P11-2 | Different-model or human pass on the payment and migration paths | Recorded |

---

## Closed register

Every row below was open at some point and is now fixed, verified, or explicitly recorded.

| # | Resolution | Evidence |
|---|---|---|
| P7-1 | Unkeyed phone hash replaced by a keyed HMAC with a PII-free fallback | P7b-1; `REVIEW-19` |
| P7-3 | Durable rate limits (10 phone / 10 session / 30 restaurant / 120 IP) | P7c; `REVIEW-20` |
| P7-4 | Trusted edge IP, proven on the platform | P7a; P9-10 |
| P7-5 | Enumeration alert path with a documented response | P7b; `REVIEW-19` |
| P7-8 | Cross-tenant 403 on bill routes recorded as an exception to the 404 rule | P10 register P7-8 |
| P7-9 | R-02 PII in payment/event JSON verified rather than rebuilt | P7b |
| P8-1 (refunds) | Refunds are negative `PAID` payments and are now read | P8; `REVIEW-22` |
| P8-2 (Z lines) | `discountBySource`, `rewardTotal`, `refundsPriorPeriod` added; blockers, not 500s | P10-close; `REVIEW-27` |
| P8-3 | Batchless positive payments included in gross and net once | P10-close; `REVIEW-27` |
| P9-1 | Real-Postgres locks, constraints, CHECKs and concurrency drilled | P9; `REVIEW-23` |
| P9-5 | `db:seed` is a runbook prerequisite | P9 runbook |
| P9-6 | Fresh, upgrade and rollback migration drills | P9 9a/9b |
| P9-7 | Expenses index drift gone; `migrate diff` empty | P9 9a |
| P10-1…11 | Recorded in the addendum's interpretation register | `REVIEW-26` |
| P10-12/13 | `MEMBER_ALREADY_ATTACHED` / `LOYALTY_UNAVAILABLE_OFFLINE` registered as not emitted | `REVIEW-26` |
| P7b-1 | Keyed HMAC + PII-free fallback | `REVIEW-19` |
| P7b-2 | Four buckets increment in one transaction that rolls back on refusal | P7c; drill 4 |
| P7b-3 | Edge behaviour measured; resolver fixed | P9-10a/b |
| P7b-4 | Guest quotes no longer consume buckets; one count per order | P7c |
| P7b-5 | Rate-limit cleanup job | P7c |
| H-2 | One count per order, guest quotes uncounted, measured edge address, 120/h floor | P10-close register; `REVIEW-26` |
| M-2 | `SecurityEvent` index `(eventType, ipAddress, createdAt)` exists | schema check |
| M-3 | `SecurityEvent.restaurantId` exists and loyalty events populate it | P7c; `REVIEW-26` |
| P7c-1 | `unknown` bucket no longer the normal path; edge measured | P9-10 |
| P7c-3 | 120/h IP floor recorded as an interpretation | P10 register |
| P7c-7 | Name is write-once | P7c-7; `REVIEW-20` |
| P7c-10 | Owner rename behind `members:pii`, audited | P7d; `REVIEW-21` |
| P7d-1 | Recorded in the addendum | P10 register |
| P7d-2 | Accepted; comment updated when a status is added | recorded |
| P7d-3 | Accepted | recorded |
| P7d-4 | Recorded in the addendum | P10 register |
| P8-1 (Z gross) | Pre-tax `grossSales` recorded for the Counter | P10 register; handoff |
| P9-03 | Drill barrier: markers + `application_name`-scoped waiters + go handshake; timeout fails | P10-close; `REVIEW-27` |
| P9-09 | `outcome = 'GUEST'` under flag off recorded | P10 register |
| P9-10 | Edge probed, resolver fixed, health diagnostic added | `REVIEW-24`, `REVIEW-25` |
| F-03 | `SecurityUtils.getClientIP` delegation pinned by a test | P10-close; `REVIEW-27` |
| P9-10b-1 | Off-Railway audit resolves to `unknown`; intended, no such deployment | recorded |
| P9-4 (dev reset) | `qrorder_dev` was reset in P9 | `REVIEW-23` |

## Added by P11-prep (`REVIEW-28`)

| # | Item | Severity | Owner | Done when |
|---|---|---|---|---|
| P11p-1 | `getCounterDayOrders` (the day's order list) still uses `openedAt → closedAt`; an order created after an early close can be missing while its payment is in the Z | L | backlog | Same cutoff window |
| P11p-2 | An unrecognised `P2002` on a receipt-number collision reports `BILL_CHANGED`, slightly inaccurate | L | backlog | A distinct code, or accept |
| P11p-3 | The P9-2 test proves invocation order, not that the lock is inside the transaction | L | backlog | Assert the transaction boundary |
| P11p-4 | The D-1 test does not assert the history counts are tenant-scoped | L | backlog | Assert the `where` clause |
| P11p-5 | `hashtext` is a 32-bit advisory-lock space; collisions serialize unrelated bills | L | accepted | Contention only |
| P11p-6 | `AFTER_CLOSE_ACTIVITY` is strict at exactly `closedAt` | L | accepted | Documented |
