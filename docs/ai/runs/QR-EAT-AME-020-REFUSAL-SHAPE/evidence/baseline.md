# S0 baseline — QR-EAT-AME-020-REFUSAL-SHAPE

Recorded on branch `fix/ame-020-refusal-shape` at `195a96d` (base `main`),
**before** any code change. Disposable PostgreSQL 16 on
`127.0.0.1:55435`, database `qreat_integration`, created with
`prisma migrate deploy` (no seed).

## Commands and results

| Check | Command | Result |
|---|---|---|
| Full tests | `npm test -- --runInBand` | PASS — 139 of 140 suites passed (1 skipped); 1678 passed, 11 skipped (1689 total); 15.556 s |
| Type-check | `npm run type-check` | PASS — no output |
| Build | `CI=true <ephemeral placeholders> npm run build` | PASS — Next.js production build completed |
| Owned lint | `npx eslint <owned order/SSE/test files>` | PASS — exit 0, no findings |
| Integration | `INTEGRATION_DATABASE_URL=<disposable loopback> npm run test:integration` | PASS — 17 of 17 tests |

Placeholders used for the build were the non-secret CI values from
`.github/workflows/ci.yml`; `DATABASE_URL` pointed at the disposable loopback
database. No `.env*` file was written or read.

## Pre-fix leak reproduction

A temporary integration spec (`zz-repro-ame020.it.ts`, deleted after the run)
called the real route handlers with the two-tenant fixtures. Output:

```text
own GET             200 (order payload)
cross-tenant GET    403 {"error":"Access denied: Order belongs to another restaurant","code":"FORBIDDEN"}
missing GET         404 {"error":"Order not found","code":"NOT_FOUND"}
cross-tenant PATCH  403 {"error":"Access denied: Order belongs to another restaurant","code":"FORBIDDEN"}
missing PATCH       404 {"error":"Order not found","code":"NOT_FOUND"}
cross-tenant ticket 403 {"success":false,"error":"Access denied: Order belongs to another restaurant","code":"FORBIDDEN"}
missing ticket      404 {"success":false,"error":"Order not found","code":"NOT_FOUND"}
anonymous SSE       500 {"error":"Failed to setup real-time connection"}
anonymous audit row 1 row claimed
```

The `403`/`404` split confirms that a cross-tenant id was distinguishable from
a missing id on the read, status, ticket and other audited routes. The anonymous
stream answered `500` while still writing its anonymous audit event.
