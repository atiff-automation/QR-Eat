# NEXT — QR-EAT-LOYALTY-PROMO-V1

<!--
Bookmark only. TASK.md and live Git are authoritative.
Update at phase boundaries, before compaction, and before ending a session.
-->

Updated: 2026-11-13

Task contract: `docs/ai/runs/QR-EAT-LOYALTY-PROMO-V1/TASK.md`
Task revision: 2 (approved 2026-11-13)

Current step: P6B committed (37ae549). P6C scope approved but NOT implemented. P7 not started.

Last completed:
- P0 baseline PASS (`fc1312a`).
- P1 schema + migrations authored and reviewed (R-03/R-04/R-07 corrected).
- P1 DB evidence: 5 migrations applied to `qrorder_dev`; 7 CHECKs validated.
- **R-08 fixed**: `uuid[]` did not round-trip → revision 2 join tables.
  `REVIEW-03` closed **R-08 and R-02**; `migrate diff` live DB → datamodel **empty**;
  migrations `20261113120000`, `20261113120100`, `20261113130000` **frozen**.
- **P2 pricing engine** (`src/lib/loyalty/**`, 6 modules + 6 test suites) — committed `27cd38a`.
- **P3 member/consent/quote services** — committed `12bdcdf`; 107 tests.
- **P4 QR quote/create API** — quote route, loyalty-aware create, `loyaltyNotice`,
  `loyalty-qr-service`; 98 tests; full suite 867 passed. Legacy flag-off path proven
  byte-identical to base. `REVIEW-06` PASS WITH NOTES.

In progress:
- nothing running

Next action:
1. Hand **P6C** (UI) to one `ame-implementer`: QR pages, owner dashboard screens, and the
   approved phone-input rule (P6C scope note in `TASK.md`, committed `de1f64b`).
   Nothing of P6C exists yet — no components, no pages.
2. Then P7 (security), which must verify R-02 rather than rebuild it, and owns F-08.
3. P9 checklist: run `evidence/dev-pii-cleanup.sql` on any environment created before
   the P6B normalisation.

Blockers:
- none. R-04 (untracked work) is closed by the checkpoint commit `27cd38a`.

Carried obligations:
- P5: §18.20.14 I — re-evaluate stored `OrderDiscount` when an unpaid order changes, so the
  quote and the stored discount cannot visibly diverge.
- P7: tighten the generic `console.error` so a Prisma validation error cannot log input.
- P6: null `Order.customerName`/`customerPhone` in the delete flow (F-05).
- P10: record the `MEMBER_RESOLUTION_FAILED` / `LOYALTY_DISABLED` contract gap; confirm the
  quote route's generic request codes are permitted.

Open decisions:
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
