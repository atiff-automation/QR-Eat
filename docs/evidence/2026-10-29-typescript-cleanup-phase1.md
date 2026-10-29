# TypeScript Cleanup — Phase 1

Date: 2026-10-29

## Baseline

- Before cleanup: **556** TypeScript errors
- After cleanup: **495** errors
- Tests: 0 TypeScript errors
- New reporting/adjustment files: 0 TypeScript errors

## Changes

- Restricted the main TypeScript scope to:
  - `next-env.d.ts`
  - `src/**/*.ts`
  - `src/**/*.tsx`
  - `.next/types/**/*.ts`
- Excluded repository scripts and one-off root migration/debug files from the
  application type-check. They were 56 of the previous errors.
- Removed the broken unused `src/lib/rbac/test-legacy-support.ts` test script.
- Fixed `src/app/api/auth/reset-password/route.ts`:
  - removed assignments to the undeclared `tableName` variable.
- Fixed `src/app/api/counter/payments/route.ts`:
  - removed `paymentBatchId` from audit metadata because the payment batch
    result has no such field.
- Removed the invalid `experimental.middlewareSourceMaps` option from
  `next.config.js`.

## Remaining error groups

| Area | Errors |
|---|---:|
| `src/app/api/staff/analytics/*` legacy report route | 120 |
| Admin API routes | 134 |
| Old dashboard report pages | 79 |
| Auth API routes | 37 |
| Generated `.next/types` | 29 |
| `src/lib` | 26 |
| Other API routes | 25 |
| Admin components | 19 |
| Other app files | 26 |

## Verification

- Production build: passed
- Full Jest suite: 388 passed, 11 skipped
- No new errors in generated/mounted reporting or adjustment files

## Not deployed

The two runtime fixes are committed with this cleanup phase. They do not require
a schema migration.

## Next cleanup steps

1. Fix auth route nullability and cookie typing.
2. Decide whether the legacy staff analytics route and old dashboard reports
   should be removed or restored.
3. Fix Next 15 generated route-handler parameter types.
4. Address admin API/component errors.
5. Only then enable TypeScript checking in CI.
