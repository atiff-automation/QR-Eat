# Backlog — QR-Eat / Tabtep Web + Server

Product-level work for the web/server repo. Android work lives in
`../Tabtep-App`.

## Rules

- One ID per item.
- Every item has an area, risk, and status.
- Link the run log when work starts.
- Cross-repo items must link the Tabtep-App item.
- Respect WIP limits.

## Active

| ID | Area | Title | Risk | Status | Notes |
|---|---|---|---|---|---|
| AME-001 | security | Rotate exposed credentials and rewrite Git history | R3 | deferred | Accepted development risk; production gate before real users |
| AME-002 | quality | Fix lint baseline (61 errors, 11 warnings) | R1 | ready | Separate task; do not mix with features |
| AME-003 | contract | Establish canonical API contract | R2 | in progress | Index created in `docs/PRODUCT/`; OpenAPI/typed clients still pending |
| AME-004 | docs | Resolve README/package and release-doc drift | R0 | ready | Next 14 vs 15; stale server commit |
| AME-005 | pilot | First low-risk AME bug | R1 | ready | Non-auth, non-payment; after bootstrap |
| AME-013 | test-infra | Real Postgres two-tenant integration harness | R2 | done | Verifier PASS (`REVIEW-02.md`), R-01/R-02 closed. Commit `f92599e`, merge `df4b6bf`, deployed `76a24002…` SUCCESS, health UP, no migration. CI runs `verify` and the new `integration` job (postgres:16) on every push |
| AME-007 | security | Tenant isolation T1–T7 remediation | R2 | done | Audited 2026-11-20: already delivered at `14b1641` (Phase A, T1/T2/T3/T4/T6) and `534612a` (Phase B, T7) per the upstream record and current code. T5 (RLS) split out as `AME-021`. Evidence: `docs/ai/runs/QR-EAT-AME-007-TENANT-VERIFY/` |
| — | pilot | Pilot gate — staff feed reliability | R2 | go-with-conditions | GO WITH CONDITIONS (2026-11-21). Production check executed: exactly-once create/add/cancel on two concurrent streams, recovery after a DB restart with no client reconnect. Outstanding: two-real-device visual confirmation on the first staff session. `docs/ai/runs/QR-EAT-PILOT-GATE-STAFF-FEED/` |
| AME-020 | security | Normalise cross-tenant and anonymous refusals exposed by the AME-013 harness | R2 | done | Verifier PASS (`REVIEW-02.md`), F-1 closed, 16-route sweep clean. Commit `e1e2da6`, merge `8487f08`, deployed `8f775ad3…` SUCCESS, health UP, no migration. CI `44748587813` green (verify + integration 18 assertions) |
| AME-022 | security | Platform-admin business-data mutation policy | R3 | ready | `PATCH /orders/[id]/status` lets a platform admin mutate a tenant order and therefore distinguish existence. Policy decision: should admins touch tenant business data at all? Found as REVIEW-02 N-03. Do not start without approval |
| AME-023 | security | Remaining refusal/status consistency | R2 | done | Verifier PASS (`REVIEW-01.md`). Commit `4c2ab2d`, merge `2eae635`, deployed `636888ff…` SUCCESS; anonymous order reads and SSE both `401` in production; `modify` refusals `404`. CI `44797626219` green (verify + integration 20 assertions) |
| AME-024 | security | Table and restaurant refusal-shape normalisation | R2 | ready | From the AME-023 audit: `requireTableAccess` 11 sites (6 with differing refusals, 5 identical 500); `requireRestaurantAccess` 35 sites (27 differing — 15 `403/404`, 12 `403/500` — 8 identical 500); `requireStaffAccess` none. **Reachability matters:** most restaurant sites pass `context.restaurantId`, not a path id, so the 403 is not caller-triggerable; the genuinely reachable foreign-id sites (`restaurants/[id]`) are in the identical-500 class. Scope path-id routes first. Contract: `docs/ai/runs/QR-EAT-AME-023-ORDER-REFUSALS/evidence/s3-resource-refusal-audit.md` |
| AME-025 | ui | Web orders dashboard: takeaway rows and failed-load recovery | R1 | ready | Observation from the pilot-gate production check (2026-11-21): a created takeaway order was returned by the API but not visible on `/dashboard/orders`, and a second tab opened during the DB restart showed a partial total that did not recover. Investigate whether the page filters order types and whether a failed initial fetch retries. Not pilot-blocking; staff surface is the Android Counter. Do not code before the behaviour is understood |
| AME-026 | product | Reconcile the web POS fallback decision | R2 | ready | D44/D50 assume a web POS fallback that no longer exists (legacy UI deleted 2026-01-19, `918de58`). Pilot fallback is QR ordering + manual paper. Decide before paying restaurants: restore a minimal order-entry fallback, or formally retire it. Evidence: `docs/ai/runs/QR-EAT-PILOT-GATE-STAFF-FEED/PILOT-GATE.md` §10 |
| AME-021 | security | Database-level RLS as defense-in-depth (T5) | R3 | deferred | Isolation is application-layer only; every route must use the helpers. Recorded by AME-007 verification (`docs/ai/runs/QR-EAT-AME-007-TENANT-VERIFY/`). Architectural: RLS policies, session variables, migration. Do not start without a design and approval |
| AME-014 | contract | B3-S server add-on, cancellation, SSE/changes and `phase-b-counter-feed-v1` freeze | R3 | done | Verifier PASS (`REVIEW-02.md`); staging gate PASSED (`REVIEW-03.md`); merged `ab63894`; deployed `27852ccb…` SUCCESS, health UP, migrations applied, no seed |
| AME-015 | reliability | Single-flight `pgPubSub.initialize()/subscribe()` for staff SSE | R2 | done | Verified PASS (`REVIEW-03.md`); commit `6a51d04`, merge `19cb485`, deployed `4657048f…` SUCCESS, health UP, no migration. Duplicate frames 2 → 0 in the local two-tenant harness; no production duplicate count claimed (no staff accounts). CI build red from missing VAPID secret (`AME-019`) |
| AME-016 | reliability | Staff SSE reconnect drops per-connection `message` handlers | R2 | done | Verifier PASS (`REVIEW-01.md`); commit `312b09c`, merge `d6fc6ba`, deployed `8d457eb7…` SUCCESS, health UP, no migration. Reconnect survival proven at the module seam on a disposable PostgreSQL (1 frame post-fix, 0 pre-fix) |
| AME-017 | reliability | One LISTEN session per process instead of per module graph | R1 | deferred | Found during AME-015: Next bundles `instrumentation.ts` and the route separately, so each graph single-flights its own LISTEN client. Correctness is proven (one frame per connection); this only removes the extra idle session. Needs a shared module singleton; do not start without a plan |
| AME-018 | reliability | NOTIFY client publication race with `cleanup()` | R1 | done | Shipped with AME-016 scope S4 (commit `312b09c`, deployed `8d457eb7…`): NOTIFY publication is ownership-gated, superseded clients are closed, and a waiting `notify()` gets the live client or a clean rejection instead of hanging |
| AME-019 | ci | CI `Build` step fails: no `VAPID_PRIVATE_KEY` repository secret | R1 | done | Lazy VAPID configuration shipped. Branch CI `44644311211` and `main` CI `44647023835` both green (Build included, Node 20); merge `54993fe`, deployed `589bd7a3…` SUCCESS, health UP, no migration |


## Waiting

| ID | Title | Blocked by | Next action |
|---|---|---|---|
| AME-006 | Cross-repo contract change pilot | AME-003 | Freeze contract, then Tabtep session |
| AME-012 | Audit-log retention/cleanup for print acks | AME-010 audit volume | Define schedule/retention; O-5 follow-up |

## Done

| ID | Title | Outcome | Run log |
|---|---|---|---|
| AME-011 | Web station `printMode` control (B1-W) | REVIEW-01 PASS WITH NOTES; `c78f773`, merge `d63bdbc`; deployed `c4d79c4b…`; health UP; loyalty/HMAC unset | `docs/ai/runs/QR-EAT-B1-W-PRINT-MODE-WEB/` |
| AME-010 | Implement the frozen Phase B print contract (B1-S) | REVIEW-01 PASS WITH NOTES; `fd014d4`, merge `6d59a56`; deployed `cb4f7519…`; health UP; loyalty/HMAC unset | `docs/ai/runs/QR-EAT-B1-S-PRINT-SERVER/` |
| AME-009 | Freeze the Phase B print-ack/SSE and station print-mode contract (B1-C) | REVIEW-01 PASS; frozen `39031bb`; docs-only | `docs/ai/runs/QR-EAT-PHASE-B-PRINT-CONTRACT/` |
| AME-008 | Remediate 0.2.1 bootstrap review findings | REVIEW-03 PASS WITH NOTES; accepted commit `21f5139`; task marked done | `docs/ai/runs/GL-AME-BOOTSTRAP-001/` |
| — | AME bootstrap 0.2.9 | Kit upgraded; permission ergonomics; Android verifier allowlist; task state migrated | `docs/ai/AME_BOOTSTRAP.md` |

## WIP limits

- Max active implementation tasks: 2
- Max in verification: 1
- Cross-repo tasks: 1 at a time
