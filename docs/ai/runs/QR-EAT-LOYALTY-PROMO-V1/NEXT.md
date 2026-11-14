# NEXT — QR-EAT-LOYALTY-PROMO-V1

<!--
Bookmark only. TASK.md and live Git are authoritative.
Update at phase boundaries, before compaction, and before ending a session.
-->

Updated: 2026-11-14

Task contract: `docs/ai/runs/QR-EAT-LOYALTY-PROMO-V1/TASK.md`
Task revision: 2 (approved 2026-11-13)

Current step: **P9 complete and committed.** P10 (contract freeze) is next.

Last completed:
- P0–P8 complete and committed.
- **P9 complete** (`REVIEW-23`): fresh drill, upgrade drill 45/45, concurrency 47/47,
  rollback, permissions 31/31, edge warning, `PILOT-RUNBOOK.md`.
  - `qrorder_dev` was reset, replayed (35 migrations), and left **migrated and seeded**.
  - Correction cycle closed P9-01 (rollback drill now runs with `LoyaltySettings.enabled = true`
    and the env flag off), P9-02 (idempotency row across the loyalty replay), P9-04 (deterministic
    anonymise-then-rename), and five runbook items.

Next action:
1. **P10 — contract freeze.** Update `docs/PRODUCT/API-CONTRACT.md` and
   `RELEASE-COMPATIBILITY.md`; write the Counter handoff; record P8-1 (Z `grossSales` now
   pre-tax), P8-6 (net includes tax — accounting sign-off), P7c-1 / **P9-10** (Railway
   `X-Forwarded-For` unobserved), and P9-09 (`outcome = 'GUEST'` under flag off).
2. **P11 — four-lens R3 review** (different model or human pass).
3. **Pilot** (human): `LOYALTY_ENABLED=true`, `LOYALTY_PHONE_HMAC_KEY`, `LoyaltySettings.enabled`
   for one restaurant, `db:seed` present, edge warning absent. Follow `PILOT-RUNBOOK.md`.

Blockers:
- **P9-10** — the Railway edge's `X-Forwarded-For` behaviour is unobserved. The warning makes a
  misconfigured deploy visible, but the header must be confirmed before inviting guests to a busy
  pilot; otherwise every caller shares the 10/hour bucket.
