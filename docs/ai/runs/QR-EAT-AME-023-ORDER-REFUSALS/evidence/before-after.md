# Before / after reproduction

**Date:** 2026-11-20
**Branch:** `fix/ame-023-order-refusals` (base `main` `6bca423`)
**No deployment was performed during implementation.** The "before" evidence is
the production smoke recorded by AME-020 plus the code path at `6bca423`; the
"after" evidence is the local handler test run on this branch.

## Anonymous order read

### Before

Production smoke from AME-020 (`docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/RUN_LOG.md`,
Release section):

```text
GET https://tabtep.app/api/orders/{uuid} unauthenticated
-> 500 {"error":"Failed to fetch order"}
```

At `6bca423`, `GET /api/orders/[id]` calls `requireAuth(context)`, which throws
`Error('Authentication required')`, but the catch only handled `RBACError`,
`Permission denied` and the generic `500`. Every anonymous request therefore
looked like a server failure.

### After

`npx jest src/tests/order-anonymous-auth.test.ts --runInBand` covers all six
named routes. The exact assertion is:

```json
{ "error": "Authentication required", "code": "AUTHENTICATION_REQUIRED" }
```

with HTTP `401`, before any order lookup. The integration harness also asserts
the exact body against the real handler and confirms the own-tenant read still
returns `200`.

## `PATCH /api/orders/{id}/modify` refusals

### Before

REVIEW-02 `R-03` (AME-020):

```text
foreign id -> 500 {"error":"Failed to modify order"}
missing id -> 500 {"error":"Failed to modify order"}
```

Identical body, so no existence leak, but inconsistent with the
`404 ORDER_NOT_FOUND` contract used by the rest of the order surface. The raw
`requireOrderAccess` `403`/`404` fell through the `modify` catch to the generic
`500`.

### After

`npx jest src/tests/order-modify-refusal-shape.test.ts --runInBand`:

```text
foreign id -> 404 {"success":false,"error":"Order not found","code":"ORDER_NOT_FOUND"}
missing id -> 404 {"success":false,"error":"Order not found","code":"ORDER_NOT_FOUND"}
```

The test also asserts `prisma.$transaction` was not called for either refusal,
so nothing was mutated. The integration harness asserts the two bodies are
equal against a real PostgreSQL database and that tenant B's order version,
status and item quantities are unchanged.
