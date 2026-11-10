# Release Compatibility — Tabtep

**Status:** baseline · 2026-11-10  
**Owner:** QR-Eat

Use this file to record which server version is compatible with which Counter and
Station versions. Do not infer compatibility from dates alone.

## Current release record

Fill from the actual deployed tags/build files. Do not copy stale values from
older docs.

| Surface | Version | Commit/tag | Notes |
|---|---|---|---|
| Server (QR-Eat) | | | deployed commit/tag |
| API contract | v1 (current namespaces) | | path-version only for breaking changes |
| Counter | | | versionName/versionCode |
| Kitchen/Station | | | versionName/versionCode |

## Compatibility rules

- Server changes must be additive/backward-compatible within the current API
  version.
- Breaking changes require a new path version and a client migration plan.
- Clients must tolerate additive fields.
- Clients must not depend on undocumented fields or ordering.
- Every mutating request must be idempotent.
- Event consumers must resync on gaps, not guess.
- Payment and order semantics are server-authoritative.

## Release order

1. Backend contract change and server tests.
2. Deploy backend in a backward-compatible form.
3. Verify server in staging.
4. Release client update.
5. Verify integrated behavior.
6. Remove old server compatibility only after all supported clients are updated.

## Rollback

- Server: previous deployment/tag; database migration must have a rollback or
  forward-fix plan.
- Counter/Station: previous signed APK; do not break the station credential or
  local cache format without a migration.
- Record the rollback decision in the run log.

## Minimum supported versions

| Client | Minimum supported | Reason |
|---|---|---|
| Counter | | |
| Kitchen/Station | | |

## Verification

- Server: type-check, tests, build.
- Counter: unit tests, lint, debug build, device smoke.
- Station: unit tests, lint, debug build, device smoke, print/SSE checks.
- Cross-repo: one end-to-end order/payment/print path where relevant.
