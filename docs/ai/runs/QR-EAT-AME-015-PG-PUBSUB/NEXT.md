# NEXT — QR-EAT-AME-015-PG-PUBSUB

<!--
Bookmark only. TASK.md and live Git are authoritative.
Update at phase boundaries, before compaction, and before ending a session.
-->

Updated: 2026-11-19

Task contract: `TASK.md`
Task revision: 2 (approved 2026-11-19)

Current step: commit gate — awaiting owner authorization

Last completed:

- Revision 1 approved, implemented, amended by revision 2 after F-1
  (single-flight is per module instance, not per process).
- `REVIEW-01.md` PASS WITH NOTES → correction cycle 1 (R-01–R-05, subscribe-side
  R-06 variants, committable evidence, portable harness).
- `REVIEW-02.md` PASS WITH NOTES → correction cycle 2 (initialize generation
  guard; N-2 evidence correction).
- `REVIEW-03.md` PASS WITH NOTES: F-1/R-06 and N-2 closed by independent probe
  and mutation; N-6 NOTIFY connection leak accepted as residual (low); N-7
  wording corrected by the Lead.
- Final verification: focused 19 tests, `staff-sse-signals` 5, full 1661 passed
  / 11 skipped, type-check clean, build clean, 0 owned lint findings.
- Integration re-measured after cycle 2: `duplicateFrames` 0, tenant isolation
  clean, additive coverage 1, reproducible twice.
- No commit, push, deploy, migration or seed action.

In progress:

- Nothing. Commit authorization pending.

Next action:

- On authorization: create the local commit with the published message and exact
  path list, verify the committed tree matches the reviewed hashes, then update
  the run log and `ACTIVE.md`.
- Push, deploy or production migration remain separate, unapproved gates.

Blockers:

- Owner commit authorization.

Open decisions:

- Approve adding `AME-018` (NOTIFY client publication race) as a deferred
  backlog item for N-6.
- Whether to run the pilot pre-gate now that AME-015 is ready to commit.

Read first:

- `TASK.md`
- `REVIEW-03.md`
- `RUN_LOG.md`

Do not:

- Push, deploy or migrate without a separate explicit approval.
- Change scope without a new task revision.
- Print secrets or PII.
- Trust chat memory over the files and live Git.
