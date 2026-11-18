# B3-C Handoff — Counter feed contract

**Status:** server implementation **verifier PASS**; contract **FROZEN** at
`4bf9d38`; staging gate **PASSED** 2026-11-18; server **DEPLOYED** 2026-11-19
(merge `ab63894`, Railway `27852ccb…` SUCCESS, health UP, migrations applied,
no seed). B3-C may start against the frozen contract.

- **Contract:** `docs/PRODUCT/COUNTER-FEED-CONTRACT.md`
- **Contract ID:** `phase-b-counter-feed-v1` (additive to frozen
  `phase-b-print-v1`)
- **Status:** **FROZEN at `4bf9d38`** (content commit
  `4bf9d385959b7f83a2dea6fd9cb3fd0abd11f141`, 2026-11-18)
- **Implementation branch:** `feat/b3-s-counter-feed`, base `a0e3753`
- **Freeze content commit:** `4bf9d385959b7f83a2dea6fd9cb3fd0abd11f141`
- **Freeze stamp/hash:** `4bf9d385959b7f83a2dea6fd9cb3fd0abd11f141`
- **Verification:** `REVIEW-01.md` PASS WITH NOTES → `REVIEW-02.md` PASS
- **Diff binding:** reviewed full tracked `3b25135d…` / product `94a6c404…` /
  product+new `e419e8f0…`; post-review docs-only delta N-01/N-02/N-03 confirmed
  with no code, schema, migration or test change. Final commit hash is recorded
  in the freeze stamp.
- **Android repo:** not edited in B3-S. B3-C consumes this contract in its own
  `../Tabtep-App` session.

## What the Counter must implement

1. **Add items** through `POST /api/orders/{orderId}/items`; send the current
   `expectedVersion` and a fresh UUID `idempotencyKey`. Never price locally.
2. **Cancel** through `DELETE /api/orders/{id}` only. Do not send
   `PATCH /status` `CANCELLED`; it returns 409 `USE_CANCEL_ENDPOINT`.
3. **Fetch tickets** with the existing
   `GET /api/counter/orders/{orderId}/print-tickets` and honour the additive
   `counterAutoPrint` field.
4. **Ack** with the existing `print-ack` route and dedupe by `eventId`. A
   cancellation chit starts `SKIPPED` under `COUNTER`; `SKIPPED → PRINTED` is
   allowed.
5. **Refresh** on staff SSE `order_items_added` / `order_cancelled`, then use
   `/api/counter/changes` and the order/ticket fetch. The SSE payload is a
   signal only: no reason, item text or customer data.
6. Do not require an SSE `id:` cursor and do not open a second staff stream.

## Add-items request and response

```http
POST /api/orders/{orderId}/items
Authorization: Bearer <staff token>
Content-Type: application/json
```

```json
{
  "expectedVersion": 4,
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000",
  "reason": "customer_request",
  "reasonNotes": "optional",
  "customerNotified": true,
  "items": [
    {
      "menuItemId": "550e8400-e29b-41d4-a716-446655440020",
      "quantity": 1,
      "optionIds": [],
      "notes": null
    }
  ]
}
```

Key response fields:

```json
{
  "success": true,
  "order": {
    "status": "CONFIRMED",
    "paymentStatus": "PENDING",
    "version": 5,
    "subtotalAmount": "24.00",
    "taxAmount": "1.20",
    "serviceCharge": "2.40",
    "discountAmount": "0.00",
    "totalAmount": "27.60"
  },
  "addedItems": [
    { "id": "oi_9", "menuItemId": "mi_2", "quantity": 1, "totalAmount": "6.00" }
  ],
  "ticket": {
    "routed": true,
    "stationIds": ["st_1"],
    "unroutedItemIds": [],
    "replayed": false
  },
  "isDuplicate": false,
  "serverTime": "2026-11-18T10:00:00.000Z"
}
```

Idempotency:

- same key + same body → stored response, `isDuplicate:true`,
  `ticket.replayed:true`, no second ticket;
- same key + different body → 409 `IDEMPOTENCY_KEY_REUSED`;
- scope is restaurant + order + operation + key, so a cross-tenant key cannot
  replay.

## Add-on ticket

`order.items.added` payload contains only the added lines plus the order
document fields. Additive field:

```json
{ "orderVersion": 5 }
```

Initial state stays `COUNTER=PENDING`, `STATION=PENDING`, `NONE=SKIPPED`. A
PENDING order writes no add-on event; the later `order.created` includes the
items once.

## Cancellation

```http
DELETE /api/orders/{id}
```

Body = CancelOrderSchema: reason, optional reasonNotes, customerNotified,
version, UUID idempotencyKey.

- One `order.cancelled` chit per station that already had a printable ticket.
- No chit for a PENDING/no-ticket order and no chit for VOID/REFUND.
- Chit payload keeps order number/reason/post-increment version/printMode and
  adds `cancelledTotals` (decimal strings).
- Same-key same-body replay writes nothing; different body is 409.
- `VOID`/`REFUND` keep their routes, write the change/audit rows, and do not
  produce a cancellation chit.

## Print projection

`GET /api/counter/orders/{orderId}/print-tickets` adds:

```json
{ "counterAutoPrint": true }
```

Rule:

- `order.created` / `order.items.added`, `COUNTER`, `PENDING|FAILED` → true;
- `order.cancelled`, `COUNTER`, status not `PRINTED` → true (a legacy
  `null`/`UNKNOWN` chit is therefore auto-printable once; dedupe by `eventId`
  and reprint manually if paper already existed);
- `PRINTED`, `STATION`, `NONE`, non-ticket → false.

A `SKIPPED` COUNTER cancellation is therefore auto-printable; `PRINTED` is
terminal. The existing transition/authority matrix is unchanged.

## Changes feed

`GET /api/counter/changes` shape and 410 handling are unchanged. Add-items,
cancel, void and refund add an `order`/`upsert` row in the mutation
transaction. A failed change row fails the mutation on purpose; the Counter can
rely on this feed for recovery.

## Evidence

- Verifier: `REVIEW-01.md` PASS WITH NOTES → `REVIEW-02.md` PASS.
- Type-check: PASS.
- Full tests: 136 suites passed, **1644 passed, 11 skipped** (1 suite skipped).
- Targeted new/updated suites: add-items service/route, cancellation route,
  adjustment service, SSE signals, changes writer, migration guard, print
  tickets/ack, order events, cashier status.
- `prisma migrate deploy`: PASS on a disposable Postgres 16 database; the
  `orders:counter_serve` SQL applied twice left one permission and one cashier
  mapping; `migrate diff` no difference.
- Build: PASS (with non-secret local build env for VAPID/domain variables).
- Lint: 61 errors, 11 warnings (baseline 62/11).

## Residual risks and open gates

- No real Postgres two-tenant harness; mocked tests plus the manual staging gate
  are the evidence. No isolation claim has been made beyond the mocked 404
  tests.
- The server is deployed and healthy as of 2026-11-19; B3-C is the remaining
  cross-repo work.
- `OrderModification.idempotencyKey` remains globally unique; B3 uses derived
  keys. `PATCH /modify` was not reworked.
- VOID/REFUND keep the legacy idempotency lookup.
- The staff SSE has no `id:` cursor; the changes feed is the recovery path.
- DO NOT run the seed in production; the migration is the production path.
- Deployment requires explicit human authorization after verifier PASS and
  freeze.
