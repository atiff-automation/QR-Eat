# TypeScript Phase D — CI and Build Enforcement

Date: 2026-10-30

## Changes

- Removed `typescript.ignoreBuildErrors` from `next.config.js`.
- Added `.github/workflows/ci.yml` to run on push and pull request:
  - `npm ci`
  - `npx prisma generate`
  - `npm run type-check`
  - `npm test -- --runInBand`
  - `npm run build`
- Added CI-only environment values for Prisma, JWT, domains, Redis and VAPID.

## Verification

- TypeScript errors: **0**
- Full Jest: **388 passed**, 11 skipped
- Production build with type-checking enabled: **passed**
- Clean-room CI simulation with no local `.env`: **passed**
- Workflow YAML: **valid**
- No database/schema changes
- No Counter/APK changes

## Result

Type errors now block both the Railway build and GitHub CI. The application
must keep `npm run type-check` at zero before deployment.
