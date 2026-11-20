# NEXT — QR-EAT-AME-013-TENANT-HARNESS

<!--
Bookmark only. TASK.md and live Git are authoritative.
Update at phase boundaries, before compaction, and before ending a session.
-->

Updated: 2026-11-20

Task contract: `TASK.md`
Task revision: 2 (approved 2026-11-20)

Current step: commit gate — awaiting owner authorization, then the CI gate

Last completed:

- `REVIEW-01.md` PASS WITH NOTES; correction cycle 1 for R-01/R-02.
- `REVIEW-02.md` PASS WITH NOTES: R-01 and R-02 closed (templates matched
  programmatically; sentinels survive; no time predicate). L-01/L-03/L-04 handled
  by the Lead; L-02/N-01–N-04 recorded.
- Product gap recorded as `AME-020`.
- No commit, push, CI run, deploy or shared-database action.

In progress:

- Nothing. Commit authorization pending.

Next action:

- On authorization: commit, push `feat/ame-013-tenant-harness`, and require
  **both** CI jobs green — the integration job will run for the first time.
- Only then decide the merge.

Blockers:

- The integration CI job is unproven until pushed.

Open decisions:

- Merge after both jobs are green.
- `AME-020` before or after the pilot gate.

Read first:

- `TASK.md`
- `RUN_LOG.md`

Do not:

- Point the harness at a shared, staging or production database.
- Change routes or tenant guards to make a test pass.
- Print secrets, database URLs with credentials, or PII.
