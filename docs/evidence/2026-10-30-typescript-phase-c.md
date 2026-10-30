# TypeScript Phase C — Full App Cleanup

Date: 2026-10-30

## Result

- TypeScript errors: **60 → 0**
- Full Jest: **388 passed**, 11 skipped
- Production build: **passed**
- No database/schema changes
- No Counter/APK changes

## Fixed

### RBAC

- Added the missing per-user permission cache.
- Corrected `mustChangePassword` boolean handling.
- Matched token generation/refresh calls to the actual JWT service signatures.
- Added missing context guards to the RBAC-protected restaurant API.

### Event system

- Made PostgreSQL notify payloads accept typed event objects instead of requiring
  an index-signature record.
- Aligned event persistence JSON input with Prisma's `InputJsonValue`.

### API routes

- Fixed unknown catch errors in owner/staff/stats routes.
- Removed a non-existent restaurant `deletedAt` update.
- Replaced non-existent `Table.isActive` with `Table.status === 'INACTIVE'`.
- Loosened the sales grouping helper to the fields it actually uses.
- Added the missing authenticated-user guard in staff password reset.

### UI / POS

- Added missing POS types: `CashPaymentFormProps`,
  `PaymentMethodSelectorProps`, and `TableOrdersResponse`.
- Fixed table-order cache invalidation for null table IDs.
- Fixed notification metadata access and clipboard input typing.
- Added the required `numberFormat` when saving system preferences.
- Removed the nonexistent token-expiration method call from the legacy login page.
- Fixed PWA icon purposes.
- Typed notification mutation rollback context.

## Remaining

Phase D only:

- Remove `ignoreBuildErrors` from `next.config.js`
- Enable type-checking in CI
