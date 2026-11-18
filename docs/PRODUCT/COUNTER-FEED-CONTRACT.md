# Phase B Counter Feed Contract — add-items, cancellation and staff signals

**Contract ID:** `phase-b-counter-feed-v1`  
**Status:** **FROZEN `phase-b-counter-feed-v1`** — content commit hash recorded
by the follow-up docs commit (see §15)  
**Owner:** QR-Eat (server)  
**Consumers:** Tabtep Counter (B3-C), QR-Eat web/POS, staff real-time clients  
**Base:** `main` `a0e3753` (2026-11-18), branch `feat/b3-s-counter-feed`  
**Relationship:** additive to frozen [`phase-b-print-v1`](./PRINT-ACK-CONTRACT.md).
It does not change that contract's text, transition matrix or `printMode`
semantics.

This is the server half of B3. It defines a real add-items producer, the
canonical whole-order cancellation chit, the staff SSE/change-feed signals, and
the Counter print projection for cancellation. There is no new Counter or
Kitchen UI in this contract, and no `../Tabtep-App` change is defined here.

---

## 1. Scope

### 1.1 In scope

- `POST /api/orders/{orderId}/items` — server-priced add-items for a live order.
- `DELETE /api/orders/{id}` — the only cancellation path, with refund, reason,
  idempotency, durable audit, one chit per station that had a ticket.
- Rejection of legacy `PATCH /api/orders/{id}/status` with `CANCELLED`.
- Additive staff SSE types `order_items_added` and `order_cancelled`.
- In-transaction `RestaurantChange` rows for add-items, cancel, void and refund.
- `counterAutoPrint` on the Counter ticket projection.
- The `orders:counter_serve` production permission migration.

### 1.2 Out of scope

- Item-level, add-on-only or partial-line cancellation.
- New Counter/Kitchen UI or any Android edit.
- A second staff SSE stream, SSE `id:` cursors or a new catch-up design.
- Client-side pricing, tax, routing or print eligibility.
- Changing `order.created` timing or its after-commit path.
- Changing frozen `phase-b-print-v1` text.
- Loyalty enablement, HMAC keys, new feature flags.
- A real Postgres integration harness (separate backlog item).

---

## 2. Vocabulary and invariants

- **Order version** is the optimistic-lock integer on `orders.version`. Every
  B3 mutation increments it exactly once.
- **Ticket** means a printable `OrderEvent` row, not an order.
- **Printable types** remain `order.created`, `order.items.added`,
  `order.cancelled` (`phase-b-print-v1` §6.3).
- **Server is authoritative** for menu price, option price, tax, service,
  discount, routing, ticket state and idempotency.
- **Durable vs best-effort:** the order/items, ticket rows, `RestaurantChange`
  row and `AuditLog` row commit atomically. SSE publication is after commit and
  best-effort; the changes feed and polling recover a lost signal.

---

## 3. Add-items API

### 3.1 Route and authority

```text
POST /api/orders/{orderId}/items
```

- Staff authentication: existing session cookie or Bearer token.
- Permission: `orders:write`.
- Tenant-scoped by `requireOrderAccess(orderId, context)`.
- A missing order **and** a cross-tenant order both return **404
  `ORDER_NOT_FOUND`**. No existence leak.
- Back-office/POS surface only; B3-S ships no web UI.

### 3.2 Request

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
      "optionIds": ["550e8400-e29b-41d4-a716-446655440030"],
      "notes": null
    }
  ]
}
```

| Field | Rule |
|---|---|
| `expectedVersion` | Required positive integer. Must equal `orders.version` at commit. |
| `idempotencyKey` | Required UUID. Scoped receipt key. |
| `reason` | `out_of_stock`, `customer_request`, `kitchen_error`, `other`. |
| `reasonNotes` | Optional, max 500, trimmed. Stored on the modification, never in audit/SSE. |
| `customerNotified` | Required boolean. |
| `items` | 1–100 lines. `menuItemId`, `quantity` 1–99, optional `optionIds`, optional `notes` (max 300). Reuses `CounterOrderItemSchema`. |

Lines are validated and priced by the same server rule as Counter order
creation (`priceCounterOrderLines`). A client price is ignored; there is no
client pricing field.

### 3.3 State and payment rules

| Condition | Result |
|---|---|
| `PENDING`, `CONFIRMED`, `PREPARING`, `READY` | allowed |
| `SERVED`, `CANCELLED` | **409 `ORDER_NOT_ADDABLE`** |
| `paymentStatus` `PAID` or `REFUNDED` | **409 `PAYMENT_STATE_INVALID`** |
| Order's business day has an explicit `CLOSED` record | **409 `BUSINESS_DAY_CLOSED`** |
| `expectedVersion` differs | **409 `ORDER_VERSION_CONFLICT`** |

Status, payment, version and rate-snapshot guards are re-checked under the
transaction after the order lock. The business-day guard is evaluated before
the transaction starts; a day that closes during the request does not re-open
the mutation.

### 3.4 Pricing and totals

- The server loads the live menu item, category availability, variation groups,
  option availability/min/max and option modifiers.
- `unitPrice = menuItem.price + selected option modifiers`;
  `lineTotal = unitPrice × quantity`.
- The whole bill is recomputed from all existing plus added lines using the
  order's **stored** `taxRateSnapshot` and `serviceChargeRateSnapshot`.
  `taxAmount` and `serviceCharge` floor to 2 decimals; `totalAmount` is their
  sum. A takeaway order (or a zero snapshot) charges no service.
- The loyalty/promotion ledger is re-evaluated only through
  `reapplyPromotionForModifiedOrder`, which returns `null` unless loyalty is
  active. No new flag is introduced.
- Missing rate snapshots are a **409 `ORDER_NOT_ADDABLE`** safeguard, never a
  guess.

### 3.5 Version, modification and audit

In one transaction the server:

1. re-reads the order and takes the same bill locks as the modify/payment path
   (customer/day, then bill/order);
2. creates `OrderItem` rows with selected options;
3. creates one `OrderModification` with `reason`, `reasonNotes`, old/new totals
   and `OrderModificationItem` rows with `action:'added'`;
4. increments `orders.version` once, increments `modificationCount`, sets
   `hasModifications` and `lastModifiedAt`;
5. writes the add-on ticket when the order is live (see §4);
6. writes the `RestaurantChange` row;
7. writes the `AuditLog` row with no item names, notes or customer PII.

`OrderModification.idempotencyKey` remains globally unique. B3 uses the derived
internal key:

```text
ADD_ITEMS:{orderId}:{client idempotencyKey}
```

### 3.6 Idempotency

Receipt: `order_mutation_idempotency`
(`restaurantId`, `orderId`, `operation`, `idempotencyKey`) with
`operation='ADD_ITEMS'`, a canonical `requestHash` and `responseJson`.
Soft references only; no foreign keys.

The canonical hash covers the request body except `idempotencyKey`, plus
`orderId` and the operation. `optionIds` are sorted; `clientItemId` and notes
are normalised.

- Same key + same hash: return the stored response with `isDuplicate:true` and
  `ticket.replayed:true`. No second order mutation, item, ticket, change, audit
  or SSE.
- Same key + different hash: **409 `IDEMPOTENCY_KEY_REUSED`**.
- Concurrent same-key race: the loser re-reads the receipt and replays it.
- Scope includes `restaurantId`, so a key from tenant A cannot replay for tenant
  B. The route also returns 404 before the lookup for a cross-tenant order.

A replay is decided **before** version/status/payment checks: the successful
request already moved those fields.

### 3.7 Response

```json
{
  "success": true,
  "order": {
    "id": "ord_123",
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
    {
      "id": "oi_9",
      "menuItemId": "mi_2",
      "quantity": 1,
      "totalAmount": "6.00"
    }
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

All money fields are decimal strings with two places. `addedItems` lists only
the new lines. `ticket.routed` is false for a PENDING order (no event).

### 3.8 Errors

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Body shape, UUID, quantity, unavailable menu line/option |
| 401 | — | No/invalid staff session |
| 403 | `PERMISSION_DENIED` | Missing `orders:write` |
| 404 | `ORDER_NOT_FOUND` | Missing or cross-tenant order |
| 409 | `ORDER_VERSION_CONFLICT` | Stale `expectedVersion` |
| 409 | `ORDER_NOT_ADDABLE` | Served/cancelled order or missing snapshots |
| 409 | `PAYMENT_STATE_INVALID` | Paid/refunded order |
| 409 | `BUSINESS_DAY_CLOSED` | Closed business day |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Same key, different body |
| 500 | — | Unexpected failure |

---

## 4. Add-on ticket (`order.items.added`)

- One event row per routed station, written in the add-items transaction.
- Payload `items` contains **only** the added lines. `addedItemIds` lists those
  item ids. `orderVersion` is the new order version after the mutation.
- The payload also carries the existing order document fields (order number,
  table/fulfilment, order note, station subtotal, fallback) and the stamped
  `printMode`.
- Initial print state is unchanged from `phase-b-print-v1` §5.1:
  `COUNTER=PENDING`, `STATION=PENDING`, `NONE=SKIPPED` (with the KDS reason).
- Routing uses the same category/default-station rule as creation.
- A **PENDING** add-items writes no event. The later `order.created` reads all
  items and includes the added lines exactly once.
- A live order with no creation events writes no add-on event; the caller sees
  `ticket.routed:false`. This matches “one ticket per station that received the
  original”.
- Retrieval is the existing `GET /api/counter/orders/{orderId}/print-tickets`
  ordered by `eventId`. The Counter dedupes by `eventId`; a replayed add-items
  response never creates a second event.

---

## 5. Canonical cancellation

### 5.1 Only route

```text
DELETE /api/orders/{id}
```

`PATCH /api/orders/{id}/status` with `CANCELLED` returns
**409 `USE_CANCEL_ENDPOINT`** before any read or mutation: no event, no audit,
no change row, no SSE. The other status transitions keep their existing
authority.

### 5.2 Authority and policy

The policy is unchanged (`getOrderAdjustmentPolicy`):

- PENDING: manager/owner or `orders:write`;
- after confirmation: manager/owner only;
- SERVED + PAID: `REFUND`; SERVED + PENDING/FAILED: `VOID`;
- closed business day blocked;
- already cancelled blocked.

A missing order and a cross-tenant order both return **404 `ORDER_NOT_FOUND`**
for cancel, void and refund.

The actor's trusted IP and user agent are stored on the durable audit row.
`trustedIp()` never trusts client-supplied headers off-Railway.

### 5.3 Transaction

For `CANCEL` the same transaction contains:

1. a full refund payment when `paymentStatus='PAID'`;
2. `OrderModification` with reason, reason notes and the derived internal key
   `CANCEL:{orderId}:{client idempotencyKey}`;
3. the order status `CANCELLED`, `paymentStatus` (`REFUNDED` if refunded),
   `version + 1`, `lastModifiedAt`;
4. the table-status recalculation;
5. one `order.cancelled` event per station that already received a printable
   event;
6. the `RestaurantChange` row (`entityType:'order'`, `operation:'upsert'`);
7. the `AuditLog` row.

A failed ticket, change or audit write rolls the whole mutation back. The
deliberate B3 exception is documented in §9.

### 5.4 Cancellation chit

- One `order.cancelled` per distinct station that has a printable event for the
  order. An order with no printable event (for example PENDING/no ticket) gets
  **no chit**, and B3 does not invent a fallback station.
- The chit `version` is the **post-increment** order version (the pre-cancel
  version + 1), matching `order.status.changed`; `cancelledTotals` are captured
  before the update.
- Initial state is unchanged: `COUNTER=SKIPPED`, `STATION=PENDING`,
  `NONE=SKIPPED`.
- Payload keeps order number, from/to, order version, reason and stamped
  `printMode`, and adds:

```json
{
  "cancelledTotals": {
    "subtotal": "20.00",
    "taxAmount": "1.20",
    "serviceCharge": "2.00",
    "discountAmount": "0.00",
    "totalAmount": "23.20"
  }
}
```

Totals are decimal strings captured before the cancellation update.

### 5.5 Idempotency and duplicates

`CANCEL` uses `order_mutation_idempotency` with `operation='CANCEL'` and the same
canonical-hash rule as §3.6:

- same key + same body: replay the stored result (`replayed:true` /
  route `isDuplicate:true`), write nothing;
- same key + different body: **409 `IDEMPOTENCY_KEY_REUSED`**;
- a concurrent duplicate that loses the unique-key race replays the stored
  result; its whole transaction was rolled back, so no second refund/ticket.

Duplicate protection is scoped idempotency + unchanged status policy + the
optimistic order version.

### 5.6 VOID and REFUND

- `POST /api/orders/{id}/void` and `/refund` keep their existing authority and
  legacy idempotency lookup.
- They write the order mutation, `RestaurantChange` row and `AuditLog` row in
  the transaction.
- They emit **no** `order.cancelled` chit.
- `VOID` keeps its status change to `CANCELLED`.
- After commit, `CANCEL` publishes `order_cancelled`; `VOID` reuses the existing
  `order_status_changed` signal when the status moved; `REFUND` relies on the
  durable change row.

---

## 6. Counter ticket projection and `counterAutoPrint`

`GET /api/counter/orders/{orderId}/print-tickets` keeps its existing shape,
`eventId` ordering, filters and `canAck`, and adds the additive field
`counterAutoPrint`.

Exact rule:

| Type | Effective `printMode` | `printStatus` | `counterAutoPrint` |
|---|---|---|---|
| `order.created`, `order.items.added` | `COUNTER` | `PENDING` or `FAILED` | **true** |
| `order.created`, `order.items.added` | `COUNTER` | `PRINTED`, `SKIPPED`, `UNKNOWN` | false |
| `order.cancelled` | `COUNTER` | any status except `PRINTED` | **true** |
| `order.cancelled` | `COUNTER` | `PRINTED` | false |
| any printable | `STATION` or `NONE` | any | false |
| non-ticket | any | any | false |

- A `COUNTER` cancellation chit therefore starts `SKIPPED` (B2 compatibility)
  yet is auto-printable by B3 until it is `PRINTED`.
- `PRINTED` is terminal. `counterAutoPrint` is not a substitute for the ack
  authority matrix.
- A legacy cancellation chit with `printStatus=null` projects as `UNKNOWN` and
  is therefore auto-printable **once** under `COUNTER` (the rule is
  `!== 'PRINTED'`). The Counter dedupes by `eventId`; if paper already existed
  for that legacy event, staff may simply not reprint it, or reprint manually
  and ack `PRINTED`.
- B2 ignores the field and keeps its own `order.created`/`order.items.added`
  filter.

### 6.1 Ack

`POST /api/counter/orders/{orderId}/print-ack` is unchanged. `SKIPPED → PRINTED`
is already allowed under `COUNTER` authority, which is how a cancellation chit
is acknowledged. The event update and audit row remain one transaction.
Cross-tenant ticket fetch/ack return **404**.

---

## 7. Staff SSE

One staff stream only: `GET /api/events/orders`. B3 adds two additive types:

| Channel | SSE `type` |
|---|---|
| `order_items_added` | `order_items_added` |
| `order_cancelled` | `order_cancelled` |

Payload (both):

```json
{
  "orderId": "ord_123",
  "restaurantId": "rest_1",
  "orderNumber": "A-0142",
  "orderVersion": 5,
  "ticketCount": 2,
  "timestamp": 1763460000000
}
```

- No reason, item text, customer name/phone, totals or printer data.
- Dual-written to `pending_events` and `NOTIFY` with the existing pattern.
- Tenant filter is the single `canReceiveRestaurantEvent` check and fails
  closed when either id is missing or they differ.
- No `id:` cursor is added and catch-up semantics are unchanged. Treat the
  signal as “refresh”; recovery is the changes cursor plus ticket/order fetch.
- Published only after the mutation commits, best-effort. A PENDING add-items
  and a VOID/REFUND publish no add-on/cancellation signal.

---

## 8. Counter changes feed

`GET /api/counter/changes?since=<seq>` shape, cursor semantics and
`410 CURSOR_EXPIRED` handling are unchanged.

- Add-items, cancel, void and refund write `entityType:'order'`,
  `operation:'upsert'` in the same transaction as the mutation.
- `recordRestaurantChangeTx()` throws, so the mutation rolls back if the row
  cannot be written.
- The existing best-effort `recordRestaurantChange()` remains for other
  callers.

---

## 9. Deliberate B3 exception

For B3 add-items and cancellation/void/refund, the change row is part of the
contract, not a cache hint. A failed change row fails the mutation. This is
intentionally stricter than the older best-effort feed used by unrelated
callers, because the Counter relies on this feed to recover a lost SSE signal.
The deliberate trade-off and the Postgres two-tenant gap are recorded in §14.

---

## 10. Tenant and security rules

- Every route scopes by the authenticated `restaurantId`.
- Cross-tenant and missing ids are indistinguishable: **404** on add-items,
  cancel, void, refund, print-tickets and print-ack.
- Platform admins cannot read or mutate tenant business data through these
  routes.
- Idempotency receipts are scoped by restaurant; a receipt from tenant A is not
  visible to tenant B.
- Audit rows never contain item names, reason notes, customer name/phone,
  payment payloads or printer addresses.
- SSE payloads contain no reason, item text or customer data.
- No new secret, HMAC key or environment flag is introduced.

---

## 11. B2 compatibility matrix

| Surface | B2 behaviour | B3-S change |
|---|---|---|
| `phase-b-print-v1` text | frozen | untouched |
| `printMode` values/defaults | `STATION`/`COUNTER`/`NONE` | unchanged |
| `order.created` payload | existing | unchanged (creation path/timing) |
| `order.items.added` | writer existed, no producer | producer wired; additive `orderVersion` |
| `order.cancelled` initial state | `COUNTER=SKIPPED` | unchanged |
| Counter ticket endpoint | existing fields | additive `counterAutoPrint` only |
| Counter print-ack | existing matrix | unchanged |
| Station SSE | existing frame | unchanged; no `orderVersion` added |
| Staff SSE | existing types | additive `order_items_added`, `order_cancelled` |
| Counter changes | existing shape | new in-transaction order rows |
| Cancellation route | `DELETE` | now also chit/audit/idempotency durable |
| Legacy status cancel | accepted | **409 `USE_CANCEL_ENDPOINT`** (deliberate) |

An old B2 Counter build ignores `counterAutoPrint`, does not call the add-items
route and continues to read the unchanged ticket/ack endpoints.

---

## 12. Error table (cancellation)

| HTTP | Code | Meaning |
|---|---|---|
| 400 | — | Invalid reason/body/idempotency UUID |
| 401 | — | No/invalid session |
| 403 | `PERMISSION_DENIED` | Missing route permission |
| 403 | `ORDER_ADJUSTMENT_NOT_ALLOWED` | Policy denied |
| 404 | `ORDER_NOT_FOUND` | Missing or cross-tenant |
| 409 | `ORDER_VERSION_CONFLICT` | Stale version |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Same key, different body |
| 409 | `REFUND_PAYMENT_NOT_FOUND` | Paid order without a captured payment |
| 409 | `USE_CANCEL_ENDPOINT` | Legacy status cancellation rejected |

---

## 13. Production gates

1. Verifier PASS on code, migrations and this contract.
2. `prisma migrate deploy` against a disposable/copy database; the permission
   migration applied twice leaves exactly one permission and one cashier
   mapping.
3. Do **not** run `npm run db:seed` in production. The migration is the
   production path.
4. Two-tenant manual staging check before deployment: tenant A performs
   add-items/cancel and cannot fetch or ack tenant B's order/tickets.
5. Human authorization before push, Railway deploy or production migration.
6. B3-C does not start until the freeze stamp/hash is published.

If a second tenant cannot be created in staging, record the blocker and make no
isolation claim.

---

## 14. Test matrix and residual risks

Covered by mocked route/service/writer tests:

- add-items success on CONFIRMED/PREPARING/READY; no event on PENDING;
- only added items in the add-on payload; `orderVersion` present;
- initial `COUNTER/STATION=PENDING`, `NONE=SKIPPED`;
- totals from stored snapshots; version/modification count increment;
- paid/served/cancelled/closed-day rejection; version conflict;
- same-key replay, different-body 409, concurrent duplicate; cross-tenant 404;
- audit/change row and post-commit SSE;
- cancellation chit per station, no chit for PENDING/no-ticket or VOID/REFUND;
- cancellation totals, reason and version; duplicate replay;
- legacy `PATCH /status` `CANCELLED` → 409;
- new SSE mapping/payload/tenant filter/no cursor;
- changes rows write in the transaction and throw on failure;
- `counterAutoPrint` matrix and SKIPPED cancellation ack;
- migration SQL guard and the `migrate deploy` apply.

Residual risks:

- No real Postgres two-tenant integration harness exists; mocked tests plus the
  manual staging gate are the evidence.
- `OrderModification.idempotencyKey` remains globally unique; B3 uses derived
  keys for add-items/cancel. `PATCH /modify` is not reworked.
- VOID/REFUND keep their legacy idempotency lookup.
- The staff SSE still has no `id:` cursor; the changes feed is the recovery
  path.
- Event retention remains 7 days.

---

## 15. Freeze stamp

**Current status:** implemented and test-covered; **not frozen**.

The freeze is a Lead-owned operation:

1. verifier PASS on the exact diff;
2. content commit containing this file;
3. header becomes
   `FROZEN phase-b-counter-feed-v1 at <content-commit>`;
4. follow-up docs commit records the stamp/hash in
   `RELEASE-COMPATIBILITY.md` and `B3-C-HANDOFF.md`.

```text
Contract:        phase-b-counter-feed-v1
Content commit:  <pending Lead record>
Frozen at:       <pending Lead record>
Server base:     a0e3753
Implementation:  feat/b3-s-counter-feed (uncommitted at handoff)
```
