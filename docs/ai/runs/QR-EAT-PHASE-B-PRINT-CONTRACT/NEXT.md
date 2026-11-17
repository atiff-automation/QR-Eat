# NEXT — QR-EAT-PHASE-B-PRINT-CONTRACT

<!--
Bookmark only. TASK.md and live Git are authoritative.
Update at phase boundaries, before compaction, and before ending a session.
-->

Updated: 2026-11-17

Task contract: `docs/ai/runs/QR-EAT-PHASE-B-PRINT-CONTRACT/TASK.md`
Task revision: 1 (approved 2026-11-17; B1-C docs-only)

Current step: **CONTRACT FROZEN at `39031bb`; review PASS; O-1–O-9 approved;
push/deploy close-out. Next is B1-S, then B1-W, then B2.**

Last completed:
- Read the Tabtep Phase B handoff and approved parent plan (Q1–Q6).
- Researched the merged QR-Eat print/station/order surface.
- Drafted `docs/PRODUCT/PRINT-ACK-CONTRACT.md` (`phase-b-print-v1`).
- Added the §19 pointer to `docs/PRODUCT/API-CONTRACT.md`.
- Added the Phase B record to `docs/PRODUCT/RELEASE-COMPATIBILITY.md`.
- Updated `docs/ai/ACTIVE.md` and `docs/ai/BACKLOG.md` (AME-009/AME-010).
- Ran `npm run type-check` (PASS), `npm test -- --runInBand` (1444 passed,
  11 skipped), `npm run build` (PASS).
- Confirmed `git diff df40e1d..HEAD -- src prisma scripts` is empty.
- `REVIEW-01.md`: **PASS**. Initial PASS WITH NOTES; one High-severity
  authority/B2 race (N-01) found in the delta cycle, fixed as C-13, re-verified
  PASS.

Next action:
1. O-1–O-9 are approved (2026-11-17). Push the freeze commits and confirm the
   automatic docs-only Railway deployment (O-9).
2. Implement B1-S (`docs/ai/runs/QR-EAT-B1-S-PRINT-SERVER/TASK.md`), then B1-W
   (`docs/ai/runs/QR-EAT-B1-W-PRINT-MODE-WEB/TASK.md`), then B2.
3. Do not enable loyalty, set the HMAC key, run seed, manually deploy or edit
   Tabtep from this session.

Owner decisions reported at freeze:
- O-1 approve `phase-b-print-v1`;
- O-2 cashier authority scope;
- O-3 cancellation chit (B2 or B3);
- O-4 `NONE` auto-`SKIPPED`;
- O-5 device-ack audit volume/cleanup;
- O-6 new-onboarding `COUNTER` without a printer preflight;
- O-7 web `printMode` control (B1-S API-only vs B2 UI);
- O-8 B3 Counter feed approach;
- O-9 push the local freeze commit.

Blockers:
- B1-S is not implemented; B2 must not start until it is merged and B0 is closed.
- The freeze commit is local only until O-9 is decided.
