# S2 audit — every `requireOrderAccess` caller

Audited by reading each call site after the S1 change. "Cross" = a staff user in
another tenant; "missing" = a random/absent order id. The contract basis is
`docs/PRODUCT/API-CONTRACT.md` §18.20.2 ("Cross-tenant access returns 404, not
403"), `COUNTER-FEED-CONTRACT.md` §3.1/§12, and `PRINT-ACK-CONTRACT.md`
§6.1/§7.1. No documented route deliberately distinguishes a cross-tenant order
from a missing one, so no stop-and-report condition applied.

| Route | Client-visible cross (before) | Client-visible missing (before) | Existence leak? | Action |
|---|---|---|---|---|
| `GET /api/orders/{id}` | `403 FORBIDDEN` | `404 NOT_FOUND` | Yes | Normalised with one local helper → `404 ORDER_NOT_FOUND` |
| `PATCH /api/orders/{id}` | `403 FORBIDDEN` | `404 NOT_FOUND` | Yes | Normalised with the same helper; permission denial remains `403` |
| `POST /api/orders/{id}/items` | `404 ORDER_NOT_FOUND` | `404 ORDER_NOT_FOUND` | No | Already normalised; existing tests verified |
| `DELETE /api/orders/{id}` (cancel/void/refund via `order-adjustment-http`) | `404 ORDER_NOT_FOUND` | `404 ORDER_NOT_FOUND` | No | Already normalised; existing cancel tests verified |
| `PATCH /api/orders/{id}/modify` | `500 {"error":"Failed to modify order"}` | `500 {"error":"Failed to modify order"}` | No | Recorded already safe. `RBACError` falls through to the same generic 500 for both; body is identical. Not changed in this task |
| `POST /api/pos/payment/{orderId}` | `500` with `details` = helper message | `500` with `details` = "Order not found" | **Yes** (different `details`) | Normalised → `404 ORDER_NOT_FOUND` |
| `GET /api/counter/orders/{orderId}/ticket` | `403 FORBIDDEN` | `404 NOT_FOUND` | Yes | Normalised → `404 ORDER_NOT_FOUND` |
| `POST /api/counter/orders/{orderId}/pay` | `403 FORBIDDEN` | `404 NOT_FOUND` | Yes | Normalised → `404 ORDER_NOT_FOUND` |
| `POST /api/counter/orders/{orderId}/send` | `403 FORBIDDEN` | `404 NOT_FOUND` | Yes | Normalised → `404 ORDER_NOT_FOUND` |
| `GET /api/counter/orders/{orderId}/print-tickets` | `404 ORDER_NOT_FOUND` | `404 ORDER_NOT_FOUND` | No | Already normalised; existing tests verified |
| `POST /api/counter/orders/{orderId}/print-ack` | `404 ORDER_NOT_FOUND` | `404 ORDER_NOT_FOUND` | No | Already normalised; existing tests verified |

## Notes

- `requireOrderAccess` itself is unchanged. The 403/404 semantics stay
  available to non-HTTP callers; only the HTTP boundary normalises.
- `POST /api/pos/payment/{orderId}` previously leaked the distinction in the
  `details` field of its generic 500, which is why the audit normalised it even
  though the status was identical.
- `PATCH /api/orders/{id}/modify` returns a generic 500 for both cases today.
  That is not an existence leak, but it is a poorer contract than the other
  order routes; recorded for a possible follow-up rather than broadened here.
- The two counter routes not named in the task's owned-file summary
  (`/pay` and `/send`) were normalised because D3 and the Lead instruction
  require every caller that returned a raw 403 to be fixed; otherwise the leak
  would remain. Only their `requireOrderAccess` catch changed.
- Contract check: no `docs/PRODUCT/**` file documents a distinct cross-tenant
  `403` for these order routes, so no contract edit was needed.
