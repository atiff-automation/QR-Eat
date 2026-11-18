# NEXT — QR-EAT-B3-S-COUNTER-FEED

<!--
Bookmark only. TASK.md and live Git are authoritative.
-->

Updated: 2026-11-18

Task contract: `docs/ai/runs/QR-EAT-B3-S-COUNTER-FEED/TASK.md`
Task revision: 1 (approved 2026-11-18)

Current step: **FROZEN** — verifier PASS; `phase-b-counter-feed-v1` frozen at
`4bf9d38`; local commits only.

Next action:
1. Manual two-tenant staging check (hard pre-deployment gate).
2. Explicit deployment approval, then push/deploy. Do not deploy before both.
3. B3-C may start against the frozen contract in a separate `../Tabtep-App`
   session; it must consume `docs/PRODUCT/COUNTER-FEED-CONTRACT.md` and the
   B3-C handoff.
4. Record the deployment evidence and close `AME-014`; keep `AME-013` (real
   Postgres harness) before pilot/production.

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
