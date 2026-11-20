# NEXT — QR-EAT-AME-013-TENANT-HARNESS

<!--
Bookmark only. TASK.md and live Git are authoritative.
Update at phase boundaries, before compaction, and before ending a session.
-->

Updated: 2026-11-20

Task contract: `TASK.md`
Task revision: 2 (approved 2026-11-20)

Current step: complete (committed, both CI jobs green, merged and deployed)

Last completed:

- Revision 1 approved and implemented; revision 2 approved after the harness
  found a product gap.
- `REVIEW-01.md` PASS WITH NOTES; correction cycle 1 for R-01/R-02.
- `REVIEW-02.md` PASS WITH NOTES: templates match the seed programmatically;
  cleanup is ownership-based and four foreign sentinels survive; no time
  predicate; anonymous RBAC window 5–10 ms documented (L-02).
- Commit `f92599e`; CI run `44685856443` **success** — `verify` 1m47s and the new
  `integration` job 53s (postgres:16, migrate deploy, 17 tests).
- Merge `df4b6bf`; Railway deployment
  `76a24002-f404-43bb-b223-2bc89f877dff` `SUCCESS`; health UP, root 200, SSE 401,
  no migration, app code unchanged.
- `AME-020` opened from the harness finding; `AME-013` closed.

In progress:

- Nothing.

Next action:

- `AME-020` (`R2`, ready): normalise `GET /api/orders/[id]` cross-tenant to the
  same not-found shape and the anonymous SSE refusal to 401. Route/auth surface —
  needs its own task and approval.
- Then the pilot pre-gate decision, then B3-C in `../Tabtep-App`.

Blockers:

- None.

Open decisions:

- `AME-020` before or after the pilot gate.
- Whether the pilot gate is satisfied once `AME-020` lands.

Read first:

- `TASK.md`
- `REVIEW-02.md`
- `RUN_LOG.md` (Release section)

Do not:

- Treat the harness as covering routes it does not list; new tenant-bearing
  routes must be added to `tenant-isolation.it.ts`.
- Treat L-02 (anonymous RBAC window) as resolved.
- Print secrets or PII.
- Trust chat memory over the files and live Git.
