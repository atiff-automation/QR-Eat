# Before/after leak reproduction — QR-EAT-AME-020-REFUSAL-SHAPE

Both runs used the real route handlers against two synthetic tenants in a
disposable PostgreSQL 16 database. The temporary reproduction spec was deleted
after each run and is not part of the change.

## Before (at `195a96d`, unmodified code)

```text
own GET             200
cross-tenant GET    403 FORBIDDEN
missing GET         404 NOT_FOUND
cross-tenant PATCH  403 FORBIDDEN
missing PATCH       404 NOT_FOUND
cross-tenant ticket 403 FORBIDDEN
missing ticket      404 NOT_FOUND
anonymous SSE       500
```

## After

```json
{
  "ownStatus": 200,
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
  "patchCross": {
    "status": 404,
    "body": {
      "success": false,
      "error": "Order not found",
      "code": "ORDER_NOT_FOUND"
    }
  },
  "patchMissing": {
    "status": 404,
    "body": {
      "success": false,
      "error": "Order not found",
      "code": "ORDER_NOT_FOUND"
    }
  },
  "patchCrossEqualsMissing": true,
  "ticketCross": {
    "status": 404,
    "body": {
      "success": false,
      "error": "Order not found",
      "code": "ORDER_NOT_FOUND"
    }
  },
  "ticketMissing": {
    "status": 404,
    "body": {
      "success": false,
      "error": "Order not found",
      "code": "ORDER_NOT_FOUND"
    }
  },
  "ticketCrossEqualsMissing": true,
  "anonymous": {
    "status": 401,
    "body": {
      "error": "Authentication required",
      "code": "AUTHENTICATION_REQUIRED"
    },
    "auditRows": 1
  }
}
```

The own-tenant read is still `200`, the cross-tenant and missing bodies are
byte-identical, and the anonymous stream is a clean `401` while still writing
one anonymous audit row.
