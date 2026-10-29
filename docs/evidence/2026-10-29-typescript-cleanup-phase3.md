# TypeScript Cleanup — Phase 3 (Next 15 route signatures)

Date: 2026-10-29

## Scope

Dynamic API route handlers whose `params` were still typed as synchronous
objects. Next 15 passes `params` as a Promise.

## Changed routes

- `admin/expenses/[id]`
- `admin/expenses/categories/[id]`
- `admin/role-templates/[template]`
- `admin/staff/[id]`
- `notifications/[id]`
- `pos/payment/[orderId]`
- `tables/[id]`
- `tables/[id]/status`
- `tables/[id]/regenerate-qr`
- `upload/image/[filename]`
- `uploads/[filename]`

Also:

- Removed the extra exported `getImageDimensions` from the upload route module;
  it is now a private helper.
- Updated expense route tests to pass `params` as a Promise.

## Result

- Errors before: **458**
- Errors after: **429**
- Generated `.next/types` errors: **0**
- Test TypeScript errors: **0**
- Full Jest: 388 passed, 11 skipped
- Production build: passed

## Deployment

- `c379e8c8-7925-45d1-af2f-60b710c38ac5`
- `/api/health`: 200
- Owner login: successful
- Dynamic upload route check: 404 as expected

## Remaining error groups

| Area | Errors |
|---|---:|
| Staff analytics route | 120 |
| Admin API | 134 |
| Old dashboard report pages | 79 |
| Other app files | 96 |

## Next cleanup decision

The remaining large groups are mostly legacy/duplicated reporting and admin
surfaces. They need a product decision:

- remove the old staff analytics route, or
- restore/rewrite it, and
- remove or consolidate the old dashboard report pages.

Do not turn on CI type-checking until those decisions are made.
