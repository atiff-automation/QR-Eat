# NEXT — QR-EAT-LOYALTY-PROMO-V1

<!--
Bookmark only. TASK.md and live Git are authoritative.
Update at phase boundaries, before compaction, and before ending a session.
-->

Updated: 2026-11-13

Task contract: `docs/ai/runs/QR-EAT-LOYALTY-PROMO-V1/TASK.md`
Task revision: 2

Current step: P3 gate PASSED (uncommitted) — P4 next

Last completed:
- P0 baseline PASS (`fc1312a`).
- P1 schema + migrations authored and reviewed (R-03/R-04/R-07 corrected).
- P1 DB evidence: 5 migrations applied to `qrorder_dev`; 7 CHECKs validated.
- **R-08 fixed**: `uuid[]` did not round-trip → revision 2 join tables.
  `REVIEW-03` closed **R-08 and R-02**; `migrate diff` live DB → datamodel **empty**;
  migrations `20261113120000`, `20261113120100`, `20261113130000` **frozen**.
- **P2 pricing engine** (`src/lib/loyalty/**`, 6 modules + 6 test suites) — committed `27cd38a`.
- **P3 member/consent/quote services** — `flags`, `phone`, `consent`, customer + quote
  services, 107 tests; full suite 803 passed. `REVIEW-05` PASS WITH NOTES.

In progress:
- nothing — P3 reviewed, awaiting commit authorization

Next action:
1. Commit P3 (R3 gate, needs authorization).
2. Hand P4 (QR quote/create API) to one `ame-implementer`.

Blockers:
- none. R-04 (untracked work) is closed by the checkpoint commit `27cd38a`.

Carried obligations:
- P4: validate `expectedTotal`; enforce session/table binding in `consumeQuote`; do **not**
  render "Loyalty is off" for the member-resolution race (N-01); assert tenant-scoped
  `where` in cross-tenant tests.
- P6: null `Order.customerName`/`customerPhone` in the delete flow (F-05).
- P10: record the N-01 contract gap (no code for "member could not be resolved").

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
