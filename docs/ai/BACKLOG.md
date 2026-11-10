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

## Waiting

| ID | Title | Blocked by | Next action |
|---|---|---|---|
| AME-006 | Cross-repo contract change pilot | AME-003 | Freeze contract, then Tabtep session |
| AME-007 | Tenant isolation T1–T7 remediation | AME-003, security review | Plan after contract baseline |

## Done

| ID | Title | Outcome | Run log |
|---|---|---|---|
| AME-008 | Remediate 0.2.1 bootstrap review findings | REVIEW-03 PASS WITH NOTES; accepted commit `21f5139`; task marked done | `docs/ai/runs/GL-AME-BOOTSTRAP-001/` |
| — | AME bootstrap 0.2.6 | Kit upgraded; task state migrated; active/resume docs installed | `docs/ai/AME_BOOTSTRAP.md` |

## WIP limits

- Max active implementation tasks: 2
- Max in verification: 1
- Cross-repo tasks: 1 at a time
