# Revision 2 — `PATCH /api/orders/{id}/status` before/after

Reproduced with the real route handler against the two synthetic tenants in a
fresh disposable PostgreSQL 16 cluster (`migrate deploy`, no seed). The
temporary reproduction spec was deleted after each run and is not part of the
change.

## Before (revision 1 code, status route untouched)

```text
cross-tenant PATCH /status  403 {"error":"Access denied"}
missing       PATCH /status  404 {"error":"Order not found"}
own-tenant    PATCH /status  200, order.status = PREPARING, version = 2
crossEqualsMissing          false
```

The status route scoped manually instead of using `requireOrderAccess`, so a
foreign id was distinguishable from an absent one (REVIEW-01 F-1).

## After

```json
{
  "cross": {
    "status": 404,
    "body": {
      "success": false,
      "error": "Order not found",
      "code": "ORDER_NOT_FOUND"
    }
  },
  "missing": {
    "status": 404,
    "body": {
      "success": false,
      "error": "Order not found",
      "code": "ORDER_NOT_FOUND"
    }
  },
  "crossEqualsMissing": true,
  "own": {
    "status": 200,
    "body": {
      "success": true,
      "order": { "status": "PREPARING", "version": 2 }
    }
  },
  "afterA": { "status": "PREPARING", "version": 2 },
  "bUnchanged": true,
  "afterB": { "status": "CONFIRMED", "version": 1 }
}
```

## Implementation

In `src/app/api/orders/[id]/status/route.ts`, immediately after the existing
missing-order lookup:

```ts
if (!context.isAdmin && currentOrder.restaurantId !== context.restaurantId) {
  return NextResponse.json(ORDER_NOT_FOUND_BODY, { status: 404 });
}
```

- The missing-order branch also returns the shared
  `{ success:false, error:'Order not found', code:'ORDER_NOT_FOUND' }` body, so
  cross-tenant and missing are byte-identical.
- The condition is fail-closed for a different staff/owner current restaurant
  and for a non-admin with no restaurant in context.
- The order-specific `SERVED` recall check was moved from before the order
  lookup to just after the tenant check. A cross-tenant `SERVED` probe now gets
  `404` before the recall query, so it cannot learn another tenant's recall
  state; an own-tenant recalled ticket still returns `409 ORDER_RECALLED`.
- `context.isAdmin` skips the new branch, so the platform-admin mutation path is
  exactly as before (unit-tested as `200`, not `404`).
- Transition/authority rules, the cashier counter-serve rule and the
  `USE_CANCEL_ENDPOINT` `409` were not touched.

## Tests

- `src/tests/order-status-refusal-shape.test.ts`: own 200, cross 404, missing
  404 with identical body, cross-tenant `SERVED` cannot read recall state,
  own-tenant recall still `409 ORDER_RECALLED`, owner mismatch 404, missing
  restaurant context 404, admin still 200, `CANCELLED` still
  `409 USE_CANCEL_ENDPOINT`.
- `src/tests/integration/tenant-isolation.it.ts`: cross-tenant status update is
  exactly `404` with the same body as a missing id, B's order is unchanged, and
  A's manager can move A's own order `CONFIRMED -> PREPARING` (`200`).
