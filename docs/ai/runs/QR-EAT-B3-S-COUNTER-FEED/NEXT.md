# NEXT — QR-EAT-B3-S-COUNTER-FEED

<!--
Bookmark only. TASK.md and live Git are authoritative.
-->

Updated: 2026-11-18

Task contract: `docs/ai/runs/QR-EAT-B3-S-COUNTER-FEED/TASK.md`
Task revision: 1 (approved 2026-11-18)

Current step: **READY_TO_COMMIT** — verifier final PASS; commit and contract
freeze await explicit human authorization.

Next action:
1. Human authorizes the R3 commit (exact paths/message published by the Lead).
   This is not deployment approval.
2. Commit 1: content commit (implementation + migrations + contract +
   `API-CONTRACT.md` + release record + review/task evidence).
3. Commit 2: freeze record — contract header `FROZEN
   phase-b-counter-feed-v1 at <commit-1>`, release record stamp/hash, B3-C
   handoff stamp.
4. Report the frozen path/stamp/commit. Do not push or deploy without separate
   explicit deployment approval.
5. The manual two-tenant staging gate remains hard before deployment.

Blockers:
- TASK revision 1 is not approved.
- The manual two-tenant staging tenant is not confirmed; this is a production
  gate, not an implementation blocker.
- The real Postgres integration harness does not exist; see the backlog item.

Guardrails:
- No product code before approval.
- No `../Tabtep-App` edits.
- No push to `main`, no Railway deploy, no production seed/migration.
- No loyalty flag or HMAC key changes.
- B3-C does not start before the contract freeze.
