# NEXT — QR-EAT-B3-S-COUNTER-FEED

<!--
Bookmark only. TASK.md and live Git are authoritative.
-->

Updated: 2026-11-18

Task contract: `docs/ai/runs/QR-EAT-B3-S-COUNTER-FEED/TASK.md`
Task revision: 1 (approved 2026-11-18)

Current step: **DEPLOYMENT GATE PASSED** — two-tenant staging check on a
disposable Postgres 16 + production-mode local server: 46/46 product checks
PASS plus 3/3 permission-migration/fallback checks, 0 FAIL (`REVIEW-03.md`). `phase-b-counter-feed-v1` frozen at `4bf9d38`; freeze stamp `fc14d01`;
branch `feat/b3-s-counter-feed` is local only.

Next action:
1. Explicit deployment approval (push feature branch only if B3-C access needs
   it; never push `main`, never merge, never deploy or run the production seed
   without a separate instruction).
2. Record the deployment evidence and close `AME-014`; keep `AME-013` (real
   Postgres harness) before pilot/production.
3. Backlog: single-flight `pgPubSub.initialize()/subscribe()` — duplicate SSE
   refresh frames observed on a cold server with concurrent staff streams.
4. B3-C may start against the frozen contract in a separate `../Tabtep-App`
   session; it must consume `docs/PRODUCT/COUNTER-FEED-CONTRACT.md` and the
   B3-C handoff.

Blockers:
- Deployment approval has not been given (TASK revision 1 was approved for
  implementation; that is not deployment approval).
- The real Postgres isolation harness remains a separate backlog item.

Guardrails:
- No push to `main`, no merge, no Railway deploy, no production seed/migration.
- No `../Tabtep-App` edits from this repository.
- No loyalty flag or HMAC key changes.
