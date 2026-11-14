# NEXT — QR-EAT-LOYALTY-PROMO-V1

<!--
Bookmark only. TASK.md and live Git are authoritative.
Update at phase boundaries, before compaction, and before ending a session.
-->

Updated: 2026-11-14

Task contract: `docs/ai/runs/QR-EAT-LOYALTY-PROMO-V1/TASK.md`
Task revision: 2 (approved 2026-11-13)

Current step: **P9, P9-10a and P9-10b complete and committed.** P10 (contract freeze) is next.

Last completed:
- P0–P8 complete and committed.
- **P9 complete** (`REVIEW-23`): fresh drill, upgrade drill 45/45, concurrency 47/47,
  rollback, permissions 31/31, edge warning, `PILOT-RUNBOOK.md`.
  - `qrorder_dev` was reset, replayed (35 migrations), and left **migrated and seeded**.
- **P9-10 probed** (`4114847`): Railway's edge **prepends** the client to `X-Forwarded-For` and
  appends a per-connection internal hop; `X-Real-IP` is the client. The old resolver took the
  last entry, so the IP floor limited nothing and the warning never fired.
- **P9-10a** (`afe15fc`, `REVIEW-24`): resolver moved to `src/lib/client-ip.ts`; on Railway
  validated `X-Real-IP`, then `XFF[0]`; off-Railway headers untrusted; non-routable rejected;
  disagreement canary; `edgeIp` diagnostic on `/api/health`.
- **P9-10b** (`e5f6046`, `REVIEW-25`): every persisted `ipAddress` uses the resolver, including
  `SecurityUtils.getClientIP` (which covers ~20 auth routes); runbook reads `edgeIp` on the
  public URL.

Next action:
1. **P10 — contract freeze.** Update `docs/PRODUCT/API-CONTRACT.md` and
   `RELEASE-COMPATIBILITY.md`; write the Counter handoff; record P8-1 (Z `grossSales` now
   pre-tax), P8-6 (net includes tax — accounting sign-off), P7c-1 / **P9-10** (Railway
   `X-Forwarded-For` unobserved), and P9-09 (`outcome = 'GUEST'` under flag off).
2. **P11 — four-lens R3 review** (different model or human pass).
3. **Pilot** (human): `LOYALTY_ENABLED=true`, `LOYALTY_PHONE_HMAC_KEY`, `LoyaltySettings.enabled`
   for one restaurant, `db:seed` present, edge warning absent. Follow `PILOT-RUNBOOK.md`.

Blockers:
- none. P9-10 is closed: the edge behaviour is measured and recorded in
  `evidence/P9-10-edge-headers.txt`, and the resolver is fixed.
