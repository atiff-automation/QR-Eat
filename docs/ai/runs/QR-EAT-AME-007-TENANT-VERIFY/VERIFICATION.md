# Verification — AME-007 tenant isolation T1–T7

**Type:** AUDIT (read-only)
**Date:** 2026-11-20
**Scope:** is the backlog item “Tenant isolation T1–T7 remediation” still open?
**Base:** `main` `195a96d` (QR-Eat), source record `14b1641` / `534612a`
**Verdict:** **already delivered** except T5, which is an architectural choice,
not a defect. Close the backlog item; keep T5 as an explicit risk note.

## Why this record exists

`docs/ai/BACKLOG.md` carried AME-007 as “Tenant isolation T1–T7 remediation —
blocked by AME-003, security review — plan after contract baseline”. The
upstream record says otherwise: `Tabtep-App/docs/MASTER-REFERENCE.md` §8 records
**Phase A tenant isolation PASSED** at QR-Eat `14b1641` (2026-10-25, 34 live
assertions) and Phase B at `534612a` (68 assertions). Both commits exist in this
repository. A remediation task would have re-fixed closed issues.

## Item-by-item verification (current code, not the old record)

| # | Gap as recorded | Current state | Evidence |
|---|---|---|---|
| T1 | SSE owner fallback could deliver cross-restaurant events | **Fixed, fail-closed** | `src/lib/counter/tenant-guards.ts:6-14` requires both restaurant ids and equality (missing id is never a wildcard); the SSE route filters through it; `src/tests/tenant-isolation-phase-a.test.ts:9-18`; AME-013 harness covers the event filter at route level |
| T2 | Owner-wide generic filters could span all owned restaurants | **Fixed, fail-closed** | `createCurrentRestaurantFilter` scopes to `context.restaurantId`, rejects platform admins and returns a non-matching id when context is missing (`src/lib/tenant-context.ts:394-409`); `src/app/api/orders/route.ts:39-44` uses it for list and count |
| T3 | Permissions unioned across all user roles | **Fixed** | Permissions are computed from one role template plus that role's custom permissions (`PermissionManager.computeRolePermissions`); `src/tests/tenant-isolation-phase-a.test.ts:32-51` asserts one-role computation |
| T4 | Owner without restaurant context could skip the payment-batch check | **Fixed** | `canReadRestaurantPaymentBatch` requires both ids and equality (`tenant-guards.ts:17-26`); enforced in `src/app/api/counter/payments/[key]/route.ts:56`; unit test present |
| T5 | PostgreSQL RLS is not the enforcement layer | **Unchanged by design** | Isolation is application-layer: routes use the helpers above and Prisma is global. Not a defect; a defense-in-depth gap. |
| T6 | Platform-admin business-data policy inconsistent | **Fixed** | `rejectPlatformAdminBusiness` runs in every resource helper (`src/lib/rbac/resource-auth.ts:19-20,45,101,155,209`); `createCurrentRestaurantFilter` throws for admins; admin business access returns 403 at the route boundary |
| T7 | Login deletes all sessions (multi-restaurant context) | **Fixed** | Per-device multi-session shipped (`4c6423c`), session cap/eviction and policy tested (`534612a`); `src/lib/rbac/session-manager.ts`, `session-policy.ts` |

## Cross-tenant test coverage now

- `src/tests/tenant-isolation-phase-a.test.ts` — guards and one-role permissions.
- `src/tests/tenant-isolation.test.ts` (AME-013, real PostgreSQL, CI) — orders
  read/write, changes feed, tickets/ack, staff-event filter, RBAC, cross-tenant
  refusals with positive controls. This is durable, unlike the removed 34-assertion
  live fixture from Phase A.
- The AME-013 harness already caught one residual: `GET /api/orders/[id]` answers
  403 for a foreign order and 404 for a missing one (`AME-020`).

## What is genuinely still open

- **T5 — no database-level RLS.** Isolation depends on every route using the
  helpers. That is the same class of risk the original audit named. It is an
  architecture decision with real cost (RLS policies per table, session variables,
  migration), not a bug fix. Recommend recording it explicitly rather than
  folding it back into AME-007.
- **`AME-020`** — the concrete existence leak the harness found. Small `R2` fix.

## Limits of this verification

- Verified by code reading plus durable unit/integration tests; the Phase A
  34-assertion live fixture was removed after its run and could not be re-executed.
- Did not re-run the Phase B browser/UI smoke.
- No production or staging access.

## Recommendation

Close AME-007 as delivered at `14b1641` / `534612a`, with this record as the
evidence. Carry T5 as an explicit deferred risk (new backlog item or accepted-risk
note), and proceed with `AME-020` as the only concrete isolation defect.
