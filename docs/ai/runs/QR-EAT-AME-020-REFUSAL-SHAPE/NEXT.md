# NEXT — QR-EAT-AME-020-REFUSAL-SHAPE

<!--
Bookmark only. TASK.md and live Git are authoritative.
Update at phase boundaries, before compaction, and before ending a session.
-->

Updated: 2026-11-20

Task contract: `TASK.md`
Task revision: 1 (planning; awaiting owner approval)

Current step: commit gate — awaiting owner authorization, then the CI gate

Last completed:

- Revision 1 implemented and reviewed (`REVIEW-01.md`); revision 2 added the
  status-route normalisation.
- `REVIEW-02.md`: PASS WITH NOTES, F-1 closed, 16-route sweep found no remaining
  order-id leak. R-01/R-02/R-03 and N-01–N-06 recorded.
- Harness at 18 assertions; full suite 1709 passed / 11 skipped; integration
  18/18 twice.
- No commit, push, CI run, deploy or shared-database action.

In progress:

- Nothing. Commit authorization pending.

Next action:

- On authorization: commit, push `fix/ame-020-refusal-shape`, require both CI jobs
  green, then the merge/deploy decision.

Blockers:

- CI cannot run until the push.

Open decisions:

- Merge after both jobs green.
- Platform-admin status mutation policy (tracked separately).
- `modify` 500→404 follow-up; other resource helpers' refusal shape.
