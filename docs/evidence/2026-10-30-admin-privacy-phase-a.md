# Admin Privacy and Live-Route Stabilization — Phase A

Date: 2026-10-30

## Decisions

- Platform administrators must not view restaurant performance.
- Restaurant performance remains available only inside the restaurant dashboard
  to authorised owners and staff.
- Platform admin keeps restaurant, user, permission and settings management.
- No database or schema changes.

## Removed

- `src/app/admin/analytics` page
- `/api/admin/analytics` platform performance API
- `/api/admin/menu/analytics` unused menu-performance API
- Analytics link from the admin dashboard
- Order count from the platform-admin restaurant list and admin `/api/restaurants`
  response

`/admin/analytics` now redirects to `/admin/dashboard`.

## Fixed

- `/api/admin/users`
- `/api/admin/users/bulk`
- `/api/admin/permissions`
- `/api/admin/role-templates`
- `/api/admin/role-templates/[template]`
- `/api/admin/menu/items` shared with restaurant Menu

The fixes align code with the existing Prisma schema. No database migration was
created.

## Preserved

- Restaurant owner/staff order counts from `/api/restaurants`
- Expenses and `/api/admin/expenses/*`
- Profit & Loss and `/api/admin/reports/profit-loss`
- Staff and menu category routes
- Role analytics/audit APIs and enhanced role-management UI, deferred
- Restaurant Daily Sales, Z Reports and Profit & Loss

## Verification

- TypeScript errors: **213 → 163**
- Full Jest: **388 passed**, 11 skipped
- Production build: **passed**
- `/admin/analytics`: **308 → /admin/dashboard**
- Admin pages still route to login when unauthenticated
- Restaurant Expenses/Reports routes still exist
- No schema changes
- No Counter/APK changes

## Remaining

- Admin audit/role analytics/export routes
- Admin menu bulk/import/export routes
- Enhanced role-management UI components
- RBAC/pubsub and remaining app errors
