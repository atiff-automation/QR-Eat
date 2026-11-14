# NEXT — QR-EAT-LOYALTY-PROMO-V1

<!--
Bookmark only. TASK.md and live Git are authoritative.
Update at phase boundaries, before compaction, and before ending a session.
-->

Updated: 2026-11-14

Task contract: `docs/ai/runs/QR-EAT-LOYALTY-PROMO-V1/TASK.md`
Task revision: 2 (approved 2026-11-13)

Current step: **P10-close complete and committed.** P11 (four-lens R3 review) is next.

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
1. **P11 — four-lens R3 review** (Security, correctness, data, product) by a different model
   or a human. P11 is the last gate before the freeze stamp.
   Carry into it: **D-1** (restaurant delete), **D-2** (phone on Counter responses),
   **P8-8** (early-close boundary), **P9-2** (billRevision lock), **P9-3** (unique-conflict
   classification), **M-1** (enumeration false alerts), **P6C2b-1** (export failure).
2. **After P11 PASS:** stamp the final hash in `docs/PRODUCT/API-CONTRACT.md` and
   `RELEASE-COMPATIBILITY.md` (two-line amendment), then pilot.
3. **Pilot** (human): `LOYALTY_ENABLED=true`, `LOYALTY_PHONE_HMAC_KEY`, `LoyaltySettings.enabled`
   for one restaurant, `db:seed` present, `/api/health` `edgeIp.source = "x-real-ip"`.
3. **Pilot** (human): `LOYALTY_ENABLED=true`, `LOYALTY_PHONE_HMAC_KEY`, `LoyaltySettings.enabled`
   for one restaurant, `db:seed` present, edge warning absent. Follow `PILOT-RUNBOOK.md`.

Blockers:
- none. P9-10 is closed: the edge behaviour is measured and recorded in
  `evidence/P9-10-edge-headers.txt`, and the resolver is fixed.
