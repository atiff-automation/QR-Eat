# B3-C Handoff — Counter feed contract

**Status:** server implementation **verifier PASS**; contract **FROZEN** at
`4bf9d38`; staging gate **PASSED** 2026-11-18; server **DEPLOYED** 2026-11-19
(merge `ab63894`, Railway `27852ccb…` SUCCESS, health UP, migrations applied,
no seed). B3-C may start against the frozen contract.

> **Post-freeze update appended 2026-11-21** — read the
> “Post-freeze update” section at the end before implementing. The contract is
> unchanged, but the server now returns `401`/`404` differently on order routes
> and streams survive database reconnects.

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

---

# Post-freeze update — 2026-11-21

**Read this before starting B3-C.** The contract did **not** change:
`phase-b-counter-feed-v1` is still frozen at `4bf9d38`, with the same endpoints,
types and payloads. What changed is server **reliability and refusal behaviour**
after a set of reliability tasks. A client built only against the original
handoff would still work, but it would handle two things badly: reconnects and
`401`/`404` responses.

## 1. What changed on the server since the freeze

| Task | Merge | Client-visible effect |
|---|---|---|
| AME-015 | `19cb485` | One refresh signal per event per stream; duplicate frames removed |
| AME-016 | `d6fc6ba` | Streams survive a server-side database reconnect; no client reconnect needed |
| AME-018 | with AME-016 | NOTIFY connection lifecycle only; no client effect |
| AME-019 | `54993fe` | Build/CI only; no client effect |
| AME-013 | `df4b6bf` | Server-side isolation harness; no client effect |
| AME-020 | `8487f08` | Cross-tenant and missing orders both `404 ORDER_NOT_FOUND`; anonymous staff stream `401` |
| AME-023 | `2eae635` | Anonymous order requests `401`; `modify` refusals `404` |

Live server: `main` `1cd18d0` (docs), application code `2eae635`, Railway health
UP. All changes are additive to the frozen contract; no payload, type, ticket or
ack semantics changed.

## 2. What the Counter must now expect

1. **The stream is durable.** After the server's database reconnects (a few
   seconds), events resume on the **same open connection**. The client must not
   need to reopen the stream or reload the screen. If a device goes silent after
   a database restart, that is a defect to report — do not paper over it with a
   client-side timer.
2. **Exactly one refresh signal per action per stream.** If two
   `order_items_added` or `order_cancelled` frames arrive for one action, report
   it. Do **not** add debouncing to hide it; that would mask a server defect.
3. **`401 AUTHENTICATION_REQUIRED`** for an anonymous or expired session on order
   routes and on the staff stream. Treat it as "sign in again", never as a
   server failure. Body: `{ "error": "Authentication required", "code":
   "AUTHENTICATION_REQUIRED" }`.
4. **`404 ORDER_NOT_FOUND`** for a foreign-tenant id **and** for an id that does
   not exist. They are deliberately indistinguishable; do not expect `403` for
   order ids, and do not show a different message for the two cases. Body:
   `{ "success": false, "error": "Order not found", "code": "ORDER_NOT_FOUND" }`.
5. **`403` still means a real permission denial** on the same routes (for
   example a staff member without `orders:write`). It no longer means
   "another tenant's order".
6. **`409` business conflicts are unchanged**: `ORDER_VERSION_CONFLICT`,
   `USE_CANCEL_ENDPOINT` (on `PATCH /status` with `CANCELLED`),
   `ORDER_RECALLED` for a served-but-recalled ticket, idempotency conflicts.
7. **`400` validation is unchanged**; a `5xx` is a genuine server failure and
   should be reported with the request id.

## 3. Two-device checklist for B3-C QA

Run on **two physical devices**, same restaurant, two staff logins (cashier and
manager are enough).

| # | Action | Expect |
|---|---|---|
| 1 | Open the Counter order screen on both devices | Two live streams; no errors |
| 2 | Create one order | Exactly one refresh per device; the order appears once |
| 3 | Add one item | Exactly one `order_items_added` refresh per device |
| 4 | Cancel the order | Exactly one `order_cancelled` refresh per device |
| 5 | Restart the server's database (test environment) | Both devices keep their streams; within ~10 s a new order refreshes both **without re-login or reload** |
| 6 | Sign out one device, then trigger an event | That device's stream refuses with `401`; the other device still receives |
| 7 | Open a foreign order id (if a test id is available) | `404 ORDER_NOT_FOUND`, no data, same message as a missing id |

Stop and report if: any action produces two refreshes, a device needs a reload
after the database restart, a `403` appears for a foreign order id, or an
anonymous stream returns `5xx`.

## 4. Evidence to return to QR-Eat

```text
Date / time:
Device models + OS + app version (commit):
Restaurant:
Create:   frames per device = / duplicates?
Add:      frames per device = / duplicates?
Cancel:   frames per device = / duplicates?
DB restart at:
  reconnected? (per device) / frames after restart =
401 check (signed-out device):
404 check (foreign id):
Unexpected behaviour / logs:
```

Record counts, not impressions. Payloads contain no customer data; do not paste
tokens or phone numbers into evidence.

## 5. What not to do

- Do not open a second staff stream or add an SSE `id:` cursor; the changes feed
  remains the recovery path.
- Do not add client retries or debouncing to compensate for duplicates.
- Do not make the UI treat `404` as transient; it means "gone or not yours".
- Do not assume `403` distinguishes tenants.
- Do not change the frozen contract from the client side. If a server behaviour
  looks wrong, return it to QR-Eat rather than adapting around it.

## 6. References

- Frozen contract: `docs/PRODUCT/COUNTER-FEED-CONTRACT.md`
- Pilot gate and production evidence:
  `docs/ai/runs/QR-EAT-PILOT-GATE-STAFF-FEED/PILOT-GATE.md`
- Reliability evidence: `docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/`,
  `QR-EAT-AME-016-SSE-RECONNECT/`
- Refusal-shape evidence: `docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/`,
  `QR-EAT-AME-023-ORDER-REFUSALS/`
- Isolation harness: `docs/ai/runs/QR-EAT-AME-013-TENANT-HARNESS/`
