# API Contract Index — Tabtep

**Status:** canonical ownership index · 2026-11-10  
**Owner:** QR-Eat  
**Consumers:** QR-Eat web, Tabtep Counter, Tabtep Kitchen/Station

This is not yet a generated OpenAPI document. It defines the canonical source of
truth and the conventions. Generating OpenAPI and typed clients is a follow-up.

## Source of truth

- Actual routes: `src/app/api/**/route.ts`
- Data model: `prisma/schema.prisma`
- Event/SSE behavior: `src/app/api/events/*` and Counter/Station handlers
- Client DTOs: `../Tabtep-App/core/network`
- Project rules: `docs/PRODUCT/SYSTEM-MAP.md`

If a document disagrees with code, code wins until this index and the code are
reconciled. Do not treat historical `/api/mobile/v1` notes as current.

## Conventions

- Content type: `application/json; charset=utf-8`
- Timestamps: ISO-8601 UTC; server time is authoritative for ledger/events.
- IDs: opaque strings; clients must not parse them.
- Versioning: path-versioned for breaking changes; additive fields are allowed.
- Errors: follow the existing project error envelope; do not invent a second one.
- Auth:
  - web: HttpOnly session cookies
  - Counter: Bearer access/refresh tokens
  - Station: device credential/token
- Every mutating retry: idempotency key.
- Events: sequence-ordered; gaps trigger resync, never a guess.
- Money: Prisma `Decimal(10,2)` for stored money; keep one convention across
  UI, API, calculations, and tests. Do not mix with integer minor units without
  an explicit conversion boundary.

## Current route groups

| Group | Route files | Purpose |
|---|---:|---|
| `/api/counter` | 32 | Counter bootstrap, orders, payments, reports, business day |
| `/api/admin` | 29 | platform/admin, roles, menu, staff, reports |
| `/api/auth` | 16 | login, sessions, RBAC, password/reset |
| `/api/orders` | 11 | order lifecycle, status, ready, recall, refund, void |
| `/api/settings` | 10 | restaurant settings |
| `/api/tables` | 8 | table state and bill |
| `/api/devices` | 7 | provisioning, pairing, tokens, revoke |
| `/api/owner` | 7 | owner reports/staff/orders |
| `/api/stations` | 6 | station management |
| `/api/qr` | 6 | customer QR ordering |
| others | remainder | kitchen, events, push, receipts, health, jobs |

## Contract debt

- No OpenAPI document yet.
- `Tabtep-App/docs/API-CONTRACT.md` is historical/proposed; it must become a
  pointer, not a parallel contract.
- `API-DOCUMENTATION.md` is older RBAC-era documentation; verify before use.
- Client DTOs and server routes are maintained separately.

## Change process

1. Change the server contract first.
2. Make additive/backward-compatible changes preferred.
3. Add or update server tests.
4. Update this index.
5. Freeze the contract commit.
6. Update client DTOs/tests in a separate Tabtep session.
7. Run integration verification.
8. Release server first, then clients.
9. Update `RELEASE-COMPATIBILITY.md`.

## Next improvements

- Generate `openapi.yaml` from route/schema definitions or maintain it as code.
- Generate TypeScript and Kotlin DTOs from the contract.
- Add contract tests in CI for critical endpoints.
