# NEXT — QR-EAT-LOYALTY-PROMO-V1

<!--
Bookmark only. TASK.md and live Git are authoritative.
Update at phase boundaries, before compaction, and before ending a session.
-->

Updated: 2026-11-17

Task contract: `docs/ai/runs/QR-EAT-LOYALTY-PROMO-V1/TASK.md`
Task revision: 2 (approved 2026-11-13)

Current step: **FROZEN and complete.** `df40e1d` is the frozen server commit and
the docs are reconciled to it. Nothing is merged, pushed, tagged or deployed, and
both loyalty switches are off by default.

Last completed:
- P0–P10 complete and committed.
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
- **P11 complete** (`REVIEW-29` **FAIL** → `REVIEW-30` **PASS WITH NOTES**): eight blockers and
  eight pre-pilot items closed by P11-fix (`df40e1d`).
- **P11 human pass PASS** (`P11-HUMAN-PASS.md`, 2026-11-16): all ten payment and migration
  scenarios accepted. Carried, not blocking: N-1 and M-1.
- **Freeze stamped** at `df40e1d` in `docs/PRODUCT/API-CONTRACT.md` and
  `docs/PRODUCT/RELEASE-COMPATIBILITY.md` (`955045a`).
- **Docs reconciled** to the frozen state: `TASK.md`, this file, `OPEN-ITEMS.md`,
  `API-CONTRACT.md`, `RELEASE-COMPATIBILITY.md`, `COUNTER-HANDOFF-LOYALTY.md`.
- **OI-1 resolved — body contract** (2026-11-17): the owner confirmed
  `PATCH /api/orders/{id}/modify` reads `idempotencyKey` from the JSON body; the
  addendum and handoff are corrected; no server change.

Next action:
1. **Owner decision — merge target.** Local `main` is 17 commits ahead of
   `origin/main`; `feat/loyalty-promo-v1` is 77 commits ahead of `origin/main`
   (60 ahead of local `main`). Either merge to local `main` and/or push the
   feature branch and open a PR against `origin/main`. Do not let a tool choose:
   a naive merge-and-push can publish unrelated AME/security history.
2. **OI-1 resolved — body contract** (2026-11-17). `PATCH /api/orders/{id}/modify`
   takes `idempotencyKey` in the JSON body; the addendum and handoff are
   corrected; a header-only request returns 400; freeze `df40e1d` preserved.
3. **Pilot** (human, after the merge decision): `LOYALTY_ENABLED=true`,
   `LOYALTY_PHONE_HMAC_KEY`, `LoyaltySettings.enabled` for one restaurant,
   `db:seed` present, `/api/health` `edgeIp.source = "x-real-ip"`. Follow
   `PILOT-RUNBOOK.md`.

Blockers:
- No code blocker. The merge target and the modify-idempotency wording are owner
  decisions. P9-10 is closed: the edge behaviour is measured and recorded in
  `evidence/P9-10-edge-headers.txt`, and the resolver is fixed.
