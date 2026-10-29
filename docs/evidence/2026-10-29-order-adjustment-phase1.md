# Order Adjustment Policy — Phase 1

Date: 2026-10-29

## Scope

Backend policy and endpoints only. Counter and website actions intentionally remain
unchanged in this phase; they will be migrated in Phase 2 and Phase 3.

## Policy

| Stage | Payment | Action |
|---|---|---|
| Pending / Confirmed / Preparing / Ready | Any | `CANCEL` |
| Served | Unpaid / Failed | `VOID` |
| Served | Paid | `REFUND` |
| Cancelled | Any | `NONE` |
| Closed business day | Any | `NONE` |

Role rule:

- Pending cancellation: `orders:write` or manager/owner.
- Confirmed and later: manager/owner only.
- Served void/refund: manager/owner only.
- Refund endpoint additionally requires `payments:write`.

## New API behavior

- `DELETE /api/orders/[id]` is now **pre-service cancel only**.
- `POST /api/orders/[id]/void`
  - Served + unpaid/failed payment
  - No refund
  - Sets order to `CANCELLED`
- `POST /api/orders/[id]/refund`
  - Served + paid payment
  - Full refund only
  - Creates a negative payment
  - Sets payment status to `REFUNDED`
  - Keeps order status `SERVED`

All adjustments:

- require a reason
- use optimistic version checking
- use idempotency keys
- create an `OrderModification` record
- write an audit log
- are blocked when the order's business day has an explicit `CLOSED` record

## Code added

- `src/lib/orders/order-adjustment-policy.ts`
- `src/lib/orders/order-business-day.ts`
- `src/lib/orders/order-adjustment-service.ts`
- `src/lib/orders/order-adjustment-http.ts`
- `src/app/api/orders/[id]/void/route.ts`
- `src/app/api/orders/[id]/refund/route.ts`

## Tests

- Policy matrix: 8 cases
- Adjustment service: void, refund, reject served-paid cancel
- Business-day guard: closed and missing-record cases
- Full Jest suite: 388 passed, 11 skipped
- Production build: passed

## Deliberately not changed yet

- Counter `Cancel order` action still calls the old DELETE endpoint.
- Website `CancelOrderModal` still uses the old flow.
- `refund-utils.ts` and `order-modification-utils.ts` still contain legacy
  cancel helpers.
- Partial refunds are not supported.

## Deployment

**Not deployed.** The existing Counter/website still use the old cancel flow.
Deploying this phase alone would make served/paid cancel attempts fail with the
new policy. Phase 2 and Phase 3 must land first.
