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
| AME-014 | contract | B3-S server add-on, cancellation, SSE/changes and `phase-b-counter-feed-v1` freeze | R3 | frozen; deployment approval pending | Verifier PASS (`REVIEW-02.md`); contract FROZEN at `4bf9d38`; two-tenant staging gate PASSED 2026-11-18 (46/46 + 3/3, `REVIEW-03.md`); not pushed/deployed |
| AME-015 | reliability | Single-flight `pgPubSub.initialize()/subscribe()` for staff SSE | B3-S staging gate observation | Duplicate refresh frames under concurrent first connections; add duplicate-init regression test; run before pilot |


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
