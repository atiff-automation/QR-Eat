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
| AME-002 | quality | Fix lint baseline (62 errors, 11 warnings) | R1 | ready | Separate task; do not mix with features |
| AME-003 | contract | Establish canonical API contract | R2 | in progress | Index created in `docs/PRODUCT/`; OpenAPI/typed clients still pending |
| AME-004 | docs | Resolve README/package and release-doc drift | R0 | ready | Next 14 vs 15; stale server commit |
| AME-005 | pilot | First low-risk AME bug | R1 | ready | Non-auth, non-payment; after bootstrap |
| AME-014 | contract | B3-S server add-on, cancellation, SSE/changes and `phase-b-counter-feed-v1` freeze | R3 | done | Verifier PASS (`REVIEW-02.md`); staging gate PASSED (`REVIEW-03.md`); merged `ab63894`; deployed `27852ccb…` SUCCESS, health UP, migrations applied, no seed |
| AME-015 | reliability | Single-flight `pgPubSub.initialize()/subscribe()` for staff SSE | R2 | done | Local commit, verifier PASS (`REVIEW-03.md`), `duplicateFrames` 2 → 0, tenant isolation intact. Not pushed or deployed; release remains a separate gate before pilot. Contract: `docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/TASK.md` |
| AME-016 | reliability | Staff SSE reconnect drops per-connection `message` handlers | R2 | ready | Found during AME-015 planning: `cleanup()` → `removeAllListeners()` removes route handlers, so open streams stay connected but stop receiving after a successful reconnect. Plan separately; do not fold into AME-015 |
| AME-017 | reliability | One LISTEN session per process instead of per module graph | R1 | deferred | Found during AME-015: Next bundles `instrumentation.ts` and the route separately, so each graph single-flights its own LISTEN client. Correctness is proven (one frame per connection); this only removes the extra idle session. Needs a shared module singleton; do not start without a plan |
| AME-018 | reliability | NOTIFY client publication race with `cleanup()` | R1 | deferred | Found in AME-015 REVIEW-03 (N-6): `openNotifyClient()` publishes after its await, so cleanup inside an in-flight NOTIFY connect can adopt the abandoned client and orphan the replacement's, leaking one idle connection. No duplicate frames or state error. Gate publication on the session generation and close the abandoned client; plan before starting |


## Waiting

| ID | Title | Blocked by | Next action |
|---|---|---|---|
| AME-006 | Cross-repo contract change pilot | AME-003 | Freeze contract, then Tabtep session |
| AME-007 | Tenant isolation T1–T7 remediation | AME-003, security review | Plan after contract baseline |
| AME-012 | Audit-log retention/cleanup for print acks | AME-010 audit volume | Define schedule/retention; O-5 follow-up |
| AME-013 | Real Postgres two-tenant integration harness | B3-S mocked-test scope | Add after B3-S; run before pilot/production; do not expand B3-S |

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
