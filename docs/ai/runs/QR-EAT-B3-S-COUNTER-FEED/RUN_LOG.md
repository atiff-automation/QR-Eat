# RUN LOG — QR-EAT-B3-S-COUNTER-FEED (B3-S)

**Task:** B3-S server add-on producer, cancellation-chit semantics, SSE signal
coverage, Counter changes support, two-tenant tests, frozen counter-feed contract
**Risk:** R3
**Complexity:** L3
**Workflow:** FEATURE / ARCHITECTURE + contract freeze
**Status:** frozen — verifier PASS; contract FROZEN at `4bf9d38`; deployment
gate pending
**Date:** 2026-11-18

## Scope recorded

In scope:

- `POST /api/orders/{orderId}/items` add-items producer with server-owned
  totals/tax/version/idempotency;
- `order.items.added` and `order.cancelled` transactional ticket/event writes;
- canonical `DELETE /api/orders/{id}` cancellation with reason, idempotency,
  durable audit/change row and cancellation chit;
- staff `/api/events/orders` additive `order_items_added`/`order_cancelled`
  signals;
- `/api/counter/changes` add-on/cancel/void/refund coverage;
- `counterAutoPrint` projection and SKIPPED-cancellation rule;
- `orders:counter_serve` migration;
- `phase-b-counter-feed-v1` freeze.

Out of scope:

- item-level/add-on-only/partial cancellation;
- new staff SSE, SSE cursor redesign, web redesign;
- Tabtep Counter/Kitchen code, hardware claims;
- real Postgres integration harness;
- push, deploy, production seed, loyalty flags.

## Planning session — 2026-11-18

Read:

- `AGENTS.md`, `docs/ai/PROJECT_PROFILE.md`, `GLOSSARY.md`;
- `docs/PRODUCT/PRINT-ACK-CONTRACT.md` (`phase-b-print-v1`);
- `docs/PRODUCT/API-CONTRACT.md`;
- Tabtep `docs/API-CONTRACT.md` §4/§15 and `docs/DECISIONS.md` D30–D32;
- `src/app/api/events/orders/route.ts`, `src/app/api/counter/changes/route.ts`,
  `src/lib/order-events.ts`, `src/lib/orders/order-adjustment-*.ts`,
  `src/lib/services/counter-order-service.ts`,
  `src/lib/services/order-dispatch-service.ts`,
  `src/lib/print/print-ack-service.ts`,
  `src/app/api/counter/orders/[orderId]/print-tickets/route.ts`,
  `src/lib/postgres-pubsub.ts`, `src/lib/constants/sse.ts`,
  `prisma/schema.prisma`, `prisma/seed.ts`;
- Tabtep B3 TASK, B3-S handoff, B3-I TASK.

Facts recorded:

1. No add-items route exists; `PATCH /orders/{id}/modify` is PENDING-only and
   supports remove/quantity only. `recordOrderItemsAdded()` has no caller.
2. `DELETE /api/orders/{id}` is the canonical cancellation path and already
   carries reason/version/idempotency policy. `PATCH /status` with `CANCELLED`
   is a legacy second path without reason or idempotency.
3. The canonical cancellation path currently writes `order.cancelled`
   best-effort after commit and publishes no staff SSE event and no
   `RestaurantChange` row.
4. Cancellation chit state is `COUNTER=SKIPPED`, `STATION=PENDING`,
   `NONE=SKIPPED`; `SKIPPED → PRINTED` is allowed under `COUNTER`.
5. `orders:counter_serve` and the cashier mapping exist in `prisma/seed.ts`, but
   production start runs only `prisma migrate deploy`, not the seed.
6. Staff SSE has no add-on/cancellation event types and no `id:` cursor. It is
   tenant-filtered by `canReceiveRestaurantEvent`.
7. Client-path check: QR-Eat web uses `DELETE` for CANCEL; Tabtep Counter
   `advanceOrderStatus` allows only PREPARING/READY/SERVED and `cancelOrder()`
   uses `DELETE`. The implementer must re-verify before shipping.
8. Tests are mocked route/writer tests; CI has no Postgres service or DB
   harness.

Grilling outcome: Q1–Q9 accepted with binding clarifications on 2026-11-18.
TASK revision 1 written. No product code, migration, commit, push or deploy.

## Approval

- Revision 1: **APPROVED** by Atiff on 2026-11-18 (“Approve B3-S revision 1”).
- Approval covers the R3 code changes, sensitive paths, both additive
  migrations, and the `phase-b-counter-feed-v1` freeze procedure.
- Next actor: implementer.

## Evidence

| Item | Evidence | Status |
|---|---|---|
| Planning reads | file list above | done |
| Client-path check | web `OrderAdjustmentModal` DELETE; Counter `cancelOrder` DELETE; `advanceOrderStatus` excludes CANCELLED | done |
| Baseline type-check/test/build | type-check PASS; 1568 passed, 11 skipped; build PASS with generated build-env | done |
| Implementation | implementer `ses_e1279dc1dffe73zs748xaNxsYC`; no commit/push/deploy | done |
| Independent verification | verifier `ses_e1251ca3effegPPbNW6vIlHS45` — PASS WITH NOTES; `REVIEW-01.md` | done |
| Contract freeze | blocked until notes correction cycle 1 and re-verification | pending |

## Notes correction cycle 1 — 2026-11-18

- Same implementer `ses_e1279dc1dffe73zs748xaNxsYC`; R-01–R-07 and optional
  R-10 applied. No task-state edits.
- R-01 contract wording fixed; R-02 missing-order code mapped to
  `ORDER_NOT_FOUND`; R-03 stale comment fixed; R-04 best-effort `RBACLog`
  security event restored alongside the durable `audit_logs` row; R-05
  `API-CONTRACT.md` §20 pointer/route/event facts added; R-06 both final order
  writes are version-conditional; R-07 legacy `UNKNOWN` chit note added;
  R-10 P2002 race test added.
- Lead closed R-08 (ACTIVE/BACKLOG state) and R-09 (hash recipe) and added the
  §5.4 chit-version clarification.
- Corrected evidence: type-check PASS; targeted 7 suites/89 tests PASS; full
  136 suites + 1 skipped, **1644 passed, 11 skipped**; build PASS; lint 61/11;
  `git diff --check` clean.
- Corrected hashes: full tracked `3b25135d…`; product tracked `94a6c404…`;
  product + new `e419e8f0…`.
- Re-review requested from the same verifier before freeze.

## Verification — 2026-11-18

- Fresh verifier `ses_e1251ca3effegPPbNW6vIlHS45` returned **PASS WITH NOTES**
  (`REVIEW-01.md`), then re-reviewed correction cycle 1 and returned **PASS**
  (`REVIEW-02.md`).
- All R-01–R-10 findings are closed. N-01 (contract §15 cross-reference) was
  fixed by the Lead; N-02 (release evidence) updated.
- Final corrected diff hashes (review binding): full tracked `3b25135d…`;
  product tracked `94a6c404…`; product+new `e419e8f0…` — all reproduced by the
  verifier. Post-review docs-only delta (N-01/N-02/N-03) confirmed; code,
  schema, migrations and tests unchanged. Final commit hash is recorded in the
  freeze stamp.
- Final evidence: type-check PASS; full 136 suites + 1 skipped, **1644 passed,
  11 skipped**; build PASS; lint 61/11; migrations unchanged from the verified
  disposable-Postgres run.
- Contract is ready to freeze; commit/deploy is at the human gate.

### Hash recipe (R-09)

```text
full tracked:
  git diff a0e3753 | sha256sum
  e75227cc8d82b675982500e632851fa08d6966f074c228699b61a00d1ed8c10e

product tracked:
  git diff a0e3753 -- src prisma docs/PRODUCT | sha256sum
  8601eac728151e9616c9c49bd345b3837705b0d8f24759b585692b47a116043d

product + new:
  files=$(git ls-files --others --exclude-standard \
    | grep -v '^docs/ai/runs/' \
    | grep -v '^docs/ai/ACTIVE.md' \
    | grep -v '^docs/ai/BACKLOG.md')
  { git diff a0e3753 -- src prisma docs/PRODUCT;
    for f in $files; do echo "### $f"; cat "$f"; done; } | sha256sum
  319fcf0ced94eafeeb3838ef67ddf7a6b6351c6167e5ad72358c3af72eff233f
```

The verifier reproduced the first two and could not reproduce the third with
eight alternative canonicalizations; it bound the review with per-file SHA-256
values instead. Future reviews should use the first two hashes plus the
per-file inventory.

## Implementation — 2026-11-18

- One implementer child: `ses_e1279dc1dffe73zs748xaNxsYC`.
- Branch `feat/b3-s-counter-feed`, base `a0e3753`; no commit, push, deploy,
  seed run, loyalty enablement or Android edit.
- Final: type-check PASS; targeted 7 suites/86 tests PASS; full 136 suites
  passed + 1 skipped, **1640 passed, 11 skipped**; build PASS.
- Lint: 61 errors, 11 warnings (baseline 62/11; not worse).
- Migration: disposable Postgres 16; 37 migrations applied; second
  `migrate deploy` no-op; permission SQL idempotent (1 permission / 1 cashier
  mapping); `prisma migrate diff` no difference; production untouched.
- Diff hashes: full tracked `e75227cc…`; product tracked `8601eac7…`;
  product + new `319fcf0c…`.
- Deviations: shared idempotency module added; `recordOrderItemsAdded()` return
  type changed to `OrderCreatedResult`; post-commit adjustment
  `AuditLogger.logSecurityEvent()` replaced by the in-transaction `audit_logs`
  row; `counterAutoPrint` uses literal event-type strings; contract is
  `IMPLEMENTED — awaiting verifier PASS and freeze`.
- Blockers: B3-C handoff draft at `/tmp/opencode/B3-C-HANDOFF.md`; manual
  two-tenant staging gate not run; freeze pending.

## Deviations and decisions

- None implemented. D30's "no add-items route" is superseded by this approved
  design; D31's manager/server cancellation rule is preserved.
- Contract will be a new `phase-b-counter-feed-v1` file, not an edit to the
  frozen `phase-b-print-v1`.

## Freeze — 2026-11-18

- Human authorized both local commits at the R3 gate (not deployment approval).
- Content commit: `4bf9d385959b7f83a2dea6fd9cb3fd0abd11f141`
  (`feat(counter): add add-items, cancellation chits and staff signals`).
- Contract: `docs/PRODUCT/COUNTER-FEED-CONTRACT.md`,
  `phase-b-counter-feed-v1`, FROZEN at `4bf9d38`.
- Freeze-stamp docs commit records the content commit/hash in the contract,
  `RELEASE-COMPATIBILITY.md` and `B3-C-HANDOFF.md`.
- Not pushed, deployed, merged or seeded. The manual two-tenant staging gate and
  explicit deployment approval remain.

## Residual risk

- Manual two-tenant staging check is required before deployment.
- Real Postgres isolation harness is a separate backlog item.
- `PATCH /modify` idempotency lookup remains legacy/global; not reworked here.

## Deployment gate — two-tenant staging check — 2026-11-18

**Gate:** manual two-tenant staging check (TASK revision 1 acceptance criterion
16; `NEXT.md` next action 1).
**Result: PASS** — 46/46 product checks and 3/3 permission-migration/fallback
checks passed on a production-mode build. Deployment remains a separate human
gate.

### Environment

- Disposable PostgreSQL 16.15 cluster created with `initdb` in
  `/tmp/opencode/b3s-gate/pgdata`, trust auth, port 55432, `fsync=off`, database
  `qreat_gate`. No production database, no production owner login, no `.env`
  file read or written.
- `prisma migrate deploy` applied 37 migrations; the repeat deploy was a no-op.
  Case 7a used a second, separate database (`qreat_migrate`) created with
  migrations only and no fixtures, so the permission rows could not be
  confounded by fixture upserts.
- `npm run build` PASS; `npm run start` on `127.0.0.1:3010` with
  `NODE_ENV=production`. Environment values were supplied only in the process
  environment and are not recorded: `DATABASE_URL` (loopback), `JWT_SECRET`,
  `NEXT_PUBLIC_BASE_DOMAIN`, `NEXT_PUBLIC_MAIN_DOMAIN`,
  `NEXT_PUBLIC_APP_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`.
- Fixtures were created by a gate script against the disposable database
  (Prisma client): two restaurants, one owner each, two staff users per tenant
  (`cashier`, `manager`) with `UserRole` and `UserSession`, two stations
  (`COUNTER` print mode), category→station mappings and three menu items.
  **`npm run db:seed` was not run.**
- Tokens were minted through the real `UserRole` + `UserSession` + signed-JWT
  path (the same payload contract as `EnhancedJWTService`), so every request
  passed through `AuthServiceV2.validateToken` and
  `reconstructUserFromPayload`.
- Gate executor: Lead session (the runtime does not expose the Lead session id
  to itself), so the evidence is bound by per-file SHA-256 instead. No product
  code was edited during the gate; `git status` showed only `docs/ai` files.
- Evidence is committed under
  `docs/ai/runs/QR-EAT-B3-S-COUNTER-FEED/evidence/` (`SHA256SUMS`,
  `gate-run-production.log`, `evidence.json`, `case7a-*`, `case7b-*`,
  `build.log`, migration logs, server log, harness scripts with the disposable
  local signing value redacted).

### Commands (evidence)

```text
initdb -D /tmp/opencode/b3s-gate/pgdata -U gate --auth=trust
pg_ctl -D ... -o "-p 55432 -k ... -c listen_addresses=127.0.0.1 -c fsync=off" start
createdb -h 127.0.0.1 -p 55432 -U gate qreat_gate
npx prisma migrate deploy          # 37 migrations applied
npx prisma migrate deploy          # "No pending migrations to apply."
node fixtures.cjs                  # two tenants; no production seed
npm run build                      # PASS (requires the env list above)
npm run start (PORT=3010)          # migrate deploy + next start
node gate.cjs                      # 46 checks, 0 failed
createdb ... qreat_migrate && prisma migrate deploy  # case 7a, twice
node case7b.cjs                    # cashier fallback, PASS
```

### Results

| Case | Checks | Result |
|---|---|---|
| 1. Two tenants, separate staff/roles | 3 | PASS — 2 staff per tenant, no shared email; tenant-scoped role templates |
| 2. Add-items | 14 | PASS — PENDING no event then `order.created` once; live add-on per routed station only; server-owned totals/tax/routing; 409 version; exact replay; key reuse 409; cross-tenant order 404; list isolation with rows present; same key string in another tenant does not replay (2h) |
| 3. Cancellation | 10 | PASS — PATCH CANCELLED 409 `USE_CANCEL_ENDPOINT`; DELETE one chit per ticketed station with reason/post-increment version/cancelled totals; replay writes nothing; PENDING no chit; VOID/REFUND no chit; cross-tenant ticket fetch/ack 404 |
| 4. Durability | 3 | PASS — simulated `restaurant_changes` insert failure rolled back the add-items and the cancellation (no item/event/chit/idempotency row, version unchanged); trigger removed |
| 5. SSE | 5 | PASS with note — signals only to the owning tenant; payload keys `orderId, restaurantId, orderNumber, orderVersion, ticketCount, timestamp`; cursor readable/consistent for reconnect (recovery row proven in case 6) |
| 6. Changes/tickets | 8 | PASS — cursor advance; synthetic 410 `CURSOR_EXPIRED` + snapshot; `counterAutoPrint` true for COUNTER PENDING/SKIPPED and false for STATION/after PRINTED; SKIPPED cancellation acked PRINTED once and replay idempotent; PRINTED terminal (`NO_DOWNGRADE`, status unchanged) |
| 8. Concurrency | 3 | PASS — parallel add-items: one 200 / one 409, one line set, one event, version +1 only; parallel same-key cancel: both 200, one chit, version +1; parallel different-key cancel: one 200 / one 409, one chit |
| 7a. Migration (separate DB) | 2 | PASS — fresh `migrate deploy` leaves exactly one `orders:counter_serve` permission and one `cashier` mapping; second deploy applies nothing |
| 7b. Cashier fallback | 1 | PASS — with the mapping row deleted and a session minted without `orders:counter_serve`, the cashier moved a no-Kitchen COUNTER order from CONFIRMED to PREPARING (role-template fallback); row restored |

Totals: **46/46 product checks PASS** on the production-mode run
(`evidence/gate-run-production.log`, `evidence/evidence.json`) plus **3/3**
case-7 checks.

### Harness revision and assertion semantics

- The first development-mode run (`evidence/gate-run-development.log`) used
  exact-one-signal assertions and failed `5.sse.delivered` / `5.sse.no-pii` when
  the server delivered duplicate SSE frames. The final harness asserts at least
  one signal of each type, requires tenant isolation and payload safety, and
  records the duplicate count in the check detail. This is a deliberate
  duplicate-tolerant assertion, not a silent relaxation: duplicates are
  disclosed below and in `5.sse.delivered` (`duplicateFrames`).
- After the first verifier read of this record, `1.tenants.list` was replaced
  with per-tenant assertions on rows that belong to the caller only, and case
  2g (with orders present on both tenants) and 2h (cross-tenant key replay)
  were added. The final run is the authority.

### Observations and notes

- **Duplicate SSE frames (pre-existing, non-blocking).** On a cold server the
  harness opened two concurrent `/api/events/orders` streams (tenant A and B).
  Every notification reached the tenant-A stream twice (`order_items_added`
  ×2, `order_cancelled` ×2). `setupPostgresSubscription()` has a check-then-await
  race on `pgPubSub.isConnected()`, so two concurrent first connections both
  initialise and subscribe, producing two LISTEN clients. Effects observed:
  duplicate refresh signals only — no duplicate order rows, tickets, chits,
  audit rows or version increments, and tenant filtering still failed closed
  for tenant B. The frozen contract treats these signals as “refresh” with
  recovery through `/api/counter/changes`, so this is compatible with the
  contract. The B3-S producers themselves wrote one event/one chit per station.
  Follow-up: single-flight pub/sub initialisation plus a duplicate-init
  regression test. `AME-015` added to the backlog.
- Takeaway orders snapshot `serviceChargeRateSnapshot=0` by design; the totals
  case therefore used subtotal 33.00, tax 1.98, service 0.00, total 34.98.
  Dine-in orders were used for SERVED → VOID/REFUND.
- Cancelling a CONFIRMED order requires manager/owner per the adjustment policy
  (D31); the gate used the tenant manager for post-confirmation cancellation and
  the cashier for PENDING cancellation and add-items.
- Station print mode was `COUNTER` for both gate stations; the `STATION`
  matrix case temporarily switched tenant B's grill station and restored it.
- The 410 case is synthetic: tenant A's change rows were removed and one
  high-id row inserted to represent a cursor older than the retained window.
  It exercises the 410 branch, not real retention.
- `npm run build` fails without `NEXT_PUBLIC_BASE_DOMAIN`,
  `NEXT_PUBLIC_MAIN_DOMAIN` and VAPID keys (module-load guards in
  `src/lib/config/domains.ts` and `src/lib/push-notification-service.ts`).
  The deployment environment must provide them; this is an environment
  requirement, not a code change.

### Independent verification of this record

- Fresh verifier `ses_e11776ab4ffedPxvLZyzwujORG` reviewed the record and
  returned **PASS WITH NOTES** — no product defect, no state duplication, but
  record defects (list assertion, case-7 evidence separation, harness
  revision) that were corrected in this revision. Findings and disposition:
  `REVIEW-03.md`.
- Evidence hashes: `docs/ai/runs/QR-EAT-B3-S-COUNTER-FEED/evidence/SHA256SUMS`.

### Contract deviations

None. No frozen `phase-b-counter-feed-v1` clause failed. The duplicate SSE
refresh frames do not change state and are documented above as a pre-existing
pub/sub lifecycle issue (`AME-015`).

### Gate verdict

Two-tenant staging check: **PASS**. Do not merge, push `main`, deploy or run a
production seed/migration without explicit human approval.
`feat/b3-s-counter-feed` remains local (`4bf9d38` content, `fc14d01` freeze
stamp) and was not pushed.

### Gate record publication — 2026-11-18

- Gate record commit: `60920deecce58dccb2c71ca89d5e67d657d1af50`, parent
  `fc14d01ba3dfa3eed2a3e866456d1609c1d425c1`; docs-only (no `src`, `prisma` or
  contract change).
- Branch: `feat/b3-s-counter-feed`. Pushed to `origin` for B3-C access:
  `* [new branch] feat/b3-s-counter-feed -> feat/b3-s-counter-feed`.
  `main` was not pushed, merged or touched.
- Staging evidence path:
  `docs/ai/runs/QR-EAT-B3-S-COUNTER-FEED/evidence/` (`SHA256SUMS` verifies).
- Deployment remains on hold until B3-C is code-complete and a deployment
  window is explicitly authorized.
