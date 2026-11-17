# Phase B Print Contract — station print mode, print acknowledgement and Counter printing

**Contract version:** `phase-b-print-v1`
**Status:** **FROZEN** `phase-b-print-v1` at **`39031bb`** (content commit,
2026-11-17; hash recorded by the follow-up docs commit).
**Owner:** QR-Eat
**Consumers:** Tabtep Counter (B2/B3), Tabtep Kitchen/Station, QR-Eat web/API
**Normative for:** the Phase B print surface. Where this document and the merged
code disagree about the **existing** surface, the code is authoritative until
B1-S reconciles it; where they disagree about the **target** surface, this
document is authoritative and B1-S must implement it.
**Inputs:** `../Tabtep-App/docs/ai/handoffs/QR-EAT-PHASE-B-PRINT-CONTRACT.md`;
`../Tabtep-App/docs/ai/runs/2026-11-17-counter-auto-print-phase-b/TASK.md`
(approved 2026-11-17).
**Parent index:** `docs/PRODUCT/API-CONTRACT.md`.
**Freeze task:** `docs/ai/runs/QR-EAT-PHASE-B-PRINT-CONTRACT/TASK.md`.

This contract is **additive**. It does not enable loyalty, does not change
loyalty behaviour, and does not introduce a new runtime flag. `LOYALTY_ENABLED`
and `LOYALTY_PHONE_HMAC_KEY` remain unset; the Phase B surface is independent of
loyalty.

---

## 1. Scope and phasing

```text
B0  Tabtep hygiene (separate)
B1  QR-Eat contract + server
    B1-C  this document: contract freeze (docs-only)
    B1-S  server implementation of this document (separate R3 task)
B2  Tabtep Counter: auto-print Counter-created orders, ack, visible state,
    READY/SERVED when Kitchen is absent
B3  QR/all orders + Counter order feed + optional Kitchen KDS-only migration
```

**B1-C is docs-only.** No server behaviour, schema, migration, seed, deploy,
push or flag changes occur in this task. **B2 must not start until B1-S is merged
and this contract is still the frozen version.** B3 is not designed here.

### 1.1 In scope

- station print acknowledgement and station SSE, recorded from the merged code;
- `OrderEvent.printStatus` semantics and projection;
- station `printMode: STATION | COUNTER | NONE`;
- Counter staff-authenticated ticket-payload and print-ack endpoints;
- print audit, reprint, retry, duplicate and no-downgrade rules;
- no-Kitchen-device confirmation for `COUNTER` / `NONE`;
- cashier PREPARING/READY/SERVED authority with audit;
- compatibility, rollout, rollback and security.

### 1.2 Out of scope

- QR/all-order auto-print and the Counter order feed (B3);
- per-station printer mapping, printer IPs, printer credentials, print routing
  beyond `printMode` (Phase C);
- web dashboard redesign, role cleanup, Kitchen staff login/PIN;
- loyalty, payments, reporting, receipts;
- changing the existing station device pairing model;
- changing `order_events` retention (7 days).

---

## 2. Verified current server surface (2026-11-17, `main`)

These facts are traced to the merged code. They are the baseline B1-S must
preserve unless a change is explicitly marked **B1-S target**.

### 2.1 Station device print acknowledgement

`POST /api/stations/me/print-ack`
— `src/app/api/stations/me/print-ack/route.ts`

| Fact | Current behaviour |
|---|---|
| Auth | Bearer **device token** via `authenticateDevice()` (`src/lib/device-auth.ts`). The JWT identifies one `deviceId` and `tokenVersion`; `restaurantId` and `stationId` are read from the live `Device` row, so a reassigned phone follows its new station. |
| Binding | The endpoint writes only the event whose `stationId` equals `auth.device.stationId`. A device cannot ack another station's event. |
| Body | `{ success, skipped, error, seq? }`. `success` is true only when strictly `true`. `skipped` is true only when strictly `true` **and** `success` is not true. `error` is a string truncated to 500 characters. |
| `seq` | Optional. When present it must be a positive safe integer; it is the **`OrderEvent.id`**. Legacy station builds may omit it. |
| Without `seq` | Only the device row is updated (`lastPrintAt` on success, `lastSeenAt` always). No `OrderEvent` is changed, so the ack cannot prove a specific ticket printed. |
| Event lookup | `OrderEvent.id = seq`; if missing, not on this station, or not one of `order.created`, `order.items.added`, `order.cancelled`, the endpoint returns **404** `{ success:false, error, code:'UNKNOWN_TICKET_EVENT' }`. |
| `success:true` | Sets `printStatus='PRINTED'`, `printAttemptedAt=now`, `printedAt = existing ?? now`, `printError=null`, `printDeviceId=device.id`. |
| `skipped:true` (not printed) | Sets `printStatus='SKIPPED'`, `printAttemptedAt=now`, `printError = error || 'KDS only — not printed'`, `printDeviceId=device.id`. `printedAt` stays null. |
| `skipped:true` (already printed) | Updates only `printAttemptedAt` and `printDeviceId`. **No status downgrade**; `printedAt` and `printStatus` stay. |
| failure (not printed) | Sets `printStatus='FAILED'`, `printAttemptedAt=now`, `printError = error || 'Printer failed'`, `printDeviceId=device.id`. |
| failure (already printed) | Updates `printAttemptedAt`, `printError = error || 'Reprint failed'`, `printDeviceId=device.id`. **No status downgrade**; `printedAt` stays. |
| Device row | `lastPrintAt=now` only on success; `lastSeenAt=now` on every accepted ack. |
| Response | `{ success:true, serverTime, device:{id,name,lastSeenAt,lastPrintAt}, print:{success,skipped,seq:string|null,error?} }`. |
| Audit | **None today.** B1-S adds audit (§7.4). |
| Idempotency | Repeating a success is state-idempotent (`printedAt` preserved). There is no idempotency key and no `reprint` field. |
| Authority | The endpoint does **not** read `printMode` today. B1-S adds the authority check (§4.4). |

### 2.2 Station SSE stream

`GET /api/events/station`
— `src/app/api/events/station/route.ts`

| Fact | Current behaviour |
|---|---|
| Auth | Bearer **device token**, re-checked every 5 seconds on a live stream. Revocation closes the stream; the reconnect handshake returns 401. |
| Resume | `?since=<seq>` or standard `Last-Event-ID`; otherwise the server falls back to `Device.lastEventId`. A cursor must be a non-negative safe integer, else **400**. |
| Retention | `order_events` older than **7 days** are not replayable. If the next event after `since` is older than the cutoff, the stream returns **410** `CURSOR_EXPIRED` with `snapshot: '/api/stations/me/snapshot'`. `src/app/api/cron/cleanup-events/route.ts` deletes rows older than 7 days. |
| Frame | `retry: 3000` initially, then `id: <seq>\nevent: <type>\ndata: <json>\n\n`. When idle, a `: ping\n\n` heartbeat is sent every 15 seconds; continuous event flow suppresses it. |
| Data fields | `{ seq: number, type: string, occurredAt: ISO-8601 string, stationId, orderId, payload }`. **There is no `orderVersion` field**; the older Tabtep §4.2 draft that showed one is not this server's frame. |
| Ordering | Ascending `OrderEvent.id` per batch of 100, filtered by `restaurantId` + `stationId`. `id` is global per database, so per-station gaps are normal and are not loss. |
| Delivery | Pull-based polling (1-second interval), not PostgreSQL NOTIFY. At-least-once across reconnects: a frame may be replayed after a disconnect; clients dedupe by `seq`. A detected gap or a 410 requires a full snapshot, never a guess. |
| Cursor persistence | After a batch, `Device.lastEventId` is updated best-effort. The client’s own cursor still wins. |
| Presence | A live stream refreshes `Device.lastSeenAt` every 60 seconds. |
| Event types written today | `order.created`, `order.item.status.changed`, `order.status.changed`, `order.cancelled`, `order.recalled`, `order.recall.cleared` (`src/lib/order-events.ts`). `order.items.added` has a writer (`recordOrderItemsAdded()`) but **no producer on `main`**; B1-S/B3 must wire the add-items path before add-on tickets exist. |
| Printable event types today | The device ack accepts `order.created`, `order.items.added`, `order.cancelled`. The Counter ticket-status endpoint aggregates only `order.created` and `order.items.added`. |

### 2.3 Station snapshot

`GET /api/stations/me/snapshot`
— `src/app/api/stations/me/snapshot/route.ts`

- Device auth; tenant-scoped.
- Returns `restaurant`, `station`, `categories`, `cursor`, `recallEnabled`,
  `recallWindowMinutes`, normalized `settings`, and open orders
  (`CONFIRMED`, `PREPARING`, `READY`) filtered to this station.
- Read in a `RepeatableRead` transaction so the cursor and the orders come from
  the same instant.
- Updates `Device.lastEventId` to the snapshot cursor best-effort.
- **This is the required full-resync path** after `CURSOR_EXPIRED` or a long
  offline period.

### 2.4 Counter ticket status (status only)

`GET /api/counter/orders/{orderId}/ticket`
— `src/app/api/counter/orders/[orderId]/ticket/route.ts`

- Staff auth: `counterAccessDenied()` (owner, manager, cashier), `orders:read`,
  `requireOrderAccess()` tenant check.
- Returns per-station **status only**: `eventId`, `stationId`, `stationName`,
  `type`, `status` (`printStatus ?? 'UNKNOWN'`), `attemptedAt`, `printedAt`,
  `error`; plus `aggregate` and `printedAt`.
- **It does not return `OrderEvent.payload`** and is not a print document.
- Aggregates only `order.created` and `order.items.added`
  (`aggregateTicketStatus()` in `src/lib/counter/ticket-status.ts`).
- Legacy null `printStatus` is `UNKNOWN`, never `PRINTED`.

### 2.5 Order status

`PATCH /api/orders/{id}/status`
— `src/app/api/orders/[id]/status/route.ts`

Current authority is restaurant-scoped; a platform admin (`context.isAdmin`) is
allowed unconditionally by the current route and is not shown separately below.

| Transition | Current authority |
|---|---|
| `CONFIRMED` | owner / manager only (plus the shared `confirmPendingOrder()` service) |
| `PREPARING`, `READY` | owner / manager, `kitchen_staff`, `orders:kitchen`, `kitchen:write` (`kitchen:write` is an unseeded custom grant) |
| `SERVED` | owner / manager, `waiter`, `orders:fulfill`; takeaway requires `paymentStatus = PAID` |
| `CANCELLED` | owner / manager only |

- `confirmPendingOrder()` (`src/lib/services/order-dispatch-service.ts`) requires
  **any** active device with `lastSeenAt` inside
  `COUNTER_STATION_ONLINE_WINDOW_MS = 90_000` before confirming, unless
  `offlineDelivered` or the manager-only `X-Station-Override: true` is used.
  It does not consult `printMode` today.
- Status changes write `AuditLog` (`tableName:'orders'`, `operation:'UPDATE'`,
  `oldValues.status`, `newValues.status`), publish a NOTIFY event, update the
  table status and record a restaurant change.

### 2.6 Station configuration

- `Station.settings` is a JSON object. Default:
  `{"warnMinutes":5,"lateMinutes":10,"density":"normal","textScale":"normal"}`.
- `src/lib/station-settings.ts` normalizes `warnMinutes`, `lateMinutes`,
  `density`, `textScale`. **There is no `printMode` today.**
- `POST /api/stations` creates a station with the database settings default;
  it does not accept settings.
- `PATCH /api/stations/{id}` accepts a partial `settings` object with those four
  keys and merges it.
- `GET /api/stations/me/settings` returns the normalized settings to a device.
- The Counter station-health endpoint
  (`src/app/api/counter/stations/health/route.ts`) reports `lastPrintAt` and
  `printerStatus: 'last-print-seen' | 'unknown'`; it is not a live printer
  sensor.

### 2.7 Counter order entry and change feed

- `POST /api/counter/orders` requires `orders:write`, an `Idempotency-Key`, and
  creates `Order.source='COUNTER'`; it confirms through the shared
  `confirmPendingOrder()` unless `sendToKitchen:false`.
- `POST /api/counter/orders/{orderId}/send` retries a Counter order; cashier may
  retry only an order they created (`takenBy`), owner/manager may retry any.
- `GET /api/counter/changes?since=` is a staff-authenticated
  **cache-invalidation** feed over `RestaurantChange`; it does not carry order
  or ticket payloads. It is not a Counter order feed.
- There is **no** Counter/staff order SSE feed. The station SSE is device-auth.

### 2.8 Schema facts

- `OrderEventPrintStatus = PENDING | PRINTED | FAILED | SKIPPED`.
- `OrderEvent.printStatus` is nullable; null means legacy/unknown.
- `OrderEvent` also has `printAttemptedAt`, `printedAt`, `printError`,
  `printDeviceId`.
- `OrderEvent.id` is `BigInt` autoincrement and is the resume cursor.
- `Device` has `stationId`, `isActive`, `tokenVersion`, `lastSeenAt`,
  `lastPrintAt`, `lastEventId`.
- `Station` has `settings Json`, no `printMode` column.
- `AuditLog` has `tableName`, `recordId`, `operation`, `oldValues`,
  `newValues`, `changedBy`, `changedByType`, `restaurantId`, `category`,
  `description`, `metadata`, `ipAddress`, `changedAt`.

---

## 3. Contract status vocabulary

Every field, endpoint and rule below carries one of these labels:

| Label | Meaning |
|---|---|
| **EXISTING** | Implemented on `main`; the code is the source of truth. |
| **B1-S TARGET** | Normative target for the separate server implementation task. Not implemented by B1-C. |
| **OWNER DECISION** | Product/rollout choice explicitly left to the owner. B2 must not depend on it until decided. |
| **CONTRACT DECISION** | Technical resolution made in this freeze to remove ambiguity; B1-S implements it. |

---

## 4. Station print mode

### 4.1 Values and meaning

`Station.settings.printMode` is one of:

| Value | Print authority | Paper | Kitchen device required | Counter behaviour |
|---|---|---|---|---|
| `STATION` | Kitchen/Station device | yes, from the station printer | yes when this station receives the order | Counter does not print and must not ack `PRINTED`. |
| `COUNTER` | Counter staff session | yes, directly from the Counter’s LAN printer | **no** | Counter prints and acks. Kitchen may display and sends `SKIPPED` as an **audit-only** signal when it is not the authority; that signal must not change the ticket state. |
| `NONE` | nobody | no paper (KDS only) | **no** | Counter does not print and must not ack. The server records `SKIPPED` at creation; a paired Kitchen device’s `SKIPPED` is audit-only. |

`printMode` is a **station-level** policy, not a device-level setting. It does
not store a printer IP, port, driver or credential. The server never learns the
Counter printer address.

### 4.2 Storage and defaults

**CONTRACT DECISION — JSON, no migration.**

- Store at `Station.settings.printMode`.
- Normalization in `src/lib/station-settings.ts`:
  - missing, null, non-string or unknown value → **`STATION`**;
  - valid values pass through.
- Why `STATION` for missing: every existing station must keep its current
  Kitchen-printing behaviour until an owner explicitly opts in. A default of
  `COUNTER` for existing rows would silently stop Kitchen printing.
- **New onboarding default is `COUNTER`.** `POST /api/stations` and the station
  onboarding path write `settings.printMode = 'COUNTER'` for a newly created
  station unless the request explicitly supplies another value. Existing rows
  are not backfilled.
- `PATCH /api/stations/{id}` accepts `settings.printMode` with the same enum.
  An invalid value is a **400** validation error.
- `GET /api/stations/me/settings` returns `printMode` in the normalized object.
- `GET /api/stations/me/snapshot` returns it in `settings`.
- `GET /api/stations` and `GET /api/stations/{id}` return the stored settings;
  a missing key means `STATION` to every reader.
- No schema migration, no backfill, no seed change is required for storage. A
  future move to a column is a new contract version.

### 4.3 Mid-flight authority

**CONTRACT DECISION — stamp the mode on printable events.**

- B1-S writes the effective `printMode` into the `OrderEvent.payload` of every
  printable event (`order.created`, `order.items.added`, `order.cancelled`) at
  creation time.
- The stamped value is the event’s authority. Changing `Station.settings.printMode`
  later does not move an already-created, unacked ticket between authorities.
- For legacy events with no stamped `printMode`, the current station setting is
  the fallback.
- A mode change affects **new** events only. Unacked legacy events follow the
  current setting until acked; this is the only unavoidable ambiguity and it is
  bounded by the 7-day event retention.
- `printMode` is part of the server-authored payload, not a client-supplied
  request field.

### 4.4 Authority enforcement

**B1-S TARGET.** Both ack endpoints enforce:

| Event’s effective mode | Device ack `success` | Device ack `skipped` | Device ack failure | Counter ack `success` | Counter ack `skipped` | Counter ack failure |
|---|---|---|---|---|---|---|
| `STATION` | allowed | allowed | allowed | **409** | **409** | **409** |
| `COUNTER` | **409** | allowed (Kitchen is not authority) | **409** | allowed | allowed | allowed |
| `NONE` | **409** | allowed | **409** | **409** | **409** | **409** |

- A rejected authority returns **409** `{ success:false, code:'PRINT_AUTHORITY_INVALID', error }`.
- The device may always update its own `lastSeenAt`; authority rejection does not
  change `OrderEvent`.
- `NONE` events may be created with `printStatus='SKIPPED'` by the server
  (§5.1) so a missing Kitchen device does not leave a phantom `PENDING`.
- A Counter `skipped` ack is a deliberate “no paper for this ticket” action. It
  is allowed only under `COUNTER` authority. A skip never downgrades a printed
  ticket: if the ticket is already `PRINTED`, the server accepts the request,
  leaves the status unchanged, and writes a `NO_DOWNGRADE` audit row (§5.2). Do
  not invent a 409 for this race.
- **A device `skipped` ack is authoritative only on `STATION`.** On `COUNTER`
  and `NONE`, the device is not the print authority: the server records the
  attempt and audit row (`result:'SKIPPED'`, source `DEVICE`) but must not change
  `printStatus`, `printedAt` or `printDeviceId`. In particular, a Kitchen
  `SKIPPED` on a `COUNTER` ticket must leave `printStatus` **unchanged**: a
  `PENDING` ticket stays `PENDING` so B2 still prints it, a `FAILED` ticket stays
  `FAILED` for retry, and a `PRINTED` ticket stays terminal. For an order/add-on
  ticket created `PENDING`, `SKIPPED` therefore means “the Counter authority
  chose no paper”, never “the Kitchen declined”. A cancellation chit may be
  created `SKIPPED` by server policy (§5.1).

---

## 5. `OrderEvent.printStatus`

### 5.1 Creation rules

**B1-S TARGET.**

| Event type | Initial `printStatus` | Why |
|---|---|---|
| `order.created` on `STATION` | `PENDING` | Kitchen printer must ack. |
| `order.created` on `COUNTER` | `PENDING` | Counter must print and ack. |
| `order.created` on `NONE` | `SKIPPED` | KDS only; no device is required. `printAttemptedAt=null`, `printError='KDS only — not printed'`, `printDeviceId=null`. |
| `order.items.added` | same rule as `order.created`, per station mode | Add-on tickets follow the same authority. The writer exists but has no producer on `main`; B1-S/B3 must wire add-items before this row is reachable. |
| `order.cancelled` on `STATION` | `PENDING` | Kitchen may print a cancellation chit. |
| `order.cancelled` on `COUNTER` | `SKIPPED` until O-3 decides otherwise | B2 does not auto-print cancellation chits; this avoids a permanently queued ticket. A cashier may still print it manually and ack `PRINTED`. |
| `order.cancelled` on `NONE` | `SKIPPED` | KDS only; no paper. |
| `order.status.changed` | `null` | Not a ticket. |
| `order.item.status.changed` | `null` | Not a ticket. |
| `order.recalled` | `null` | Recall is a display/action, not a new ticket. |
| `order.recall.cleared` | `null` | Not a ticket. |

`printStatus=null` remains valid for legacy rows and non-ticket events. It is
always projected as **`UNKNOWN`**, never `PRINTED`.

### 5.2 Transitions

**B1-S TARGET.** This matrix is written from the **print authority’s** point of
view, with authority checked first (§4.4). “Failure” means `success:false` and
`skipped:false`. The `skipped` column applies only when the caller is the
authority; a device `skipped` ack on `COUNTER`/`NONE` is audit-only and leaves
the status unchanged (§4.4). The `downgraded` response field is Counter-only; the
device ack keeps its existing response shape and records the same outcome in the
audit row.

| Current | `success:true` | failure | `skipped:true` |
|---|---|---|---|
| `null` / `UNKNOWN` | `PRINTED` | `FAILED` | `SKIPPED` |
| `PENDING` | `PRINTED` | `FAILED` | `SKIPPED` |
| `FAILED` | `PRINTED` | `FAILED` (update error/attempt) | `SKIPPED` |
| `SKIPPED` | `PRINTED` | `FAILED` (a real print was attempted) | `SKIPPED` |
| `PRINTED` | `PRINTED` (idempotent; `printedAt` unchanged) | `PRINTED` (status stays; error/attempt recorded) | `PRINTED` (status stays) |

Rules:

1. **`PRINTED` is terminal for status.** It never becomes `FAILED` or `SKIPPED`.
   A later failed reprint may record `printError` and `printAttemptedAt`, but
   `printStatus` and `printedAt` stay `PRINTED`/the first print time.
2. **`printedAt` is the first successful print time.** A reprint does not move
   it. The reprint attempt is recorded in `printAttemptedAt`, `printError` and
   the audit row.
3. `SKIPPED` → `PRINTED` is allowed for a ticket whose stamped mode is
   `COUNTER` or `STATION`: a cashier may have skipped a Counter ticket and then
   printed it, or a Kitchen ticket may be printed after a delayed start. A
   stamped `NONE` ticket is **permanently unprintable in `phase-b-print-v1`**
   because neither ack endpoint may set `PRINTED` under `NONE` authority;
   changing the station setting does not move an existing stamped ticket
   (§4.3). If a `NONE` ticket must become paper later, that is a new contract.
4. A no-downgrade attempt is **not an error**. The Counter response is 200 with
   the unchanged status and `downgraded:false`; the device response keeps its
   existing shape. Both write an audit row with `result:'NO_DOWNGRADE'`. This
   keeps retries idempotent and makes the physical attempt visible.
5. `printStatus` is never cleared by an ack.
6. `printDeviceId` identifies the device that made the last **authoritative**
   ack that changed the ticket. A Counter ack sets it to `null` (the audit row
   keeps the prior value); an audit-only device skip does not update it.
   `printedBy` is the last authoritative ack source (`DEVICE` when the last
   authoritative ack came from a device, `COUNTER` when it came from the
   Counter), not necessarily the source of the first paper. `printedAt` remains
   the first successful print time.

### 5.3 Who sets it

| Writer | May set |
|---|---|
| `recordOrderCreated()` / `recordOrderItemsAdded()` / cancellation writer | initial `PENDING` or `SKIPPED` per §5.1 |
| `POST /api/stations/me/print-ack` | `PRINTED`/`FAILED` within §5.2 and §4.4; `SKIPPED` only under `STATION` authority (audit-only on `COUNTER`/`NONE`) |
| `POST /api/counter/orders/{orderId}/print-ack` | `PRINTED`/`FAILED`/`SKIPPED` within §5.2 and §4.4, `COUNTER` authority only |
| Any other code | must not set `printStatus` |

### 5.4 Aggregate projection

**EXISTING, unchanged in B1-S.** `aggregateTicketStatus()` in
`src/lib/counter/ticket-status.ts` aggregates `order.created` and
`order.items.added` only:

| Condition | Aggregate |
|---|---|
| no tickets | `NOT_ROUTED` |
| any `FAILED` | `FAILED` |
| all `PRINTED` | `PRINTED` |
| all `PRINTED` or `SKIPPED`, at least one `PRINTED` | `PARTIAL` |
| all `SKIPPED` | `SKIPPED` |
| any `PRINTED` (mixed with pending/unknown) | `PARTIAL` |
| any `PENDING` | `QUEUED` |
| otherwise (all null) | `UNKNOWN` |

- `printedAt` is the latest non-null `printedAt` among the tickets.
- A cancellation chit is **not** part of this aggregate. The existing Counter
  ticket-status response and UI keep their current meaning.
- `SKIPPED` is not a printer failure. `FAILED` is louder than `SKIPPED`.

### 5.5 Display rules

- `UNKNOWN` is displayed as “Unknown — not confirmed”, never “Printed”.
- `QUEUED` is “Queued” or “Printing”.
- `PRINTED` is “Printed” with `printedAt`.
- `FAILED` is “Print failed”, with the stored error.
- `SKIPPED` is “No paper (KDS)” or “Skipped”, not an error.
- `PARTIAL` is “Partially printed”.
- A device `lastPrintAt` is **presence/health evidence**, not proof that a
  specific ticket printed. The Counter must not project device `lastPrintAt` as
  a ticket’s `PRINTED` state.

---

## 6. Counter ticket-payload endpoint

### 6.1 Route and auth

**B1-S TARGET.**

```text
GET /api/counter/orders/{orderId}/print-tickets
```

- Staff authentication: Bearer access token or the existing web session.
- `counterAccessDenied()`: owner, manager or cashier only (same gate as the rest
  of `/api/counter`).
- Permission: `orders:read`.
- `requireOrderAccess(orderId, context)`: tenant-scoped. A cross-tenant or
  missing order returns **404**, not 403. The existing helper throws **403**
  `FORBIDDEN` for a staff user in another restaurant
  (`src/lib/rbac/resource-auth.ts`); B1-S must wrap/map that case to 404 on
  these two routes so the error table is implementable as written.
- Read-only. No side effects, no event creation, no ack.
- Safe to retry and poll. B2 may call it after confirmation and after a local
  print failure.

### 6.2 Response

```json
{
  "success": true,
  "orderId": "ord_123",
  "serverTime": "2026-11-17T10:00:00.000Z",
  "tickets": [
    {
      "eventId": "40218",
      "orderId": "ord_123",
      "stationId": "st_1",
      "stationName": "Kitchen",
      "printMode": "COUNTER",
      "type": "order.created",
      "payload": {
        "orderNumber": "A-0142",
        "counterReference": null,
        "dailySeq": 142,
        "clientOrderId": null,
        "paperChitPrinted": false,
        "tableName": "T7",
        "orderType": "DINE_IN",
        "pickupNumber": null,
        "customerName": null,
        "fulfillmentLabel": "T7",
        "orderNote": null,
        "items": [
          {
            "itemId": "oi_1",
            "name": "Penne Arrabbiata",
            "qty": 1,
            "modifiers": [],
            "notes": null
          }
        ],
        "stationSubtotal": "19.99",
        "fallback": false,
        "printMode": "COUNTER"
      },
      "printStatus": "PENDING",
      "printAttemptedAt": null,
      "printedAt": null,
      "printError": null,
      "printedBy": null,
      "canAck": true
    }
  ]
}
```

Field rules:

| Field | Rule |
|---|---|
| `eventId` | `OrderEvent.id` as a **string** (BigInt on the wire as a string). |
| `orderId` | The requested order. |
| `stationId`, `stationName` | From the event/station. |
| `printMode` | Effective mode: stamped payload value, else current station setting, else `STATION`. |
| `type` | One of the printable types in §6.3. |
| `payload` | The server-authored `OrderEvent.payload`, verbatim. The Counter must not rebuild it from the order. |
| `printStatus` | `PENDING` / `PRINTED` / `FAILED` / `SKIPPED` / `UNKNOWN` (null → `UNKNOWN`). |
| `printAttemptedAt`, `printedAt` | ISO-8601 UTC or null. |
| `printError` | Stored string or null. |
| `printedBy` | The **last ack source**: `DEVICE` when `printDeviceId` is non-null; `COUNTER` when status is `PRINTED` and `printDeviceId` is null; otherwise null. Derived, not stored. It can differ from the first-print source after a reprint; `printedAt` still identifies the first print. |
| `canAck` | `true` only when the effective mode is `COUNTER`; false for `STATION`/`NONE`. |
| `tickets` | Ordered by `eventId` ascending. Empty array is a valid 200 when the order has no printable events. |

- The endpoint returns **only** printable events. Non-ticket events
  (`order.status.changed`, `order.item.status.changed`, `order.recalled`,
  `order.recall.cleared`) are not included.
- The payload may contain the order contact name, table label, item names,
  modifiers and notes, exactly as the existing `OrderEvent.payload` does. It
  must **not** contain a phone number, payment data, or a printer address.
- No `orderVersion` field is added; B2 must not require one.

### 6.3 Printable types

`order.created`, `order.items.added`, `order.cancelled`.

B2 auto-prints only `order.created` and `order.items.added`. The cancellation
chit is exposed by the payload endpoint but is **not** auto-printed in B2
(§8.4). A future B3 decision may enable it.

`order.items.added` has a writer but no producer on `main`; B1-S/B3 must wire
the add-items path before add-on tickets appear. The endpoint contract is
defined now so the client does not need a second contract when that producer
lands.

### 6.4 Errors

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Invalid `orderId` shape or invalid query. |
| 401 | — | No/invalid staff session. |
| 403 | `COUNTER_ROLE_NOT_ALLOWED` / `PASSWORD_CHANGE_REQUIRED` / `PERMISSION_DENIED` | Counter access gate or missing `orders:read`. |
| 404 | `ORDER_NOT_FOUND` | Missing order or different tenant. |
| 500 | — | Unexpected failure. |

The endpoint must not return 404 merely because `tickets` is empty.

---

## 7. Counter print-ack endpoint

### 7.1 Route and auth

**B1-S TARGET.**

```text
POST /api/counter/orders/{orderId}/print-ack
```

- Staff authentication and `counterAccessDenied()` as in §6.1.
- Permission: `orders:write` (cashier has it today).
- Tenant-scoped by `requireOrderAccess()`; cross-tenant = **404** (B1-S maps
  the helper’s current 403 for this case, as in §6.1).
- The event must belong to `{orderId}` **and** to the caller’s restaurant.
  A mismatch is 404, not a silent no-op.

### 7.2 Request

```json
{
  "eventId": "40218",
  "stationId": "st_1",
  "success": true,
  "skipped": false,
  "error": null,
  "reprint": false
}
```

| Field | Required | Rule |
|---|---|---|
| `eventId` | yes | `OrderEvent.id` as a positive integer string or number. Must be a printable event on this order. |
| `stationId` | no | If present, must equal the event’s `stationId`; mismatch → **409** `STATION_MISMATCH`. The server always derives the station from the event. |
| `success` | yes | Boolean. `true` means the Counter completed the print job. |
| `skipped` | no | Boolean. Only valid with `success:false`. `success:true` + `skipped:true` → **400** `INVALID_ACK`. |
| `error` | no | String, trimmed, max 500 characters. Stored as `printError`; never logged with secrets. |
| `reprint` | no | Boolean. `true` marks a manual reprint/retry for audit. It does not reset `printedAt`. |

`eventId` is the idempotency key. No separate `Idempotency-Key` header is
required: the event id plus the requested result is the natural key, and repeated
acks converge on §5.2. A caller may send the same body repeatedly; it must not
create a second ticket or move `printedAt`.

### 7.3 Result

The server:

1. resolves the order, tenant and event;
2. checks the event is printable;
3. resolves the event’s effective `printMode`;
4. enforces the authority matrix (§4.4);
5. applies the transition matrix (§5.2);
6. writes the `OrderEvent` update and the audit row **in one transaction**;
7. returns the updated ticket projection.

Response:

```json
{
  "success": true,
  "orderId": "ord_123",
  "ticket": {
    "eventId": "40218",
    "stationId": "st_1",
    "stationName": "Kitchen",
    "printMode": "COUNTER",
    "type": "order.created",
    "printStatus": "PRINTED",
    "printAttemptedAt": "2026-11-17T10:00:05.000Z",
    "printedAt": "2026-11-17T10:00:05.000Z",
    "printError": null,
    "printedBy": "COUNTER",
    "canAck": true
  },
  "reprint": false,
  "downgraded": false,
  "replayed": false,
  "serverTime": "2026-11-17T10:00:05.000Z"
}
```

- `replayed:true` when the same effective state already existed (idempotent
  repeat).
- `downgraded:false` when a printed ticket refused a failure/skip; the response
  is still 200.
- `reprint:true` when the request was a reprint of an already-printed ticket.
- The response never includes the payload; the caller already has it or can read
  it again.

### 7.4 Audit

**B1-S TARGET.** Every ack writes an `AuditLog` row in the same transaction as
the event update:

| Column | Value |
|---|---|
| `tableName` | `'order_events'` |
| `recordId` | `eventId` |
| `operation` | `'UPDATE'` |
| `restaurantId` | Event’s restaurant. |
| `changedBy` | Staff `userId` for Counter; `device.id` for a device ack. |
| `changedByType` | `'staff'`, `'restaurant_owner'` or `'device'`. |
| `category` | `'orders'` |
| `description` | `'print.ack'` or `'print.reprint'`. |
| `oldValues` | `{ printStatus, printedAt, printError, printDeviceId }` before the ack (so a Counter ack that nulls `printDeviceId` does not lose the prior device). |
| `newValues` | `{ printStatus, printedAt, printError, printDeviceId, reprint, stationId, eventType }` after the ack. |
| `metadata` | `{ orderId, stationId, eventType, source:'COUNTER'|'DEVICE', result:'PRINTED'|'FAILED'|'SKIPPED'|'NO_DOWNGRADE' }`. |
| `ipAddress` | `trustedIp(request)`; use the existing `'unknown'` sentinel when no address is available; never a raw `x-forwarded-for` header. |
| `userAgent` | Optional; if present, existing request header, no secrets. |

Rules:

- Never store the ticket payload, item text, customer name/phone or printer
  address in the audit row.
- A device ack gets an audit row too, so “print ack” is complete across both
  authorities. The event row remains the primary state; the audit row is the
  trail.
- An audit write failure fails the request (500). A retry is safe because the
  event id is the idempotency key; a second audit row is preferable to a silent
  print.
- The audit row is written for no-downgrade attempts as well, with
  `result:'NO_DOWNGRADE'`.

### 7.5 Errors

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Bad `eventId`, bad types, `success:true` + `skipped:true`, error too long. |
| 401 | — | No/invalid staff session. |
| 403 | `COUNTER_ROLE_NOT_ALLOWED` / `PASSWORD_CHANGE_REQUIRED` / `PERMISSION_DENIED` | Counter gate or missing `orders:write`. |
| 404 | `ORDER_NOT_FOUND` / `TICKET_NOT_FOUND` | Order/tenant mismatch, event missing, event not on this order. |
| 409 | `PRINT_AUTHORITY_INVALID` | The effective mode is not `COUNTER`. |
| 409 | `STATION_MISMATCH` | Supplied `stationId` differs from the event’s station. |
| 500 | — | Unexpected failure, including audit failure. |

A no-downgrade attempt is **not** a 409. It returns 200 with
`downgraded:false`.

### 7.6 What an ack proves

An ack proves that the client reported a completed local print operation for a
specific `OrderEvent`. It does **not** prove:

- that paper physically exists, is legible, cut, or has toner;
- that the printer was the intended physical device;
- that a duplicate did not also print;
- that the order is paid, ready or served.

The server treats print state as **observability**, not a financial or order-state
gate. A missing ack leaves `PENDING`/`UNKNOWN`; it must never block
confirmation, payment, READY or SERVED.

---

## 8. Phase B auto-print semantics (B2)

### 8.1 What becomes printable

**B2 scope:** a **Counter-created** order (`Order.source='COUNTER'`) becomes
printable when it is confirmed and the server writes `order.created` events.
This happens through:

- `POST /api/counter/orders` (auto-confirm when `sendToKitchen !== false`),
- `POST /api/counter/orders/{orderId}/send` (retry after an offline save),
- `PATCH /api/orders/{id}/status` with `CONFIRMED` (owner/manager path).

B2 does **not** auto-print QR or other-source orders. B3 adds those.

### 8.2 Trigger and flow

There is no server-side push of a print job. The server-authored event log is
the source of truth.

```text
Counter creates/confirms order
  → server writes OrderEvent per station (payload + stamped printMode)
  → Counter calls GET /api/counter/orders/{id}/print-tickets
  → Counter filters printMode=COUNTER, type in {order.created, order.items.added},
    printStatus in {PENDING, FAILED}, not already PRINTED
  → Counter writes the ticket to its local durable queue (keyed by eventId)
  → Counter prints directly over LAN (no server, no Kitchen)
  → Counter POSTs /print-ack with eventId + success/skipped/error
  → server updates OrderEvent + audit
  → Counter refreshes/renders PRINTED/FAILED/SKIPPED
```

Rules:

- The Counter must not print before the server has confirmed the order and
  returned events. Printing a local draft can duplicate a ticket or print an
  order that never reached the Kitchen.
- The local queue is durable across process death and restart. A restart
  re-fetches the order’s tickets and resumes `PENDING`/`FAILED`.
- The Counter dedupes by `eventId`. It must not print the same `eventId` twice
  merely because the list endpoint was polled again.
- A Kitchen `SKIPPED` on a `COUNTER` ticket is audit-only and leaves the ticket
  `PENDING` (§4.4). It therefore does not remove the ticket from this filter and
  does not cause silent non-printing.
- The Counter must not build the ticket from local order state; it prints the
  server `payload`.
- No printer IP, port, driver or credential is sent to the server.

### 8.3 Delivery guarantees

- **At-least-once**, not exactly-once. A crash between “paper printed” and “ack
  accepted” can produce a duplicate on restart. That is acceptable and visible;
  it is not silent loss. The manual reprint path is the same mechanism with
  `reprint:true`.
- A server ack is idempotent by `eventId`. Repeating a success does not create a
  second event or move `printedAt`.
- The Counter retries transient network failures with bounded backoff. It does
  not retry a 4xx validation/authority error; it surfaces it.
- The server never retries printing. A failed ticket stays `FAILED` until the
  Counter or a human retries.
- A ticket is never removed from the server because the Counter printed it. The
  7-day event retention still applies.

### 8.4 Cancellation and add-on tickets

- Add-on tickets (`order.items.added`) use the same authority and ack rules. B2
  may auto-print them for Counter-created orders once B1-S/B3 wires an add-items
  producer; on `main` the writer has no caller.
- Cancellation chits (`order.cancelled`) are exposed by the payload endpoint and
  accepted by both ack endpoints, but B2 does **not** auto-print them. A
  `COUNTER` cancellation chit is created `SKIPPED` (§5.1), so it does not render
  as a permanently “Printing” ticket. A cashier may still print it manually and
  ack `PRINTED`. Whether B2 or B3 auto-prints cancellation chits is an **OWNER
  DECISION** (O-3).

### 8.5 READY / SERVED and the Kitchen KDS

- Printing and order status are independent. A print failure does not block
  PREPARING/READY/SERVED; a status change does not reprint.
- The Kitchen remains a display/status client. For `COUNTER` / `NONE`, no Kitchen
  device is required for the order to be confirmed, prepared or served.
- For `STATION`, the Kitchen remains the print authority and its existing KDS
  behaviour is unchanged.

### 8.6 Manual reprint

- A manual reprint is a Counter ack with `reprint:true`.
- If the ticket is already `PRINTED`, `printedAt` stays the first print time;
  `printAttemptedAt` moves to the reprint time; the audit row is
  `print.reprint`.
- If the ticket is not printed, `reprint:true` is still accepted and follows
  §5.2; the audit still records the attempt, but the description is
  `print.ack` when no prior `printedAt` existed.
- A reprint is distinguishable from an initial print in the audit trail. The
  Counter must label it in its UI.

---

## 9. Cashier status authority and the no-Kitchen rule

### 9.1 Cashier PREPARING / READY / SERVED

**B1-S TARGET.** The cashier may mark an order `PREPARING`, `READY` or `SERVED`
through `PATCH /api/orders/{id}/status` only when **all** of these are true:

1. `Order.source = 'COUNTER'` (B2 scope);
2. the order has at least one routed station, and every routed station has
   effective `printMode` `COUNTER` or `NONE` (no `STATION` ticket exists for it).
   For an order that already has printable events, use each event’s stamped
   mode; for a not-yet-confirmed order, use the routing result and the current
   station settings;
3. the normal transition is valid (`PENDING → PREPARING` is still rejected;
   `CONFIRMED → PREPARING → READY → SERVED`);
4. takeaway `SERVED` still requires `paymentStatus='PAID'`;
5. the order is not under an active Kitchen recall for `SERVED`
   (`ORDER_RECALLED` remains).

The cashier may **not**:

- `CONFIRMED` (owner/manager only; Counter creation auto-confirms);
- `CANCELLED` (owner/manager only);
- set statuses on a `STATION` order while the Kitchen is the authority;
- change settings, payment provider, taxes, menu or station configuration.

**Permission mechanism (CONTRACT DECISION):** add `orders:counter_serve` as the
durable permission and grant it to the `cashier` role template in the seed.
Because the seed is **not run** in this task and existing installations may not
have the new row, the route also treats `roleTemplate === 'cashier'` as
sufficient until the permission row exists. This is a compatibility fallback,
not a second permission model. Do not grant `orders:kitchen`, `orders:fulfill`
or `settings:*` to cashier as a shortcut.

**Audit (B1-S TARGET):** every cashier status change writes an `AuditLog` row:

```json
{
  "tableName": "orders",
  "recordId": "<orderId>",
  "restaurantId": "<restaurantId>",
  "operation": "UPDATE",
  "oldValues": { "status": "PREPARING" },
  "newValues": {
    "status": "READY",
    "authority": "COUNTER_NO_KITCHEN",
    "roleTemplate": "cashier"
  },
  "category": "orders",
  "description": "order.status",
  "changedBy": "<staffId>",
  "changedByType": "staff",
  "ipAddress": "<trustedIp>"
}
```

No customer PII, payment data or ticket payload in the audit row. The existing
status audit row remains for owner/manager/Kitchen; B1-S adds
`changedByType`/`category` and the authority marker where they are missing.

### 9.2 No-Kitchen-device confirmation rule

**B1-S TARGET.** `confirmPendingOrder()` changes its station guard from “any
online device” to:

1. Resolve the order’s routed stations using the same routing as
   `recordOrderCreated()` (category mapping, else the default station).
2. If at least one routed station has effective `printMode = STATION`, require at
   least one active device whose station is one of those `STATION` stations and
   whose `lastSeenAt` is inside the 90-second window. If none, return the
   existing **409** `STATION_OFFLINE`.
3. If every routed station is `COUNTER` or `NONE`, skip the online-device guard.
4. If the order routes to no station (no active default and no mapping), keep
   the existing any-online-device guard; an unrouted order is a configuration
   warning, not a no-Kitchen success. The manager override and offline-delivery
   paths keep their current semantics.
5. `offlineDelivered` and manager-only `X-Station-Override: true` keep their
   current bypass semantics. A cashier cannot override.
6. The confirmation audit row records `printAuthority` (`STATION`/`COUNTER`/
   `NONE`), the routed station ids, and `noKitchenDevice: true` when the guard
   was skipped. No PII.

Mixed orders:

- A mixed order with a `STATION` ticket and a `COUNTER` ticket still requires the
  Kitchen device. The Counter may print its own ticket, but confirmation waits
  for the Kitchen authority. A manager override is the only bypass.
- A mixed order with only `COUNTER` / `NONE` tickets requires no device.

### 9.3 Order status and print state are independent

- `PATCH /api/orders/{id}/status` never requires `printStatus=PRINTED`.
- A `FAILED` print does not prevent `PREPARING`, `READY` or `SERVED`.
- A `SKIPPED` ticket does not count as a printer failure and does not block
  service.
- The Counter should show a visible print warning, but the cashier can continue.

---

## 10. Station device ack and SSE — target rules

### 10.1 Device ack

**EXISTING** behaviour in §2.1 remains, with these **B1-S TARGET** changes:

- enforce the authority matrix (§4.4);
- on `COUNTER`/`NONE`, record a device `SKIPPED` as an audit-only signal and do
  not change `printStatus`, `printedAt` or `printDeviceId` (C-13);
- write an audit row (§7.4) for every event-level ack;
- support `reprint` optionally (same semantics as §8.6) so a Kitchen reprint is
  distinguishable; if omitted, behave as today;
- keep `success`/`skipped` precedence and the optional `seq` compatibility;
- keep the 404 `UNKNOWN_TICKET_EVENT` shape for unknown/mismatched/non-printable
  events, except authority errors, which are 409.

Legacy clients that omit `seq` keep working, but the ack is **advisory only**:
it updates `Device.lastPrintAt` and cannot prove a ticket printed. The Counter
must not use it as ticket evidence.

### 10.2 Station SSE

**EXISTING** behaviour in §2.2 remains unchanged. B1-S does not add a staff SSE,
does not change the frame shape, and does not add `orderVersion`.

Required client rules (documented for B2/B3 and the Kitchen):

1. Render the snapshot first; connect the stream with the snapshot `cursor`.
2. Use `?since=<cursor>` or `Last-Event-ID`; do not invent a cursor from wall
   time.
3. Treat `id` as the sequence; dedupe by `seq`.
4. On **410 `CURSOR_EXPIRED`**, reconnect only after a full snapshot.
5. After a long offline period, or if the client cannot prove continuity, take a
   fresh snapshot instead of replaying guesses.
6. Reconnect with bounded backoff; `retry: 3000` is a hint.
7. Treat `: ping` as liveness, not data.
8. A gap in per-station `seq` is normal; only a gap relative to the client’s own
   last seen `seq` plus a snapshot failure is loss.

### 10.3 Snapshot

**EXISTING** `/api/stations/me/snapshot` remains the full-resync endpoint. B1-S
adds `printMode` to its `settings` object and otherwise leaves the shape and
transaction semantics unchanged.

---

## 11. Compatibility, rollout and rollback

### 11.1 Additive by default

- New endpoints, fields and `settings.printMode` are additive.
- No path version bump. `phase-b-print-v1` is the contract version.
- Existing clients that ignore the new fields keep working.
- The existing `GET /api/counter/orders/{orderId}/ticket` status response is
  unchanged. The new payload endpoint is separate.
- The existing station SSE frame is unchanged. Do not add `orderVersion`.
- The existing device ack remains valid for old builds, except that a
  misconfigured `COUNTER`/`NONE` station sending `success:true` now receives
  409. That is the intended authority enforcement; old clients must not print
  when they are not the authority.

### 11.2 Old-client matrix

| Client | Behaviour | Compatibility rule |
|---|---|---|
| Kitchen/Station build without `seq` | Acks update only `lastPrintAt` | Accepted; advisory only; no ticket evidence. |
| Kitchen/Station build that sends `success:true` on a `COUNTER`/`NONE` station | 409 `PRINT_AUTHORITY_INVALID` | Upgrade the Kitchen build, or set the station to `STATION`. The display feed still works. |
| Counter build without print endpoints | No auto-print, no ack | Unaffected; tickets stay `PENDING`/`SKIPPED` per mode. |
| Counter build with B2 | Prints Counter-created orders, acks | Requires this contract and B1-S server. |
| Existing station with no `printMode` | Effective `STATION` | No behaviour change. |
| New station | `COUNTER` default | Owner must have a Counter printer; the Counter can still choose not to print. |

### 11.3 Rollout order

1. B1-C: freeze this contract (docs-only).
2. B1-S: server implementation, tests, review, merge.
3. Verify server: station device ack/SSE regression, Counter payload/ack,
   no-Kitchen confirm, cashier status, audit.
4. **B0 must be closed** (TAB-009 restaurant scoping + TAB-006 retention/read
   cleanup) before B2 starts.
5. B2: Counter auto-print for Counter-created orders, ack, visible state,
   READY/SERVED when Kitchen is absent.
6. B3: QR/all orders and the Counter order feed, with a separate contract
   amendment.

Server first, then Counter. Kitchen is optional and remains on device pairing.

### 11.4 Rollback

- **Primary rollback:** set the affected station’s `printMode` to `STATION`
  (or remove the key) and stop the Counter auto-print feature. The server
  endpoints are additive and inert when unused.
- **No schema rollback:** `printMode` is JSON; no migration exists. Do not run a
  down migration.
- **In-flight tickets:** unacked `PENDING` tickets keep their stamped authority.
  A `COUNTER` ticket that was never printed remains `PENDING` (or `SKIPPED` if
  the cashier deliberately skipped it); switching the station to `STATION` does
  not move it. The owner can reprint manually or let the 7-day retention expire
  it.
- **Counter rollback:** disable the local auto-print/queue and keep manual print.
  Do not delete the server event log.
- **Server rollback:** previous deployment. No new env flag, key or database
  migration is involved.
- **Do not** use loyalty flags, HMAC keys or seed changes as part of a Phase B
  rollback.

### 11.5 Feature flag and deployment

- `printMode` is the only switch; there is no new environment variable.
- B2 may ship behind a local Counter feature toggle for staged rollout; the
  server contract is the same either way.
- Railway auto-deploys `main` on merge. A docs-only B1-C commit does not change
  runtime behaviour. Do not deploy manually, do not set loyalty flags, do not
  set the HMAC key, and do not run the seed as part of B1-C.

---

## 12. Security, privacy and tenant isolation

- **Staff auth, not device auth, for Counter endpoints.** The Counter is not
  provisioned as a station device. Do not reuse `POST /api/stations/me/print-ack`
  for the Counter.
- **Tenant scoping.** Every Counter endpoint checks `requireOrderAccess()` and
  the event’s `restaurantId`. Cross-tenant = 404 (B1-S maps the helper’s current
  403; §6.1). The device ack checks `event.stationId === device.stationId`; the
  tenant follows from `Device.stationId → Station.restaurantId`. B1-S adds an
  explicit event-restaurant check as defence in depth.
- **No printer secrets.** The server never stores a printer IP, port, model
  credential, Wi-Fi password or raw printer payload beyond the existing ticket
  document.
- **PII.** `OrderEvent.payload` already contains the order contact name, table
  label, item names and notes. Do not add phone, email, payment or member data.
  Audit rows must not contain payload, names, phone, receipt data or printer
  addresses.
- **Error strings.** `error` is client-supplied and capped at 500 characters.
  It is stored and returned; it must not be treated as trusted HTML. Do not log
  secrets.
- **Logs.** Print failures may log event id, station id and a generic code. Do
  not log payloads, customer data, tokens or printer credentials.
- **Audit IP.** Use `trustedIp(request)` (`src/lib/client-ip.ts`), never a raw
  `x-forwarded-for` header.
- **RBAC.** `orders:read` for payload, `orders:write` for ack,
  `orders:counter_serve` (with cashier fallback) for status. Do not widen
  settings/payment permissions.
- **Station settings.** `printMode` is changed with `restaurant:settings`.
  On the seeded templates only `restaurant_owner` has that permission; a
  manager needs a custom grant. It is not changeable by cashier or device.
- **Rate limiting.** No new limiter is required: ack access is event-scoped and
  authenticated. If abuse appears, add a bounded limiter in a later contract.
- **Retention.** `order_events` remains 7 days. `AuditLog` has a
  `cleanupOldLogs(90)` helper in `src/lib/rbac/audit-logger.ts`, but **no
  scheduled audit cleanup exists today**; device-ack audit will grow the table
  until O-5 decides scheduling/retention. Do not extend event retention for
  printing.

---

## 13. Decisions and remaining owner decisions

### 13.1 Approved inputs (do not re-open)

| # | Decision | Choice |
|---|---|---|
| Q1 | Counter/server path | Counter staff ticket-payload + print-ack endpoints; no Counter device provisioning |
| Q2 | First release | B2 Counter-created orders; B3 QR/all orders + feed |
| Q3 | Kitchen absent | No Kitchen device for `COUNTER`/`NONE`; cashier PREPARING/READY/SERVED with audit |
| Q4 | Print mode | `STATION \| COUNTER \| NONE`; existing `STATION`; new onboarding `COUNTER`; Kitchen `SKIPPED` when not authority |
| Q5 | Boundaries | B0 separate; web/role cleanup out; Kitchen device pairing unchanged |
| Q6 | Order | B0 → B1 → B2 → B3; contract frozen before B2 |

### 13.2 Contract decisions taken in this freeze

These are technical resolutions needed to make the approved inputs
implementable. They are part of `phase-b-print-v1`:

| # | Decision | Rationale |
|---|---|---|
| C-1 | `printMode` in `Station.settings` JSON, missing → `STATION`, new onboarding → `COUNTER` | Migration-free; preserves existing Kitchen printing. |
| C-2 | Stamp `printMode` into printable `OrderEvent.payload` at creation | A mode change must not move an unacked ticket between authorities. |
| C-3 | Counter payload route `/print-tickets`, ack route `/print-ack` | Follows the Phase A Appendix B naming and keeps the existing status route unchanged. |
| C-4 | `eventId` is the ack idempotency key | Natural, event-scoped, no new table or key lifecycle. |
| C-5 | `PRINTED` is terminal for status; `printedAt` is first print | Makes reprints auditable without rewriting history. |
| C-6 | Print ack is advisory for order state | Printing is observability; do not block confirmation, payment, READY or SERVED. |
| C-7 | `NONE` events are created `SKIPPED` | No phantom queued print and no Kitchen device dependency. |
| C-8 | Cashier authority is limited to Counter-created orders whose routed stations are all `COUNTER`/`NONE` | Matches Q2/Q3 and prevents cashier takeover of Kitchen orders. |
| C-9 | `orders:counter_serve` permission plus cashier role fallback | Works before the seed row exists; gives a durable permission for custom roles. |
| C-10 | Audit both device and Counter acks in `AuditLog` | The handoff requires print acks in the audit trail, not only Counter acks. |
| C-11 | B2 does not auto-print cancellation chits | Keeps B2 to initial/add-on tickets; cancellation is a B3 product decision. |
| C-12 | No Counter order SSE in B1 | B2 only reacts to orders it creates; B3 owns the feed. |
| C-13 | A non-authority device `SKIPPED` is audit-only and never changes ticket state | On `COUNTER`/`NONE`, the Kitchen is not the print authority; a state-changing skip would hide the ticket from B2 or misstate the Counter’s decision. |

### 13.3 Remaining owner decisions

These are **not silently resolved** and are reported to the owner at freeze.
They do not change the already-approved B1-C surface; they block the named
downstream step if not decided.

| # | Decision | Recommended answer | Blocks | Impact if deferred |
|---|---|---|---|---|
| O-1 | Approve `phase-b-print-v1` as frozen | Approve | B1-S | B2 cannot start. |
| O-2 | Cashier authority scope: only Counter-created + all-routed-`COUNTER`/`NONE` (C-8) or all orders | Keep C-8 | B1-S | Wider scope needs a new contract clause and more tests. |
| O-3 | Cancellation chit: print in B2 or B3 | B3 | B2 (paper only) | B2 shows cancellation state without a chit; no data loss. |
| O-4 | `NONE` auto-`SKIPPED` at creation (C-7) vs wait for Kitchen `SKIPPED` | Keep C-7 | B1-S | Without C-7, `NONE` tickets stay `PENDING` when no Kitchen device exists. |
| O-5 | Device-ack audit for every Kitchen ack (C-10) vs Counter-only | Keep C-10 | B1-S | Audit volume grows; retention must be watched. |
| O-6 | New onboarding default `COUNTER` without a printer preflight | Keep Q4 | B2 | A new restaurant may onboard with no Counter printer; the Counter shows `PENDING`/`FAILED` with manual retry, not silent success. |
| O-7 | Web dashboard `printMode` control in B1-S or B2 | B2 (API-only in B1-S) | B2 UI | A `restaurant_owner` can set it via `PATCH /api/stations/{id}` meanwhile; a manager needs a custom `restaurant:settings` grant. |
| O-8 | B3 Counter feed: `/api/counter/changes` + snapshots vs a staff SSE | Decide at B3 | B3 | No B2 impact. |
| O-9 | Push the local freeze commit to `origin/main` (Railway will auto-deploy docs-only) | Owner action | Cross-repo B2 visibility | The commit exists locally; B2 in another session may not see it until pushed. |

---

## 14. Freeze record

| Fact | Value |
|---|---|
| Contract version | `phase-b-print-v1` |
| Freeze date | 2026-11-17 |
| Freeze task | `QR-EAT-PHASE-B-PRINT-CONTRACT` (B1-C), `docs/ai/runs/QR-EAT-PHASE-B-PRINT-CONTRACT/TASK.md` |
| Base commit | `612cde7` (clean `main`; `df40e1d` ancestor) |
| Freeze commit | **`39031bb`** (content commit; hash recorded by the follow-up docs commit). |
| Server behaviour changed | **No** — docs-only. `git diff df40e1d..HEAD -- src prisma scripts` is empty. |
| Schema/migration | None. `Station.settings` JSON only. |
| Seed | Not run. |
| Deploy/flag/key | Not changed. Loyalty stays off; HMAC key unset. |
| Tests | `npm run type-check`, `npm test -- --runInBand`, `npm run build` — results in `RUN_LOG.md`. |
| Independent review | `REVIEW-01.md` — verdict recorded there. |
| Next server task | B1-S, separate R3 TASK implementing this contract. |
| Next client task | B2, Tabtep, after B1-S merge and freeze confirmation. |

### 14.1 How to cite this contract

- Contract: `docs/PRODUCT/PRINT-ACK-CONTRACT.md`, `phase-b-print-v1`.
- Frozen commit: the hash in §14. The follow-up stamp commit may fill only the
  freeze-hash fields and must not alter normative text. Any other change requires
  a version bump and a new freeze.
- Do not implement B2 against a provisional or uncommitted copy.

### 14.2 What is deliberately not frozen

- B3 feed design, QR/all-order auto-print and cancellation-chit policy.
- Phase C per-station printer mapping.
- Any web dashboard redesign or role cleanup.
- Any loyalty, payment, reporting or receipt behaviour.

---

## 15. Traceability

### 15.1 Existing facts

| Contract fact | Code reference |
|---|---|
| Device ack auth, body, transitions, response | `src/app/api/stations/me/print-ack/route.ts` |
| Device token binding, revocation, presence | `src/lib/device-auth.ts` |
| SSE frame, cursor, 410, ping, retention | `src/app/api/events/station/route.ts` |
| 7-day cleanup | `src/app/api/cron/cleanup-events/route.ts`; `cleanupOrderEvents()` in `src/lib/order-events.ts` |
| Snapshot/cursor/full resync | `src/app/api/stations/me/snapshot/route.ts` |
| Counter ticket status only | `src/app/api/counter/orders/[orderId]/ticket/route.ts` |
| Aggregate semantics | `src/lib/counter/ticket-status.ts`; `src/tests/ticket-status.test.ts` |
| `printStatus` enum and fields | `prisma/schema.prisma` (`OrderEventPrintStatus`, `OrderEvent`) |
| Event creation, payload, types | `src/lib/order-events.ts` (`ORDER_EVENT_TYPES`, `recordOrderCreated`, `recordOrderItemsAdded`, `recordOrderStatusChanged`) |
| Confirmation guard | `src/lib/services/order-dispatch-service.ts` (`confirmPendingOrder`) |
| 90-second online window | `src/lib/counter/constants.ts` |
| Status authority and audit | `src/app/api/orders/[id]/status/route.ts` |
| Station settings normalization | `src/lib/station-settings.ts` |
| Station create/update | `src/app/api/stations/route.ts`, `src/app/api/stations/[id]/route.ts` |
| Device settings endpoint | `src/app/api/stations/me/settings/route.ts` |
| Counter access roles | `src/lib/counter/access.ts` |
| Cashier/kitchen role templates | `prisma/seed.ts` |
| Permission constants | `src/lib/rbac/permission-constants.ts` |
| Counter order create/send | `src/app/api/counter/orders/route.ts`, `src/app/api/counter/orders/[orderId]/send/route.ts`, `src/lib/services/counter-order-service.ts` |
| Counter change feed | `src/app/api/counter/changes/route.ts` |
| Station health | `src/app/api/counter/stations/health/route.ts` |
| Audit model | `prisma/schema.prisma` (`AuditLog`) |
| Audit IP resolver | `src/lib/client-ip.ts` |

### 15.2 B1-S implementation requirements

| Requirement | Contract section |
|---|---|
| Add `printMode` normalization and station create/update support | §4.2 |
| Stamp `printMode` on printable event payloads | §4.3 |
| Enforce authority on both ack endpoints | §4.4 |
| Set `SKIPPED` at creation for `NONE` | §5.1 |
| Implement transition/no-downgrade matrix | §5.2 |
| Add `GET /api/counter/orders/{orderId}/print-tickets` | §6 |
| Add `POST /api/counter/orders/{orderId}/print-ack` | §7 |
| Add audit rows for both ack paths | §7.4 |
| Replace the any-online-device guard | §9.2 |
| Add cashier PREPARING/READY/SERVED authority and audit | §9.1 |
| Add `orders:counter_serve` and cashier fallback | §9.1 |
| Add tests for all of the above | §14, B1-S TASK |

### 15.3 No invented fields

Every field in this document is either:

- present in the code reference above; or
- marked **B1-S TARGET** / **CONTRACT DECISION**; or
- marked **OWNER DECISION** in §13.3.

No endpoint, field, event type, status or permission is asserted as existing
without a code reference.

---

## 16. Change control

- This is a frozen contract. A change requires a new version (`phase-b-print-v2`
  or later), a new review, and a new freeze commit.
- Additive fields may be added without a path version only if they are optional
  and do not change the meaning of existing fields.
- Any change to `printStatus` semantics, authority, no-downgrade, audit or
  cashier permission is a contract change, not an implementation detail.
- The QR-Eat repository owns the contract. Do not fork it in `Tabtep-App`.
- If code and this contract disagree on the **target** surface, stop and report
  the exact clause; do not guess.
