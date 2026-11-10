# Project Profile — QR-Eat / Tabtep Web + Server

**Project:** QR-Eat (product: Tabtep)  
**Owner:** Atiff  
**Last reviewed:** 2026-11-10  
**AME level:** Standard

QR-Eat is the web application, API, database, and system of record for the
Tabtep restaurant product. The Android Counter and Kitchen/Station clients live
in the sibling repository `../Tabtep-App`.

## Stack

- Language: TypeScript
- Framework: Next.js 15 (App Router), React 19
- Runtime: Node.js 20+ (CI uses Node 20)
- Package manager: npm (lockfile committed)
- Database: PostgreSQL 15+
- ORM: Prisma 6
- Cache/realtime: Redis / PostgreSQL NOTIFY / SSE
- Auth: JWT + NextAuth-style sessions, RBAC
- Payments: ToyyibPay (verify current provider configuration)
- Tests: Jest
- CI: GitHub Actions (`.github/workflows/ci.yml`)

## Commands

```text
Install:        npm ci
Build:          npm run build
Test:           npm test -- --runInBand
Test (single):  npx jest <path>
Lint:           npm run lint
Typecheck:      npm run type-check
Format check:   npm run format:check
Run:            npm run dev
Migrate:        npm run db:migrate
Generate:       npx prisma generate
Seed:           npm run db:seed
Production:     npm run start
```

## Baseline — 2026-11-10

**Commit:** `5dd1b76` (clean 0.2.1 branch, after security cleanup)  
**Branch:** `chore/ame-bootstrap-021`

| Check | Command | Result |
|---|---|---|
| Type-check | `npm run type-check` | PASS |
| Test | `npm test -- --runInBand` | PASS — 57 suites, 524 tests, 11 skipped |
| Build | `npm run build` | PASS |
| Lint | `npm run lint` | FAIL — 62 errors, 11 warnings |

Known pre-existing failures:

- Lint baseline is red. Do not make whole-repo lint a hard gate until the
  baseline is fixed in a separate quality task.
- 11 tests are skipped.
- CI does not currently run lint.

Known flaky tests:

- None verified in this baseline run.

## Architecture map

| Path | Responsibility |
|---|---|
| `src/app` | Next.js routes and pages |
| `src/app/api` | API route handlers |
| `src/lib/auth.ts`, `src/lib/auth-utils.ts`, `src/lib/device-auth.ts`, `src/lib/rbac/` | authentication, authorization, roles, tenant context |
| `src/lib/orders` | order lifecycle and domain rules |
| `src/lib/counter` | Counter/Station server integration |
| `src/lib/services` | reporting, payments, notifications, jobs |
| `src/components` | web UI components |
| `src/components/ui` | shared primitives |
| `prisma/schema.prisma` | data model and enums |
| `prisma/migrations` | database migrations |
| `docs` | project standards and evidence |
| `scripts` | operational and utility scripts |

Dependency direction: routes → services/domain → database. Route handlers must
not become the home of business rules.

## Existing standards

- `docs/WEB-UI-STANDARD.md` — web UI implementation standard.
- `docs/TERMINOLOGY.md` — canonical user-facing vocabulary across web, Counter,
  Station, receipts, reports, and docs.
- `docs/DATA-RETENTION.md` — retention and backup policy.
- `docs/API-DOCUMENTATION.md` — API reference; may be stale. Verify against code.
- `API-DOCUMENTATION.md` at repo root — older RBAC API reference; verify current.

## Sensitive areas

| Area | Why sensitive | Approval |
|---|---|---|
| `src/lib/auth.ts`, `src/lib/auth-utils.ts`, `src/lib/device-auth.ts`, `src/lib/rbac/` | authentication, permissions, tenant isolation | yes |
| `src/app/api/auth`, `src/app/api/staff`, `src/app/api/admin` | session/role changes | yes |
| payment routes and services | money, refunds, provider webhooks | yes |
| `prisma/migrations` | data integrity and rollback | yes |
| `src/app/api/devices`, `src/app/api/stations` | device identity and station access | yes |
| customer PII and receipts | privacy and retention | yes |
| production configuration and deploy | secrets and availability | yes |

## Do not touch

- `QR-Eat-Kitchen-App/` — retired Android prototype, separate Git repository.
- `.next/`, `node_modules/`, generated Prisma client.
- `.env`, `.env.local`, `.railway-env-*.txt`.
- applied migrations without a migration plan.
- `lint_output*.txt`, `tsc_output.txt` — generated diagnostics; do not edit.

## Data

- Primary database: PostgreSQL.
- Financial records: keep at least 7 years per `docs/DATA-RETENTION.md`.
- Customer PII: retain only as long as needed; anonymize where possible.
- Backups: nightly; restore test quarterly.
- Sensitive data must not appear in logs, run logs, or screenshots.

## External services

| Service | Purpose | Notes |
|---|---|---|
| ToyyibPay | payments | verify current API/keys; webhooks |
| Redis | cache/realtime support | verify production usage |
| Railway | hosting/deploy | environment variables live in provider |
| GitHub Actions | CI | type-check, test, build; lint not yet |

## Risk rules

- R0: docs, copy, internal non-behavioural changes.
- R1: normal UI/API change with tests and no sensitive data.
- R2: auth/RBAC, tenant isolation, payments, devices/stations, migrations,
  external integrations, production config.
- R3: auth bypass, payment correctness, destructive migration, data loss,
  production outage, secret exposure.

## Release

- Environments: local, CI, production (Railway).
- Build: `npm run build`.
- Start: `npm run start` (runs `prisma migrate deploy` before Next start).
- Smoke: health endpoint, login, owner dashboard, one order/payment path.
- Rollback: previous deployment/tag; database migration plan required.
- Feature flags: use where available for risky changes.

## Current known risks

- **Accepted development risk:** `.railway-env-*.txt` are removed from the
  current tree, but the same credential remains in legacy debug/ops scripts and
  documentation until `GL-AME-BOOTSTRAP-001` is remediated. Historical commits
  also contain it. No real users exist yet. Rotate and purge before production
  or real-user access.
- API contract is fragmented across QR-Eat and Tabtep-App docs.
- Lint baseline is red (62 errors).
- Documentation drift: README says Next 14; package uses Next 15.
- Tenant isolation gaps are documented in `Tabtep-App/docs/MASTER-REFERENCE.md`
  (T1–T7). Treat as security review input, not as fixed.
