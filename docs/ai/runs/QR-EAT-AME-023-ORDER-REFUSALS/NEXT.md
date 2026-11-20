# NEXT — QR-EAT-AME-023-ORDER-REFUSALS

<!--
Bookmark only. TASK.md and live Git are authoritative.
Update at phase boundaries, before compaction, and before ending a session.
-->

Updated: 2026-11-21

Task contract: `TASK.md`
Task revision: 1 (approved 2026-11-20)

Current step: complete (committed, both CI jobs green, merged and deployed)

Last completed:

- Revision 1 implemented and reviewed (`REVIEW-01.md` PASS WITH NOTES).
- Shared response-only helper; anonymous 401 on the order routes (production
  confirmed); `modify` refusals `404`; audit-event behaviour recorded (L-01).
- Commit `4c2ab2d`; CI `44797626219` success (verify, integration 20 assertions);
  merge `2eae635`; deployment `636888ff…` SUCCESS; health UP; anonymous order
  read and SSE both `401` with the shared body; no migration.
- S3 audit refined `AME-024`: path-id routes first; most restaurant sites pass
  `context.restaurantId` and are not caller-probeable.

In progress:

- Nothing.

Next action:

- `AME-024` (`R2`, ready): table and `restaurants/[id]` refusal-shape
  normalisation, starting with the path-id routes. Use the audit table.
- Record the pilot pre-gate decision.
- `AME-022` (`R3`, ready) is a policy decision: platform-admin business-data
  mutation. `AME-021` (RLS) stays deferred.

Blockers:

- None.

Open decisions:

- Pilot pre-gate: is it satisfied now, or after `AME-024`?
- `AME-022` admin policy.

Read first:

- `TASK.md`
- `REVIEW-01.md`
- `RUN_LOG.md` (Release section)

Do not:

- Treat table/restaurant refusal shapes as fixed; `AME-024` owns them.
- Treat platform-admin status mutation as resolved; `AME-022`.
- Print secrets or PII.
- Trust chat memory over the files and live Git.
