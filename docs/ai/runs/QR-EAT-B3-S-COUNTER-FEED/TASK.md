# Task — QR-EAT-B3-S-COUNTER-FEED (B3-S)

**Status:** **DEPLOYED** — verifier PASS; contract `phase-b-counter-feed-v1`
frozen at `4bf9d38`; staging gate PASSED (46/46 + 3/3); merged to `main` at
`ab63894` and deployed as Railway `27852ccb-f16c-468a-9885-bf99f6771918`
(`SUCCESS`, health UP, migrations applied, no seed)
**Revision:** 1
**Approved revision:** 1
**Approved by:** Atiff
**Approval date:** 2026-11-18
**Approval basis:** “Approve B3-S revision 1” (grilling Q1–Q9 with binding clarifications)
**Verifier session:** `ses_e1251ca3effegPPbNW6vIlHS45` — final **PASS**,
`REVIEW-02.md` (prior `REVIEW-01.md` PASS WITH NOTES, all findings closed)
**Freeze content commit:** `4bf9d385959b7f83a2dea6fd9cb3fd0abd11f141`
**Next actor:** none on the server task; B3-C runs in `../Tabtep-App`
**Risk:** **R3** — order mutation, cancellation, tenant isolation, print facts,
staff SSE, audit, migration
**Complexity:** L3
**Workflow:** FEATURE / ARCHITECTURE + contract freeze
**Contract to freeze:** `docs/PRODUCT/COUNTER-FEED-CONTRACT.md`,
`phase-b-counter-feed-v1`
**Code base:** `a0e3753` (`main`, 2026-11-18)
**Branch:** `feat/b3-s-counter-feed` (do not push)
**Workflow position:** B3-I closed (`6f6c9c0`, Tabtep) → **B3-S (this task)** →
B3-C (waits for this freeze) → B3-K → B3-T
**Updated:** 2026-11-18

> This is the server half of B3. It is additive to frozen `phase-b-print-v1`
> and must not change B2 behaviour. Do not edit `../Tabtep-App`. Do not push to
> `main`, deploy, run the seed, or enable loyalty. Stop and report if a clause
> cannot be implemented exactly.

## Objective

Deliver a verified, frozen server contract and implementation for:

1. a real add-items producer that writes `order.items.added`, with server-owned
   totals, tax, version and idempotency;
2. whole-order cancellation-chit semantics with durable audit and duplicate
   protection;
3. staff `/api/events/orders` signal coverage for add-on, cancellation and
   status facts, without a second staff SSE;
4. `/api/counter/changes` coverage for the same facts;
5. two-tenant server isolation tests and a manual staging gate;
6. the `orders:counter_serve` production mapping via migration;
7. frozen `phase-b-counter-feed-v1` before B3-C starts.

## Binding decisions (accepted in grilling, incorporated here)

| # | Decision | Consequence |
|---|---|---|
| Q1 | Add-items is one canonical staff endpoint `POST /api/orders/{orderId}/items` | `orders:write`, tenant-scoped, `expectedVersion` + `idempotencyKey` + body hash. PENDING add-items writes no event; live orders write `order.items.added`. |
| Q1 | Add-on ticket state | `COUNTER=PENDING`, `STATION=PENDING`, `NONE=SKIPPED`; ticket contains only added items. |
| Q1 | Idempotency scope | `{restaurantId, orderId, operation, idempotencyKey}` + request-body hash. Same key + same body replays; same key + different body is `409 IDEMPOTENCY_KEY_REUSED`. |
| Q1 | Pricing | Menu/options priced on the server; totals use the order's tax/service snapshots; loyalty promotion recalculation stays behind existing flags. No client pricing. |
| Q1 | Product surface | Back-office/POS API only; no new Counter UI in B3-S. |
| Q2 | Cancellation scope | Whole-order only. Item-level, add-on-only and partial-line cancellation are B3 non-goals. Chit carries order number, reason, order version and cancelled totals. |
| Q3 | Canonical cancel | `DELETE /api/orders/{id}` only. `PATCH /status` with `CANCELLED` returns `409 USE_CANCEL_ENDPOINT`. Same idempotency rule as Q1. Verify no active client uses the legacy path before shipping. |
| Q3 | Cancellation durability | Ticket/event, `RestaurantChange`/outbox row and audit are written with the mutation; SSE publishes after commit. |
| Q4 | Cancellation chit print policy | `COUNTER` cancellation stays `SKIPPED` for B2 compatibility. B3 Counter fetches and prints it under `COUNTER` authority, dedupes by ticket/event id, acks `PRINTED`. The server exposes an additive `counterAutoPrint` flag and the contract states the exact type + authority + status rule. B2 behaviour unchanged. |
| Q5 | SSE | One staff stream. Additive `order_items_added` and `order_cancelled` types, tenant-filtered, dual-written to `pending_events`. No second stream, no `id:` cursor. Counter still resyncs via changes + ticket/order fetch. |
| Q6 | Transactional writes | `order.items.added`/`order.cancelled` event rows and the `RestaurantChange` row are transactional with the mutation. SSE is best-effort after commit. Cancellation reason/audit durable. `order.created` keeps its existing after-commit path. |
| Q7 | Permission mapping | Idempotent data migration inserts `orders:counter_serve` and the cashier `RolePermission`. Keep the seed entry and the route fallback for one release. Verify with `migrate deploy` on a copy; no production seed run. |
| Q8 | Contract | New `docs/PRODUCT/COUNTER-FEED-CONTRACT.md`, `phase-b-counter-feed-v1`, additive to `phase-b-print-v1`. Update `API-CONTRACT.md` and `RELEASE-COMPATIBILITY.md`; freeze content commit and stamp/hash. |
| Q9 | Tests | Mocked route/writer tests for tenant A/B, add-on, cancellation, SSE, changes, ticket fetch/ack, cross-tenant 404/fail-closed, pure SSE guard tests. Manual two-tenant staging gate before deployment. Real Postgres harness is a separate backlog item, not B3-S. |

## Verified facts that shape the plan

1. **No add-items route exists.** `PATCH /api/orders/{id}/modify` is PENDING-only
   and supports `remove`/`update_quantity` only. `recordOrderItemsAdded()` has no
   caller. D30 is still accurate.
2. **Two cancellation paths exist.** `DELETE /api/orders/{id}` goes through
   `order-adjustment-service` with reason, version, idempotency key and policy.
   `PATCH /api/orders/{id}/status` with `CANCELLED` is a legacy path with no
   reason, no idempotency key and no refund logic.
3. **The canonical cancel path does not feed B3 today.** It writes
   `order.cancelled` after commit, best-effort, and publishes no staff SSE event
   and no `RestaurantChange` row. The legacy status path does publish both.
4. **Cancellation chit state** is `COUNTER=SKIPPED`, `STATION=PENDING`,
   `NONE=SKIPPED`. `SKIPPED → PRINTED` is already allowed under `COUNTER`.
5. **The seed is not run in production.** `npm start` runs
   `prisma migrate deploy && next start`. `orders:counter_serve` and the cashier
   mapping exist in `prisma/seed.ts` but require a migration to reach production.
6. **The staff SSE** has no add-on/cancellation types, no `id:` cursor, and
   timestamp-based catch-up. It is tenant-filtered by
   `canReceiveRestaurantEvent`.
7. **No active client uses the legacy status-cancel path.** QR-Eat web uses
   `DELETE` for CANCEL; the Tabtep Counter `advanceOrderStatus` accepts only
   `PREPARING`/`READY`/`SERVED` and its `cancelOrder()` uses `DELETE`. The
   implementer must re-verify with a grep and record the evidence.
8. **Tests are mocked route/writer tests.** CI has no Postgres service or DB
   harness.

## Scope

### S0 — Baseline and guardrails

- Verify the worktree is clean and `a0e3753` is the base.
- Record the current baseline for `npm run type-check`, `npm test -- --runInBand`
  and `npm run build`. Do not assume the old 524-test count.
- Re-verify that no active QR-Eat or Tabtep client uses `PATCH /status` with
  `CANCELLED`; record the commands and result.
- No push, deploy, seed run, loyalty flag, HMAC key, web redesign or Tabtep edit.

### S1 — Add-items domain and API

**Route:** `POST /api/orders/{orderId}/items`
(`src/app/api/orders/[id]/items/route.ts`, new).

- Staff auth (cookie or Bearer), `orders:write`,
  `requireOrderAccess(orderId, context)`, cross-tenant mapped to **404**.
- Body schema (new, reuse `CounterOrderItemSchema` for lines):
  ```json
  {
    "expectedVersion": 4,
    "idempotencyKey": "uuid",
    "reason": "customer_request",
    "reasonNotes": "optional",
    "customerNotified": true,
    "items": [
      { "menuItemId": "uuid", "quantity": 1, "optionIds": ["uuid"], "notes": null }
    ]
  }
  ```
- State/payment rules:
  - allowed: `PENDING`, `CONFIRMED`, `PREPARING`, `READY`;
  - rejected: `SERVED`, `CANCELLED`, `PAID`, `REFUNDED`, closed business day;
  - `expectedVersion` mismatch → `409 ORDER_VERSION_CONFLICT`.
- Idempotency:
  - new model `OrderMutationIdempotency` with
    `@@unique([restaurantId, orderId, operation, idempotencyKey])`;
  - `operation='ADD_ITEMS'`; `requestHash` is a canonical hash of the body
    (excluding `idempotencyKey`) plus `orderId` and operation;
  - same key + same hash → replay the stored response with `isDuplicate:true`;
  - same key + different hash → `409 IDEMPOTENCY_KEY_REUSED`;
  - concurrent unique-key race re-reads and applies the same decision.
- Mutation service: `src/lib/orders/order-add-items-service.ts` (new).
  - Reuse `acquireOrderModificationLocks()` and the modify route's
    version/lock/idempotency pattern.
  - Reuse pricing by exporting a narrow line-pricing helper from
    `src/lib/services/counter-order-service.ts`; do not duplicate menu/option
    pricing or availability rules.
  - Insert `OrderItem` rows with selected options; recompute the whole order
    with the stored `taxRateSnapshot`/`serviceChargeRateSnapshot`; reapply the
    loyalty promotion ledger only when the existing flag/loyalty path is active.
  - Increment `Order.version`, `modificationCount`, set `hasModifications` and
    `lastModifiedAt`.
  - Create `OrderModification` + `OrderModificationItem` (`action:'added'`).
    Use an internal derived `OrderModification.idempotencyKey`
    (`ADD_ITEMS:{orderId}:{clientKey}`) so the pre-existing global unique key
    cannot collide across orders.
  - If the order already has creation events, write `order.items.added` in the
    **same transaction** through the tx-aware writer. If `PENDING`, write no
    event; the later `order.created` includes the items exactly once.
  - Write the `RestaurantChange` row in the same transaction.
  - Write the `AuditLog` row in the same transaction (no item names/notes, no
    customer PII).
  - After commit, publish `order_items_added` best-effort.
- Response (contract shape):
  ```json
  {
    "success": true,
    "order": {
      "id": "...", "status": "CONFIRMED", "paymentStatus": "PENDING",
      "version": 5, "subtotalAmount": "24.00", "taxAmount": "1.20",
      "serviceCharge": "2.40", "discountAmount": "0.00",
      "totalAmount": "27.60"
    },
    "addedItems": [{ "id": "...", "menuItemId": "...", "quantity": 1,
                     "totalAmount": "6.00" }],
    "ticket": { "routed": true, "stationIds": ["st_1"],
                "unroutedItemIds": [], "replayed": false },
    "isDuplicate": false,
    "serverTime": "2026-11-18T10:00:00.000Z"
  }
  ```
- Errors: `400 VALIDATION_FAILED`; `401`; `403`; `404 ORDER_NOT_FOUND`;
  `409 ORDER_VERSION_CONFLICT`, `ORDER_NOT_ADDABLE`,
  `PAYMENT_STATE_INVALID`, `BUSINESS_DAY_CLOSED`,
  `IDEMPOTENCY_KEY_REUSED`; `500`.
- No web UI.

### S2 — Canonical cancellation

- `DELETE /api/orders/{id}` remains the only cancellation route.
- `handleOrderAdjustmentRequest()`:
  - map `requireOrderAccess` cross-tenant 403 to **404** for all adjustment
    actions (fail-closed, no existence leak);
  - pass `trustedIp(request)` and the user agent into the service for the
    durable audit row.
- `runAdjustment()` for `CANCEL`:
  - same new idempotency table/rule as S1 with `operation='CANCEL'`;
  - policy unchanged: PENDING → manager/owner or `orders:write`; after confirm →
    manager/owner only; closed business day blocked; served is refund/void, not
    cancel;
  - transaction contains: refund payment (when PAID), `OrderModification`
    (reason + notes + internal derived key), order status/version/paymentStatus,
    table status, cancellation event rows, `RestaurantChange` row and `AuditLog`
    row;
  - one `order.cancelled` chit per station that already received a printable
    event; no chit for a PENDING order with no ticket;
  - initial state unchanged: `COUNTER=SKIPPED`, `STATION=PENDING`,
    `NONE=SKIPPED`;
  - payload adds `cancelledTotals` as decimal strings
    (`subtotal`, `taxAmount`, `serviceCharge`, `discountAmount`,
    `totalAmount`) and keeps order number, reason, version and `printMode`;
  - `VOID`/`REFUND` do **not** emit an `order.cancelled` chit; they still write
    the change row and audit. `VOID` keeps the status change.
  - after commit, publish `order_cancelled` for `CANCEL`; `VOID` uses the
    existing `order_status_changed` signal when status changes; `REFUND` relies
    on the change row.
- `PATCH /api/orders/{id}/status` with `CANCELLED`:
  - return `409 { code: 'USE_CANCEL_ENDPOINT', error }` before any mutation;
  - no event, no audit, no change row, no SSE.
- Duplicate protection: scoped idempotency + status policy + optimistic version.
  A replay returns the stored result and writes nothing.

### S3 — Tx-aware event writers

- `recordOrderItemsAdded(orderId, itemIds, { tx? })`:
  - use the supplied `Prisma.TransactionClient` for every read and write;
  - payload adds additive `orderVersion`; item list remains **only** the added
    items; `addedItemIds` unchanged;
  - initial state per mode unchanged (`COUNTER/STATION=PENDING`,
    `NONE=SKIPPED`).
- `recordOrderStatusChanged(..., { tx?, reason?, cancelledTotals? })`:
  - use the supplied transaction client;
  - cancellation payload adds `cancelledTotals`;
  - non-cancellation events keep `printStatus=null`;
  - `recordOrderCreated()` keeps its current after-commit behaviour and shape.
- Writers must not swallow errors inside the producer transaction. A failed
  ticket write rolls back the mutation.

### S4 — Staff SSE signal

- `src/lib/constants/sse.ts`: add `ORDER_ITEMS_ADDED = 'order_items_added'` and
  `ORDER_CANCELLED = 'order_cancelled'`.
- `src/lib/postgres-pubsub.ts`: add `PG_EVENTS.ORDER_ITEMS_ADDED`,
  `PG_EVENTS.ORDER_CANCELLED`, payload interfaces and
  `publishOrderItemsAdded()` / `publishOrderCancelled()` with the existing
  dual-write pattern (`EventPersistenceService.storeEvent` + `NOTIFY`).
- Payload: `{ orderId, restaurantId, orderNumber, orderVersion, ticketCount,
  timestamp }`. No reason, no item text, no customer data.
- `src/app/api/events/orders/route.ts`:
  - subscribe to both channels on stream init;
  - map them in `getEventType()`;
  - keep the single tenant filter `canReceiveRestaurantEvent` and fail closed;
  - do not add `id:` cursors, change catch-up semantics or add a second stream.
- Publishing happens **after** the mutation commits and is best-effort; a
  failure is recovered by `/api/counter/changes` and polling.

### S5 — Counter changes coverage

- `src/lib/restaurant-changes.ts`: add
  `recordRestaurantChangeTx(tx, input)` that **throws** on failure.
- Add-items and cancellation/void/refund use the tx helper inside the mutation
  transaction. The existing best-effort `recordRestaurantChange()` remains for
  other callers.
- No change to `GET /api/counter/changes` shape, cursor semantics or 410
  handling. Add-on/cancel rows use `entityType:'order'`, `operation:'upsert'`.
- Document the deliberate B3 exception: for add-items/cancel, a failed change
  row fails the mutation, because the feed is part of the B3 contract.

### S6 — Ticket projection and ack

- `GET /api/counter/orders/{orderId}/print-tickets`:
  - continue returning add-on and cancellation tickets in `eventId` order;
  - add additive `counterAutoPrint` (see contract for the exact rule):
    - `type in {order.created, order.items.added}` and
      `printMode='COUNTER'` and `printStatus in {PENDING, FAILED}` → true;
    - `type='order.cancelled'` and `printMode='COUNTER'` and
      `printStatus !== 'PRINTED'` → true;
    - already `PRINTED`, `STATION`, `NONE`, non-ticket → false.
  - B2 ignores the new field; B2 filters/types remain unchanged.
- `POST .../print-ack` already accepts `SKIPPED → PRINTED` under `COUNTER`;
  keep the transition/authority matrix unchanged. Verify the cancellation ack
  path with a test.
- The existing `/ticket` status-only route is unchanged.

### S7 — `orders:counter_serve` migration

- Schema: add `OrderMutationIdempotency`
  (`prisma/schema.prisma`, table `order_mutation_idempotency`):
  ```prisma
  model OrderMutationIdempotency {
    id             String   @id @default(uuid())
    restaurantId   String
    orderId        String
    operation      String   // ADD_ITEMS | CANCEL
    idempotencyKey String
    requestHash    String
    responseJson   Json?
    createdAt      DateTime @default(now())

    @@unique([restaurantId, orderId, operation, idempotencyKey])
    @@index([orderId])
    @@map("order_mutation_idempotency")
  }
  ```
  Soft references; no new foreign keys, no data backfill.
- Migration `prisma/migrations/<ts>_add_order_mutation_idempotency`.
- Migration `prisma/migrations/<ts>_seed_orders_counter_serve`, idempotent SQL:
  insert the `orders:counter_serve` permission and the `cashier`
  `RolePermission` with `ON CONFLICT DO NOTHING`; use
  `gen_random_uuid()::text` for the text ids.
- Keep `prisma/seed.ts` unchanged (it already contains both rows) and keep the
  cashier route fallback for one release.
- Verify with `prisma migrate deploy` against a disposable local/copy database
  and record the result. Do not run it against production.
- Rollback: both migrations are additive; dropping the new table/rows loses
  only idempotency receipts and the seeded permission. No destructive down
  migration is required for this task.

### S8 — Contract, docs and freeze

- Write `docs/PRODUCT/COUNTER-FEED-CONTRACT.md`, `phase-b-counter-feed-v1`:
  - scope, version, owner, consumers, relationship to `phase-b-print-v1`;
  - add-items API, state rules, totals/tax, version, idempotency and errors;
  - add-on ticket type, initial state, only-added-items payload, routing,
    `orderVersion`, retrieval and dedupe;
  - cancellation route, authority, state/payment/refund, reason, durable
    audit, one chit per station, payload and cancelled totals, duplicate rules,
    legacy status-route rejection, VOID/REFUND exclusion;
  - SKIPPED cancellation retrieval and the `counterAutoPrint` rule;
  - ack/dedupe and the existing `phase-b-print-v1` transition matrix;
  - staff SSE types/payload/tenant filter/no cursor;
  - changes feed, in-transaction row, 410 and polling fallback;
  - tenant/security rules and error tables;
  - B2 compatibility matrix;
  - production gates, test matrix and freeze stamp.
- Update `docs/PRODUCT/API-CONTRACT.md` with a pointer to the new contract and
  the new route/event/changes facts. Do not edit the frozen print contract.
- Update `docs/PRODUCT/RELEASE-COMPATIBILITY.md` with the B3-S record.
- Write `B3-C-HANDOFF.md` with the frozen path, commit/stamp, event/ticket
  examples, idempotency rules, retrieval/ack rules, test evidence and residual
  risks.
- Freeze procedure:
  1. verifier PASS on code, migration and contract;
  2. content commit containing the contract; record the hash;
  3. header becomes `FROZEN phase-b-counter-feed-v1 at <content-commit>`;
  4. follow-up docs commit records the stamp/hash in the release record and
     handoff.
- B3-C must not start until the freeze is recorded.

## File ownership (expected)

```text
src/app/api/orders/[id]/items/route.ts                     (new)
src/app/api/orders/[id]/route.ts
src/app/api/orders/[id]/status/route.ts
src/app/api/events/orders/route.ts
src/app/api/counter/orders/[orderId]/print-tickets/route.ts
src/lib/orders/order-add-items-service.ts                  (new)
src/lib/orders/order-adjustment-service.ts
src/lib/orders/order-adjustment-http.ts
src/lib/order-events.ts
src/lib/restaurant-changes.ts
src/lib/postgres-pubsub.ts
src/lib/constants/sse.ts
src/lib/print/print-ack-service.ts                         (projection helper only)
src/lib/services/counter-order-service.ts                  (narrow pricing export only)
src/lib/validation/order-modification-schemas.ts
prisma/schema.prisma
prisma/migrations/<ts>_add_order_mutation_idempotency/**
prisma/migrations/<ts>_seed_orders_counter_serve/**
src/tests/**                                               (affected/new)
docs/PRODUCT/COUNTER-FEED-CONTRACT.md                      (new)
docs/PRODUCT/API-CONTRACT.md
docs/PRODUCT/RELEASE-COMPATIBILITY.md
docs/ai/runs/QR-EAT-B3-S-COUNTER-FEED/**
```

Sensitive paths under `AGENTS.md`: order status, staff event stream, tenant
helpers, audit, `prisma/migrations`, permission mapping. **Approval of this
revision is the explicit owner approval to touch those paths for B3-S.** Do not
change `src/lib/auth.ts`, `src/lib/auth-utils.ts`, `src/lib/device-auth.ts` or
`src/lib/rbac/` beyond the new permission migration and a scoped helper. If auth
semantics must change, stop.

## Context budget

**Must read**

- `AGENTS.md`, `docs/ai/PROJECT_PROFILE.md`, `GLOSSARY.md`;
- `docs/PRODUCT/PRINT-ACK-CONTRACT.md` §4, §5, §6, §7, §9, §10;
- `docs/PRODUCT/API-CONTRACT.md` change process;
- `src/lib/order-events.ts`, `src/lib/orders/order-adjustment-service.ts`,
  `src/lib/orders/order-adjustment-http.ts`,
  `src/lib/orders/order-adjustment-policy.ts`;
- `src/lib/services/counter-order-service.ts` (`priceOrder`,
  `CounterOrderItemSchema`, item creation);
- `src/app/api/orders/[id]/route.ts`, `status/route.ts`, `modify/route.ts`;
- `src/lib/restaurant-changes.ts`, `src/app/api/counter/changes/route.ts`;
- `src/lib/postgres-pubsub.ts`, `src/lib/constants/sse.ts`,
  `src/app/api/events/orders/route.ts`;
- `src/lib/print/print-ack-service.ts`,
  `src/app/api/counter/orders/[orderId]/print-tickets/route.ts`,
  `print-ack/route.ts`;
- `prisma/schema.prisma` (Order, OrderItem, OrderModification, OrderEvent,
  RestaurantChange, Permission, RolePermission), `prisma/seed.ts` (mapping only);
- existing tests named in the test plan.

**Read only if unclear**

- `src/lib/services/order-dispatch-service.ts` authority helpers;
- loyalty promotion reapply helper;
- `src/lib/table-utils.ts`, `src/lib/orders/order-business-day.ts`;
- B1-S review/run logs.

**Do not read by default**

- the whole repository;
- `../Tabtep-App` implementation beyond the read-only client-path check;
- historical run logs unrelated to B1/B3;
- generated build output.

## Not in scope

- Item-level, add-on-only or partial-line cancellation.
- New Counter/Kitchen UI or any `../Tabtep-App` edit.
- Web redesign.
- New staff SSE, SSE `id:` cursors or catch-up redesign.
- In-client pricing, tax, routing or print-eligibility.
- Changing `order.created` creation timing or its after-commit path.
- Changing the frozen `phase-b-print-v1` text.
- Loyalty enablement, HMAC keys, new feature flags.
- A real Postgres integration harness (separate backlog item).
- Push, deploy, production seed run or production migration.

## Test plan

New or updated tests must cover at least:

1. **Add-items service/route**
   - success on `CONFIRMED`/`PREPARING`/`READY`; no event on `PENDING`;
   - only added items in the ticket; `orderVersion` present;
   - `COUNTER/STATION=PENDING`, `NONE=SKIPPED`;
   - totals use order snapshots; version increments;
   - paid/served/cancelled/closed-day rejected;
   - version conflict; same key + same body replay; same key + different body
     409; concurrent unique-key race;
   - cross-tenant 404; no cross-tenant idempotency replay;
   - audit and change row present; SSE called after commit.
2. **Cancellation**
   - `DELETE` success with reason/version/idempotency;
   - one chit per station, payload reason/version/cancelledTotals;
   - no chit for PENDING/no-ticket; no chit for VOID/REFUND;
   - duplicate replay writes nothing; different body 409;
   - policy denial and cross-tenant 404;
   - `PATCH /status` `CANCELLED` → 409 `USE_CANCEL_ENDPOINT`;
   - audit/change/ticket rows are in the transaction; SSE after commit.
3. **SSE**
   - new types map from the new channels;
   - payload includes `restaurantId` and `orderVersion`;
   - tenant A cannot receive tenant B's signal; missing ids fail closed;
   - no second stream and no cursor change.
4. **Changes**
   - add-on/cancel/void/refund write an `order` row in the same transaction;
   - changes route returns only the caller's tenant; 410 unchanged.
5. **Ticket/ack**
   - `counterAutoPrint` true/false matrix;
   - SKIPPED cancellation is returned and can be acked `PRINTED` under
     `COUNTER`;
   - cross-tenant ticket fetch/ack 404;
   - `PRINTED` remains terminal; B2 filter/behaviour unchanged.
6. **Migration**
   - `prisma migrate deploy` on a disposable database creates the permission and
     cashier mapping idempotently (run twice, still one row each);
   - record the commands and output.
7. **Regression**
   - existing print-mode, print-ack, cashier-status, order-adjustment,
     counter-changes, counter-order and QR tests pass.

## Acceptance criteria

1. `POST /api/orders/{orderId}/items` exists, is tenant-scoped, uses
   `orders:write`, and is documented in the frozen contract.
2. A live add-items call writes exactly one `order.items.added` per routed
   station, containing only the added items and the new order version.
3. A PENDING add-items call writes no event; the later `order.created` includes
   the items exactly once.
4. Add-on ticket initial state is `COUNTER=PENDING`, `STATION=PENDING`,
   `NONE=SKIPPED`; no client pricing/tax/routing logic is required.
5. Idempotency is scoped to restaurant/order/operation/key + body hash; same
   body replays, different body is 409, and a cross-tenant key cannot replay.
6. `DELETE /api/orders/{id}` is the only cancellation path; status-route
   cancellation is rejected with `USE_CANCEL_ENDPOINT`.
7. Cancellation writes one chit per station that had a ticket, with reason,
   order version and cancelled totals; PENDING/no-ticket orders get no chit.
8. Cancellation ticket/event, `RestaurantChange` and audit are durable with the
   mutation; SSE publishes after commit.
9. `VOID`/`REFUND` do not produce cancellation chits; they still update the
   change feed and audit.
10. Staff `/api/events/orders` emits `order_items_added` and `order_cancelled`
    as additive, tenant-filtered signals; there is no second staff SSE and no
    cursor change.
11. `/api/counter/changes` reports add-on/cancel/void/refund `order` rows; the
    route shape and 410 semantics are unchanged.
12. `counterAutoPrint` and the exact SKIPPED-cancellation rule are in the
    contract and the print-tickets projection; B2 behaviour is unchanged.
13. The `orders:counter_serve` migration applies idempotently through
    `migrate deploy`; the seed remains the source template; the route fallback
    remains for one release.
14. `phase-b-counter-feed-v1` is frozen with a content commit and recorded
    stamp/hash; B3-C has a handoff.
15. Two-tenant mocked tests pass for add-on, cancellation, SSE, changes,
    ticket/ack and cross-tenant 404/fail-closed.
16. A manual two-tenant staging check is recorded before deployment. If a second
    tenant cannot be created, the blocker is recorded and no isolation claim is
    made.
17. Type-check, full tests and build pass; the pre-existing lint baseline is not
    made worse.

## Verification commands

```text
npm run type-check
npx jest src/tests/order-add-items-service.test.ts
npx jest src/tests/order-add-items-route.test.ts
npx jest src/tests/order-cancel-route.test.ts
npx jest src/tests/counter-print-tickets-route.test.ts
npx jest src/tests/counter-print-ack-route.test.ts
npx jest src/tests/counter-changes-route.test.ts
npx jest src/tests/staff-sse-signals.test.ts
npm test -- --runInBand
npm run build
```

Do not claim a command passed unless it was run. Lint is a known red baseline;
record the before/after counts if touched areas are linted.

## Review focus

- Exactly-once add-on ticket and exactly-once cancellation chit.
- Totals, tax snapshots, version and loyalty-path correctness.
- Idempotency scope/hash and cross-tenant replay resistance.
- Durable event/change/audit versus best-effort SSE.
- No cancellation chit for PENDING/no-ticket or VOID/REFUND.
- B2 compatibility: `phase-b-print-v1` text untouched; `counterAutoPrint` is
  additive; `COUNTER` cancellation remains `SKIPPED`.
- One staff SSE only; tenant filter fail-closed.
- Migration idempotency and rollback.
- Contract matches code and test evidence; no PII in payloads/audit/logs.

## Commit and deployment gate

- Implementation on `feat/b3-s-counter-feed`; no push to `main`.
- Fresh independent verifier on the exact diff; record session id and diff hash.
- After verifier PASS, the Lead freezes the contract and records the stamp.
- R3: a review PASS is not deployment approval. Publish the exact path list and
  commit message, then obtain explicit human authorization before any push,
  Railway deploy or production migration.
- Do not run `npm run db:seed` in production. The migration is the production
  path.
- B3-C does not start until the frozen contract path/stamp/commit is published.

### Proposed local commit plan (awaiting authorization)

Commit 1 — content:

```text
feat(counter): add add-items, cancellation chits and staff signals

- add POST /api/orders/{id}/items with server-owned totals/tax/version
- canonical DELETE cancellation with durable chit/change/audit
- add order_items_added/order_cancelled staff signals
- add counterAutoPrint and in-transaction change rows
- add OrderMutationIdempotency and orders:counter_serve migrations
- add phase-b-counter-feed-v1 contract draft and tests
```

Paths: all modified/new files under `src/`, `prisma/`, `docs/PRODUCT/`,
`docs/ai/ACTIVE.md`, `docs/ai/BACKLOG.md` and
`docs/ai/runs/QR-EAT-B3-S-COUNTER-FEED/` shown by `git status`; no `.env`,
auth, seed or `phase-b-print-v1` edits.

Commit 2 — freeze record:

```text
docs(contract): freeze phase-b-counter-feed-v1 at <commit-1>
```

Paths: `docs/PRODUCT/COUNTER-FEED-CONTRACT.md` (header stamp),
`docs/PRODUCT/RELEASE-COMPATIBILITY.md` (stamp/hash), and the task
`TASK.md`/`RUN_LOG.md`/`NEXT.md`/`B3-C-HANDOFF.md` final stamp.

Neither commit is pushed or deployed by this authorization. Deployment remains
a separate explicit approval after the manual two-tenant staging gate.

## Residual risks and follow-ups

- A real Postgres two-tenant integration harness does not exist. Add it as a
  separate backlog item before pilot/production; B3-S uses mocked tests plus the
  manual staging gate.
- `OrderModification.idempotencyKey` remains globally unique; B3 uses derived
  internal keys for add-items/cancel. The pre-existing `PATCH /modify` route is
  not reworked in B3-S.
- `VOID`/`REFUND` keep their legacy idempotency lookup; only `CANCEL` gets the
  scoped receipt in this task.
- The staff SSE still has no `id:` cursor and uses timestamp catch-up; B3 treats
  it as a signal only and relies on the changes cursor for recovery.
- Event retention remains 7 days; no retention change in B3-S.

## Handoff after verification

1. Fresh `ame-verifier` verifies code, migration, tests and contract.
2. Lead writes `REVIEW-01.md`; FAIL returns to the same implementer with only
   the findings.
3. After verifier PASS, the Lead freezes the contract, updates `RUN_LOG.md`,
   `NEXT.md`, `RELEASE-COMPATIBILITY.md` and the B3-C handoff.
4. Stop at the commit/deploy gate.

## Implementation evidence — 2026-11-18

- Implementer session: `ses_e1279dc1dffe73zs748xaNxsYC` (one child).
- Verifier session: `ses_e1251ca3effegPPbNW6vIlHS45` (fresh, read-only) —
  **PASS WITH NOTES**; see `REVIEW-01.md`.
- Diff hashes: full tracked `e75227cc…`; product tracked `8601eac7…`;
  product + new `319fcf0c…` (pre-correction; see the exact recipe in
  `RUN_LOG.md`).
- Notes correction cycle 1 (same implementer `ses_e1279dc1dffe73zs748xaNxsYC`):
  R-01–R-07 and optional R-10 applied; R-08/R-09 Lead-owned and closed.
  §5.4 chit-version clarification added by the Lead.
- Corrected diff hashes (review binding): full tracked `3b25135d…`; product
  tracked `94a6c404…`; product + new `e419e8f0…`. Post-review docs-only delta
  (N-01/N-02/N-03) confirmed by the verifier; code, schema, migrations and
  tests unchanged. The final commit hash is recorded in the freeze stamp.
- Corrected evidence: type-check PASS; targeted 7 suites/89 tests PASS; full
  136 suites + 1 skipped, 1644 passed / 11 skipped; build PASS; lint 61/11.
- Final verifier re-review: **PASS** (`REVIEW-02.md`); all R-01–R-10 findings
  closed; N-01/N-02 handled by the Lead. All three corrected hashes reproduced.
- Contract is ready to freeze. Commit/deploy still requires explicit human
  authorization.
- Freeze content commit `4bf9d385959b7f83a2dea6fd9cb3fd0abd11f141`; contract
  `phase-b-counter-feed-v1` frozen at `4bf9d38`. No push/deploy/seed.
- Baseline: type-check PASS; full tests 130 suites passed + 1 skipped,
  **1568 passed, 11 skipped**; build PASS only with generated non-secret
  build-time env (documented by the implementer, no `.env` written).
- Final: type-check PASS; targeted 7 suites/**86 tests** PASS; full tests
  **136 suites passed + 1 skipped, 1640 passed, 11 skipped**; build PASS.
- Lint: 61 errors, 11 warnings (pre-existing; baseline 62/11, not worse).
- Migration: disposable Postgres 16, 37 migrations applied; second
  `migrate deploy` no-op; permission SQL applied twice with counts staying
  1 permission / 1 cashier mapping; `prisma migrate diff` no difference.
- Client-path check: web uses `DELETE`; Counter `advanceOrderStatus` excludes
  `CANCELLED` and `cancelOrder()` uses `DELETE`.
- Deviations reported by the implementer:
  1. added `src/lib/orders/order-mutation-idempotency.ts` (shared hash/derived
     key) outside the expected file list;
  2. `recordOrderItemsAdded()` now returns `OrderCreatedResult` instead of
     `number` (only caller is the new service);
  3. removed the post-commit `AuditLogger.logSecurityEvent()` from adjustments
     and replaced it with the in-transaction `audit_logs` row;
  4. `counterAutoPrint` uses literal event-type strings to keep
     `print-ack-service.ts` free of Prisma/order-events imports;
  5. contract is `IMPLEMENTED — awaiting verifier PASS and freeze`, not yet
     frozen.
- Open blockers: B3-C handoff draft is at `/tmp/opencode/B3-C-HANDOFF.md`
  (Lead must place it after freeze); manual two-tenant staging gate not run;
  contract freeze pending verification.
- Verifier focus: exactly-once tickets, idempotency/hash/cross-tenant replay,
  totals/tax/loyalty parity, tx vs post-commit boundaries, no chit for
  PENDING/VOID/REFUND, migration idempotency, B2 compatibility.
