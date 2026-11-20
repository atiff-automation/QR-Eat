# S3 audit — table / staff / restaurant access refusals

**Date:** 2026-11-20
**Scope:** read-only. No route in this table was edited by AME-023.
**Source:** `src/app/api/**/route.ts` production call sites at branch
`fix/ame-023-order-refusals` (base `main` `6bca423`), excluding `src/lib`,
tests and `__tests__`.

## Summary

| Helper | Production call sites | Files |
|---|---:|---:|
| `requireTableAccess` | 11 | 11 |
| `requireStaffAccess` | 0 | 0 |
| `requireRestaurantAccess` (resource-auth) | 35 | 23 |

Foreign-vs-missing outcome classes:

| Class | Table | Restaurant |
|---|---:|---:|
| `403` vs `404`, body differs (existence signal) | 6 | 15 |
| `403` vs `500`, body differs (existence signal) | 0 | 12 |
| `500` vs `500`, body identical | 5 | 8 |
| **Total** | **11** | **35** |

> Counts above are call sites, not files.

## `requireTableAccess`

`requireTableAccess` throws `RBACError` `403 FORBIDDEN` for a foreign id and
`404 NOT_FOUND` for a missing id. The HTTP outcome depends on the route catch.

| Route | Method | Foreign id | Missing id | Body differs? | Note |
|---|---|---|---:|---:|---|
| `src/app/api/pos/payment/table/[tableId]/route.ts` | POST | 403 | 404 | Yes | catch maps `RBACError` to `{success:false,error,code}` |
| `src/app/api/counter/orders/route.ts` | POST | 403 | 404 | Yes | same |
| `src/app/api/counter/orders/quote/route.ts` | POST | 403 | 404 | Yes | same |
| `src/app/api/counter/offline/orders/route.ts` | POST | 403 | 404 | Yes | same |
| `src/app/api/counter/payments/route.ts` | POST | 403 | 404 | Yes | same |
| `src/app/api/counter/tables/[tableId]/bill/route.ts` | GET | 403 | 404 | Yes | catch maps `RBACError` |
| `src/app/api/counter/tables/[tableId]/clear/route.ts` | POST | 500 | 500 | No | `RBACError` falls through to the generic 500; no leak but wrong class |
| `src/app/api/tables/[id]/status/route.ts` | PATCH | 500 | 500 | No | generic 500 |
| `src/app/api/tables/[id]/regenerate-qr/route.ts` | POST | 500 | 500 | No | generic 500 |
| `src/app/api/tables/[id]/orders/route.ts` | GET | 500 | 500 | No | generic 500 |
| `src/app/api/tables/[id]/qr-code/route.ts` | GET | 500 | 500 | No | generic 500 |

**Recommendation for AME-024:** normalise the five `403`/`404` pairs to one
`404` body, and map the six generic `500` routes to the same refusal contract.

## `requireStaffAccess`

No production call sites. The helper is exercised only by its definition in
`src/lib/rbac/resource-auth.ts` and no route imports it. Nothing to audit or
change.

## `requireRestaurantAccess`

`requireRestaurantAccess` is called with the caller's current restaurant id
(from `context.restaurantId` or, for `restaurants/[id]`, the path id). It throws
`403 FORBIDDEN` for a foreign restaurant and `404 NOT_FOUND` for a missing one.
"Body differs" below means the two refusals are distinguishable, which is an
existence signal even when neither body contains tenant data.

A separate same-named helper in `src/lib/tenant-context.ts` has no production
call sites and is not part of this audit.

| Route | Method | Foreign id | Missing id | Body differs? | Note |
|---|---|---|---:|---:|---|
| `src/app/api/members/export/route.ts` | GET | 403 | 404 | Yes | `handleMemberRouteError` maps `RBACError` |
| `src/app/api/members/search/route.ts` | POST | 403 | 404 | Yes | same |
| `src/app/api/members/[id]/export/route.ts` | GET | 403 | 404 | Yes | same |
| `src/app/api/members/[id]/route.ts` | GET | 403 | 404 | Yes | same |
| `src/app/api/members/[id]/route.ts` | PATCH | 403 | 404 | Yes | same |
| `src/app/api/members/[id]/route.ts` | DELETE | 403 | 404 | Yes | same |
| `src/app/api/members/[id]/marketing-consent/route.ts` | POST | 403 | 404 | Yes | same |
| `src/app/api/members/[id]/withdraw-consent/route.ts` | POST | 403 | 404 | Yes | same |
| `src/app/api/promotions/route.ts` | GET | 403 | 404 | Yes | `handlePromotionRouteError` maps `RBACError` |
| `src/app/api/promotions/route.ts` | POST | 403 | 404 | Yes | same |
| `src/app/api/promotions/[id]/route.ts` | PATCH | 403 | 404 | Yes | same |
| `src/app/api/promotions/[id]/route.ts` | DELETE | 403 | 404 | Yes | same |
| `src/app/api/reports/loyalty/route.ts` | GET | 403 | 404 | Yes | `RBACError` mapped |
| `src/app/api/settings/restaurant/loyalty/route.ts` | GET | 403 | 404 | Yes | `RBACError` mapped |
| `src/app/api/settings/restaurant/loyalty/route.ts` | PATCH | 403 | 404 | Yes | `RBACError` mapped |
| `src/app/api/settings/restaurant/route.ts` | GET | 403 | 500 | Yes | only `Access denied` → 403; missing falls to 500 |
| `src/app/api/settings/restaurant/route.ts` | PUT | 403 | 500 | Yes | same |
| `src/app/api/settings/restaurant/business-day/route.ts` | PUT | 403 | 500 | Yes | same |
| `src/app/api/settings/restaurant/financial/route.ts` | PUT | 403 | 500 | Yes | same |
| `src/app/api/settings/restaurant/general/route.ts` | PUT | 403 | 500 | Yes | same |
| `src/app/api/settings/restaurant/hours/route.ts` | PUT | 403 | 500 | Yes | same |
| `src/app/api/settings/restaurant/notifications/route.ts` | PUT | 403 | 500 | Yes | same |
| `src/app/api/settings/restaurant/payments/route.ts` | GET | 403 | 500 | Yes | `handlePaymentSettingsError` maps `Access denied` only |
| `src/app/api/settings/restaurant/payments/route.ts` | PUT | 403 | 500 | Yes | same |
| `src/app/api/settings/restaurant/qr-ordering/route.ts` | PATCH | 403 | 500 | Yes | `Access denied` → 403; missing falls to 500 |
| `src/app/api/settings/restaurant/receipt/route.ts` | PUT | 403 | 500 | Yes | same |
| `src/app/api/settings/restaurant/system/route.ts` | PUT | 403 | 500 | Yes | same |
| `src/app/api/restaurants/[id]/route.ts` | GET | 500 | 500 | No | generic 500 |
| `src/app/api/restaurants/[id]/route.ts` | PATCH | 500 | 500 | No | generic 500 |
| `src/app/api/restaurants/[id]/route.ts` | PUT | 500 | 500 | No | generic 500 |
| `src/app/api/restaurants/[id]/route.ts` | DELETE | 500 | 500 | No | generic 500 |
| `src/app/api/restaurants/[id]/profile/route.ts` | GET | 500 | 500 | No | generic 500 |
| `src/app/api/restaurants/[id]/profile/route.ts` | PUT | 500 | 500 | No | generic 500 |
| `src/app/api/restaurants/[id]/hours/route.ts` | GET | 500 | 500 | No | generic 500 |
| `src/app/api/restaurants/[id]/hours/route.ts` | PUT | 500 | 500 | No | generic 500 |

**Totals:** 35 calls. 27 produce a distinguishable body (`403`/`404` or
`403`/`500`); 8 produce an identical generic `500` and reveal nothing but a
wrong status class.

**Recommendation for AME-024:** one shared `404` refusal for every
foreign/missing pair, and a shared `401` for anonymous requests, following the
order-surface pattern. Do not change these routes inside AME-023.

## Follow-up

`AME-024` — table and restaurant refusal-shape normalisation, informed by this
table. Recorded in `docs/ai/BACKLOG.md` by the Lead (not edited here).
