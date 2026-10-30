# Admin Phase B — Audit, Role Analytics, and Menu Admin APIs

Date: 2026-10-30

## Scope

Repair the remaining admin TypeScript errors without changing the database schema
or exposing restaurant performance data to platform admins.

## Changes

### Audit history

- Replaced reads from the mismatched `auditLog` fields with the canonical
  `rbac_logs` data written by `AuditLogger.logUserRoleChange`.
- Added actor lookup across platform admins, restaurant owners, and staff.
- Preserved the role-history response shape expected by the admin UI.
- Updated the CSV/JSON export endpoint to use the same RBAC log source.

### Role analytics

- Removed the non-existent `roleTemplate` Prisma model dependency.
- Built template permission maps from `role_permissions`.
- Fixed custom-permission JSON handling.
- Replaced invalid `UserRole.user` relation filters with explicit inactive-user
  ID checks.
- Replaced invalid audit-log filters with RBAC log activity counts.

### Admin menu APIs

- Fixed role permission checks to use the authenticated permission list.
- Fixed Decimal price arithmetic in bulk updates.
- Removed the non-existent `menuItemVariation` deletion; variation groups/options
  cascade with menu items.
- Fixed menu import typing and error handling.
- Fetched the restaurant name for menu export instead of reading a missing
  role field.

### Admin UI

- Fixed role assignment and bulk-operation modals to consume `ApiClient`
  responses directly.
- Fixed selected-user bulk lookup to call `/api/admin/users/bulk`.
- Fixed role deletion to pass `roleId` through the DELETE query string.

### Admin permissions

The platform-admin role intentionally does not receive restaurant analytics
permissions. The admin-only routes that previously required non-existent or
missing permission keys now use the existing `users:read`, `users:write`, and
`users:delete` permissions, while still requiring `platform_admin` user type.

## Result

- TypeScript errors: **163 → 60**
- Admin TypeScript errors: **0**
- Full Jest: **388 passed**, 11 skipped
- Production build: **passed**
- No database/schema changes
- No restaurant performance access for platform admins
- Enhanced role UI remains unreachable/deferred; its code now type-checks
