# NEXT — QR-EAT-AME-016-SSE-RECONNECT

<!--
Bookmark only. TASK.md and live Git are authoritative.
Update at phase boundaries, before compaction, and before ending a session.
-->

Updated: 2026-11-19

Task contract: `TASK.md`
Task revision: 1 (approved 2026-11-19)

Current step: commit gate — awaiting owner authorization

Last completed:

- Revision 1 approved and implemented on `fix/ame-016-sse-reconnect`.
- Session teardown separated from full disposal; reconnect preserves
  subscriber listeners; deliberate close cannot schedule a second reconnect;
  NOTIFY publication is ownership-gated (S4 / `AME-018`).
- `REVIEW-01.md`: PASS WITH NOTES (N-01–N-07), no blocker/high finding.
  N-01/N-03 accepted with rationale; N-02/N-06 corrected by the Lead;
  N-04/N-05/N-07 recorded.
- Red proof 5 failed / 1 passed; focused 25 tests; full suite 1667 passed / 11
  skipped; verifier independently reproduced the real-PostgreSQL reconnect
  probe (1 frame post-fix, 0 pre-fix).
- No commit, push, deploy, migration or seed action.

In progress:

- Nothing. Commit authorization pending.

Next action:

- On authorization: local commit with the published message and path list, then
  decide the release step separately.

Blockers:

- Owner commit authorization.

Open decisions:

- Commit only, or commit and deploy with the same smoke as AME-015.
- `AME-019` (CI VAPID secret) still makes CI red.

Read first:

- `TASK.md`
- `REVIEW-01.md`
- `RUN_LOG.md`

Read first:

- `TASK.md`
- `RUN_LOG.md`
- latest `REVIEW-*.md` (none yet)

Do not:

- Merge, push or deploy without the required approval.
- Change scope without a new task revision.
- Print secrets or PII.
- Trust chat memory over the files and live Git.
