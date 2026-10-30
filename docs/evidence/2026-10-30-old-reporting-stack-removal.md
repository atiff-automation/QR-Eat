# Old Reporting and Analytics Stack Removal

Date: 2026-10-30

## Decision

Remove the legacy staff analytics/reporting stack, including the old Financial
Report. Keep Daily Sales, Z Reports, Profit & Loss, the Reports hub, Expenses,
and the platform admin portal.

## Removed

### APIs

- `src/app/api/staff/analytics/[restaurantId]/report/route.ts`
- `src/app/api/staff/analytics/[restaurantId]/orders/route.ts`
- `src/app/api/staff/analytics/[restaurantId]/revenue/route.ts`
- `src/app/api/staff/analytics/[restaurantId]/popular-items/route.ts`

### Pages

- `src/app/dashboard/reports/comprehensive`
- `src/app/dashboard/reports/customer`
- `src/app/dashboard/reports/financial`
- `src/app/dashboard/reports/menu`
- `src/app/dashboard/reports/operational`
- `src/app/dashboard/reports/sales`
- `src/app/dashboard/analytics/orders`
- `src/app/dashboard/analytics/popular-items`
- `src/app/dashboard/analytics/revenue`

### Shared code

- `src/lib/hooks/queries/useReports.ts`
- `src/lib/hooks/queries/useAnalytics.ts`
- Unused report and analytics query keys in `src/lib/query-client.ts`
- Removed `/dashboard/analytics` and `/api/staff/analytics` from the
  `validate-token` route permission map.

## Kept

- Daily Sales
- Z Reports
- Profit & Loss
- Reports hub (rewritten)
- Expenses and `/api/admin/expenses/*`
- Platform admin portal and admin APIs
- `analytics:read` permission
- `/api/analytics/dashboard`
- `/api/reports/sales`, `/api/reports/daily/orders`, `/api/reports/z`

## Redirects

Old page URLs return permanent redirects to `/dashboard/reports`:

- `/dashboard/reports/comprehensive`
- `/dashboard/reports/customer`
- `/dashboard/reports/financial`
- `/dashboard/reports/menu`
- `/dashboard/reports/operational`
- `/dashboard/reports/sales`
- `/dashboard/analytics/:path*`

The old API routes are deleted; no API redirects were added.

## Verification

- TypeScript errors: **429 → 213**
- Old stack TypeScript errors removed: **216**
- Full Jest: **388 passed**, 11 skipped
- Production build: **passed**
- Old routes in app route manifest: **0**
- Kept report routes: Reports, Daily Sales, Z Reports, Profit & Loss
- Runtime redirect check: old page URLs return **308** to `/dashboard/reports`
- Expenses routes: unchanged and still present
- No database or schema changes
- No Counter/APK changes

## Remaining TypeScript work

- Admin API: 134 errors
- Admin components: 19 errors
- Other app files: 60 errors

CI type-checking remains disabled until those are resolved.
