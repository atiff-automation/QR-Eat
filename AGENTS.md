# QR-Eat — Agent Instructions

This is the web/API/server repository for the Tabtep product. The Android
Counter and Kitchen/Station clients live in `../Tabtep-App`.

## Read first

1. `docs/ai/PROJECT_PROFILE.md` — commands, baseline, architecture, risks.
2. `docs/ai/AME/core/` — AME method, roles, workflows, verification.
3. `GLOSSARY.md` — product terms.
4. `docs/WEB-UI-STANDARD.md` — web UI rules.
5. `docs/TERMINOLOGY.md` — canonical user-facing vocabulary.
6. `docs/DATA-RETENTION.md` — retention and backup rules.
7. `docs/ai/BACKLOG.md` — current work.

## Commands

```text
Build:      npm run build
Test:       npm test -- --runInBand
Test one:   npx jest <path>
Lint:       npm run lint
Typecheck:  npm run type-check
Format:     npm run format:check
Run:        npm run dev
Migrate:    npm run db:migrate
Generate:   npx prisma generate
```

## Architecture

- `src/app` — routes and pages.
- `src/app/api` — API handlers.
- `src/lib/auth.ts`, `src/lib/auth-utils.ts`, `src/lib/device-auth.ts`, `src/lib/rbac/` — authentication, authorization, tenant context.
- `src/lib/orders`, `src/lib/counter` — order and station domain.
- `src/lib/services` — reporting, payments, notifications, jobs.
- `src/components` — UI; shared primitives in `src/components/ui`.
- `prisma` — schema and migrations.

Keep business rules out of route handlers. Reuse existing domain services.

## Known baseline

- Type-check passes.
- Tests pass: 524 passed, 11 skipped at baseline.
- Build passes.
- Lint is red: 62 errors, 11 warnings. This is a pre-existing baseline.
- Do not make whole-repo lint a hard gate until a separate cleanup task fixes it.
- CI does not run lint yet.

## Sensitive areas

Do not change without explicit human approval:

- `src/lib/auth.ts`, `src/lib/auth-utils.ts`, `src/lib/device-auth.ts`, `src/lib/rbac/`
- auth, staff, admin, device, station API routes
- payment routes/services and provider webhooks
- `prisma/migrations`
- customer PII, receipts, reports
- production configuration and deployment

## Do not touch

- `QR-Eat-Kitchen-App/` — retired prototype, separate Git repository.
- `.next/`, `node_modules/`, generated Prisma client.
- `.env`, `.env.local`, `.railway-env-*.txt`.
- `lint_output*.txt`, `tsc_output.txt` — generated diagnostics.
- Applied migrations without a migration plan.

## Rules

- Server is the system of record. Clients render state and send intents.
- Scope tenant data by `restaurantId`; verify authorization on every endpoint.
- Reuse existing patterns before creating new ones.
- Do not add a dependency without approval.
- Do not expand scope silently.
- Do not claim a test passed unless it was run.
- Do not put secrets or PII in prompts, logs, screenshots, or run logs.
- Update the run log and docs when behaviour changes.
- Do not modify the Android repo from this session. Cross-repo work needs a
  separate Tabtep-App session and a frozen API contract.

## AME commands

- `/ame-bug` — investigation-first bug workflow.
- `/ame-feature` — feature workflow with spec, UX gate, contract, build, verify.
- `/ame-review` — read-only two-axis review.
- `/ame-fix` — remediate findings from a review report.
- `/ame-audit` — read-only architecture/security/consistency audit.

## Cross-repo boundary

- QR-Eat owns the API contract and server semantics.
- Tabtep-App consumes the contract.
- For cross-repo features, change and freeze the contract here first, then update
  the Android client in its own session/repository.
- If the contract changes, update `Tabtep-App/docs/API-CONTRACT.md` or its
  replacement pointer in the same initiative.
