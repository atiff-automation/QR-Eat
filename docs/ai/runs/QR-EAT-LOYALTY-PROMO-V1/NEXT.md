# NEXT — QR-EAT-LOYALTY-PROMO-V1

<!--
Bookmark only. TASK.md and live Git are authoritative.
Update at phase boundaries, before compaction, and before ending a session.
-->

Updated: 2026-11-13

Task contract: `docs/ai/runs/QR-EAT-LOYALTY-PROMO-V1/TASK.md`
Task revision: 1

Current step: P2 gate PASSED (F-01 open) — P3 next after your two answers

Last completed:
- P0 baseline PASS (`fc1312a`).
- P1 schema + migrations authored and reviewed (R-03/R-04/R-07 corrected).
- P1 DB evidence: 5 migrations applied to `qrorder_dev`; 7 CHECKs validated.
- **R-08 fixed**: `uuid[]` did not round-trip → revision 2 join tables.
  `REVIEW-03` closed **R-08 and R-02**; `migrate diff` live DB → datamodel **empty**;
  migrations `20261113120000`, `20261113120100`, `20261113130000` **frozen**.
- **P2 pricing engine** (`src/lib/loyalty/**`, 6 modules + 6 test suites) — 166 tests,
  full suite 690 passed. Two correction cycles; `REVIEW-04` PASS WITH NOTES.

In progress:
- nothing — awaiting two decisions

Next action:
1. Answer **F-01**: does `maxDiscount` cap a FIXED reward?
2. Decide the **checkpoint commit** (R-04).
3. Then P3 (member/consent/quote services) — or a third P2 verification pass first,
   if you want one after cycle 2.

Blockers:
- F-01 (money semantics) blocks P5, not P3.
- P2 is untracked; a lost working tree loses it (R-04).

Open decisions:
- **F-01** — FIXED reward cap. Recommendation: cap it (`min(amount, maxDiscount)`).
- **R-04** — checkpoint commit to bind future review diffs. Recommendation: yes, one
  commit of P0–P2 with an explicit path list.
- R-01 — `Restrict` FKs vs the restaurant cascade delete; needed before P5.
- N-09 — record the join-table deviation in P10, citing §18.20.14 J.

Read first:
- `TASK.md`
- `REVIEW-02.md` (latest review)
- `RUN_LOG.md`

Do not:
- Merge without the required approval.
- Change scope without a new task revision.
- Print secrets or PII.
- Read `.env`, `.env.local`, or `.railway-env-*.txt`.
- Trust chat memory over the files and live Git.
- Edit any Tabtep worktree, or read `../Tabtep-App/docs/API-CONTRACT.md`.
