# TypeScript Cleanup — Phase 2 (Auth)

Date: 2026-10-29

## Scope

RBAC login and role-switch route typing.

## Changes

- `rbac-login` PATCH:
  - guard `switchResult.token`, `user` and `session`
  - prevent optional `restaurantContext` response assignment errors
- `switch-role` POST:
  - guard `validation.payload`
  - guard `switchResult.token`, `user` and `session`
  - prevent optional `restaurantContext` response assignment errors
- Response payloads use a typed record while preserving the existing API shape.

## Result

- Errors before this phase: **495**
- Errors after this phase: **458**
- Auth route errors: **0**
- Full build: passed
- Full Jest suite: 388 passed, 11 skipped

## Deployment

- `8fb54ba0-d690-4515-aba6-7dfce3e7a814`
- `/api/health`: 200
- Production owner login: successful

## Remaining error groups

| Area | Errors |
|---|---:|
| Staff analytics route | 120 |
| Old dashboard report pages | 79 |
| Admin API routes | 134 |
| Generated `.next/types` | 29 |
| Other app files | 96 |

## Next cleanup steps

1. Decide whether the legacy staff analytics route and old dashboard reports
   should be removed or restored.
2. Fix Next 15 route-handler parameter types.
3. Address admin API/component errors.
4. Enable type-checking in CI only after the remaining groups are addressed.
